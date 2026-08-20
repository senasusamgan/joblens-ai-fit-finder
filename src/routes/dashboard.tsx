import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Clock3,
  Sparkles,
  Target,
  Trophy,
  BellRing,
  AlertTriangle,
  Check,
  Mail,
  RefreshCw,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { supabase } from "@/integrations/supabase/client";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  loadApplications,
  formatDate,
  updateApplication,
} from "@/lib/applications";
import {
  migrateGuestApplicationsToCloud,
  saveApplicationForCurrentUser,
  updateCloudApplication,
} from "@/lib/cloud-applications";
import {
  migrateGuestRemindersToCloud,
  updateCloudReminder,
} from "@/lib/cloud-reminders";
import {
  loadReminders,
  updateReminder,
  type Reminder,
} from "@/lib/reminders";
import {
  connectGmail,
  hasGmailToken,
  rememberGoogleProviderToken,
  scanGmailForJobSignals,
  type GmailSignal,
} from "@/lib/gmail";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — JobLens AI" },
      {
        name: "description",
        content:
          "See your application pipeline, AI match insights and next actions in one place.",
      },
    ],
  }),
  component: DashboardPage,
});

const ACTIVE_STATUSES: ApplicationStatus[] = [
  "Saved",
  "Applied",
  "Interview",
  "Case",
];

const statusAccent: Record<ApplicationStatus, string> = {
  Saved: "bg-[color:var(--color-muted-foreground)]",
  Applied: "bg-[color:var(--color-info)]",
  Interview: "bg-[color:var(--color-primary)]",
  Case: "bg-[color:var(--color-accent)]",
  Offer: "bg-[color:var(--color-success)]",
  Rejected: "bg-[color:var(--color-danger)]",
};

function suggestCompanyFromSignal(signal: GmailSignal): string {
  const displayName = signal.from
    .split("<")[0]
    .replace(/^["']|["']$/g, "")
    .trim();

  if (displayName && !displayName.includes("@")) {
    return displayName
      .replace(/^["']+|["']+$/g, "")
      .replace(/\.(com|io)$/i, "")
      .trim();
  }

  const emailMatch = signal.from.match(/@([^>\s]+)/);

  if (!emailMatch) return "";

  const domain = emailMatch[1]
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .trim();

  return domain
    ? domain.charAt(0).toUpperCase() + domain.slice(1)
    : "";
}

function DashboardPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [ready, setReady] = useState(false);
  const [cloudMode, setCloudMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailSignals, setGmailSignals] = useState<GmailSignal[]>([]);
  const [gmailScanned, setGmailScanned] = useState(false);

  const [gmailApplicationSelection, setGmailApplicationSelection] =
    useState<Record<string, string>>({});
  const [gmailApplyingId, setGmailApplyingId] = useState<string | null>(null);

  const [gmailNewSignalId, setGmailNewSignalId] =
    useState<string | null>(null);
  const [gmailNewJobTitle, setGmailNewJobTitle] = useState("");
  const [gmailNewCompanyName, setGmailNewCompanyName] = useState("");

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      setReady(false);
      setLoadError(null);

      try {
        const applications = await migrateGuestApplicationsToCloud();
        const reminderList = await migrateGuestRemindersToCloud();

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        rememberGoogleProviderToken(session);

        setCloudMode(Boolean(session));
        setGmailConnected(Boolean(session) && hasGmailToken());
        setApps(applications);
        setReminders(reminderList);
      } catch (error) {
        console.error("[JobLens Dashboard] Could not load applications:", error);

        if (!mounted) return;

        setCloudMode(false);
        setGmailConnected(false);
        setApps(loadApplications());
        setReminders(loadReminders());
        setLoadError(
          "Cloud insights could not be loaded. Showing browser data instead.",
        );
      } finally {
        if (mounted) setReady(true);
      }
    };

    void hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        rememberGoogleProviderToken(nextSession);
      }

      if (event === "SIGNED_OUT") {
        setGmailConnected(false);
        setGmailSignals([]);
        setGmailScanned(false);
      }

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void hydrate();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const insights = useMemo(() => {
    const scored = apps.filter(
      (app) => typeof app.matchScore === "number",
    );

    const averageMatch =
      scored.length > 0
        ? Math.round(
            scored.reduce((sum, app) => sum + (app.matchScore ?? 0), 0) /
              scored.length,
          )
        : null;

    return {
      total: apps.length,
      active: apps.filter((app) => ACTIVE_STATUSES.includes(app.status)).length,
      averageMatch,
      strongFits: scored.filter((app) => (app.matchScore ?? 0) >= 75).length,
    };
  }, [apps]);

  const recentApplications = useMemo(
    () =>
      [...apps]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [apps],
  );

  const statusCounts = useMemo(
    () =>
      APPLICATION_STATUSES.map((status) => ({
        status,
        count: apps.filter((app) => app.status === status).length,
      })),
    [apps],
  );

  const pendingReminders = useMemo(
    () =>
      reminders
        .filter((reminder) => !reminder.completedAt)
        .sort(
          (a, b) =>
            new Date(a.dueAt).getTime() -
            new Date(b.dueAt).getTime(),
        ),
    [reminders],
  );

  const overdueReminders = useMemo(
    () =>
      pendingReminders.filter(
        (reminder) =>
          new Date(reminder.dueAt).getTime() < Date.now(),
      ),
    [pendingReminders],
  );

  const upcomingReminders = useMemo(
    () =>
      pendingReminders.filter(
        (reminder) =>
          new Date(reminder.dueAt).getTime() >= Date.now(),
      ),
    [pendingReminders],
  );

  const completeReminder = async (reminder: Reminder) => {
    const completedAt = new Date().toISOString();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const updated = await updateCloudReminder(reminder.id, {
          completedAt,
        });

        setCloudMode(true);
        setReminders((current) =>
          current.map((item) =>
            item.id === reminder.id ? updated : item,
          ),
        );
      } else {
        setCloudMode(false);
        setReminders(
          updateReminder(reminder.id, {
            completedAt,
          }),
        );
      }
    } catch (error) {
      console.error(
        "[JobLens Dashboard] Could not complete reminder:",
        error,
      );
      setLoadError(
        "We couldn’t update this reminder. Please try again.",
      );
    }
  };

  const handleConnectGmail = async () => {
    setGmailBusy(true);
    setGmailError(null);

    try {
      await connectGmail();
    } catch (error) {
      console.error("[JobLens Gmail] Connect failed:", error);
      setGmailError(
        "Gmail could not be connected. Please try again.",
      );
      setGmailBusy(false);
    }
  };

  const handleScanGmail = async () => {
    setGmailBusy(true);
    setGmailError(null);
    setGmailScanned(false);

    try {
      const signals = await scanGmailForJobSignals();

      setGmailSignals(signals);
      setGmailApplicationSelection({});
      setGmailNewSignalId(null);
      setGmailNewJobTitle("");
      setGmailNewCompanyName("");
      setGmailScanned(true);
      setGmailConnected(true);
    } catch (error) {
      console.error("[JobLens Gmail] Scan failed:", error);

      const message =
        error instanceof Error ? error.message : "";

      if (message === "GMAIL_AUTH_REQUIRED") {
        setGmailConnected(false);
        setGmailError(
          "Gmail permission is missing or expired. Reconnect Gmail to scan again.",
        );
      } else {
        setGmailError(
          "JobLens couldn’t scan Gmail right now. Please try again.",
        );
      }
    } finally {
      setGmailBusy(false);
    }
  };

  const applyGmailSignal = async (signal: GmailSignal) => {
    const applicationId =
      gmailApplicationSelection[signal.messageId];

    if (!applicationId) {
      setGmailError(
        "Choose an application before applying this Gmail signal.",
      );
      return;
    }

    const application = apps.find(
      (app) => app.id === applicationId,
    );

    if (!application) {
      setGmailError("That application could not be found.");
      return;
    }

    setGmailApplyingId(signal.messageId);
    setGmailError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const updated = await updateCloudApplication(
          applicationId,
          {
            status: signal.suggestedStatus,
          },
        );

        setApps((current) =>
          current.map((app) =>
            app.id === applicationId ? updated : app,
          ),
        );
      } else {
        const updatedApps = updateApplication(
          applicationId,
          {
            status: signal.suggestedStatus,
          },
        );

        setApps(updatedApps);
      }

      setGmailSignals((current) =>
        current.filter(
          (item) => item.messageId !== signal.messageId,
        ),
      );

      setGmailApplicationSelection((current) => {
        const next = { ...current };
        delete next[signal.messageId];
        return next;
      });
    } catch (error) {
      console.error(
        "[JobLens Gmail] Could not apply signal:",
        error,
      );

      setGmailError(
        "JobLens couldn’t update this application. Please try again.",
      );
    } finally {
      setGmailApplyingId(null);
    }
  };

  const openNewApplicationFromSignal = (
    signal: GmailSignal,
  ) => {
    setGmailNewSignalId(signal.messageId);
    setGmailNewJobTitle("");
    setGmailNewCompanyName(
      suggestCompanyFromSignal(signal),
    );
    setGmailError(null);
  };

  const addGmailSignalAsApplication = async (
    signal: GmailSignal,
  ) => {
    const jobTitle = gmailNewJobTitle.trim();
    const companyName = gmailNewCompanyName.trim();

    if (!jobTitle) {
      setGmailError(
        "Enter the job or program title before adding it to the tracker.",
      );
      return;
    }

    if (!companyName) {
      setGmailError(
        "Enter the company or organization name before adding it to the tracker.",
      );
      return;
    }

    setGmailApplyingId(signal.messageId);
    setGmailError(null);

    try {
      const created =
        await saveApplicationForCurrentUser({
          jobTitle,
          companyName,
          status: signal.suggestedStatus,
        });

      setApps((current) => [
        created,
        ...current.filter(
          (app) => app.id !== created.id,
        ),
      ]);

      setGmailSignals((current) =>
        current.filter(
          (item) =>
            item.messageId !== signal.messageId,
        ),
      );

      setGmailNewSignalId(null);
      setGmailNewJobTitle("");
      setGmailNewCompanyName("");
    } catch (error) {
      console.error(
        "[JobLens Gmail] Could not create application:",
        error,
      );

      setGmailError(
        "JobLens couldn’t add this opportunity to the tracker. Please try again.",
      );
    } finally {
      setGmailApplyingId(null);
    }
  };

  const dismissGmailSignal = (signal: GmailSignal) => {
    setGmailSignals((current) =>
      current.filter(
        (item) => item.messageId !== signal.messageId,
      ),
    );

    setGmailApplicationSelection((current) => {
      const next = { ...current };
      delete next[signal.messageId];
      return next;
    });

    if (gmailNewSignalId === signal.messageId) {
      setGmailNewSignalId(null);
      setGmailNewJobTitle("");
      setGmailNewCompanyName("");
    }

    setGmailError(null);
  };

  return (
    <div className="min-h-screen">
      <SiteNav />

      <main className="px-5 pb-24 pt-10 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                <BarChart3 className="h-3.5 w-3.5" />
                Application intelligence
              </div>

              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Your job search,
                <span className="gradient-text"> at a glance.</span>
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-white/55 md:text-base">
                Understand your pipeline, AI match quality and what deserves
                your attention next.
              </p>
            </div>

            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Sparkles className="h-4 w-4" />
              Analyze a Job
            </Link>
          </div>

          {!ready ? (
            <div className="mt-10 text-sm text-white/45">
              Loading your dashboard…
            </div>
          ) : (
            <>
              {loadError && (
                <div className="mt-6 rounded-xl border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning)]/10 px-4 py-3 text-sm text-white/75">
                  {loadError}
                </div>
              )}

              <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard
                  label="Total Applications"
                  value={insights.total.toString()}
                  detail="Tracked opportunities"
                  icon={Briefcase}
                />

                <MetricCard
                  label="Active Pipeline"
                  value={insights.active.toString()}
                  detail="Still in progress"
                  icon={Clock3}
                />

                <MetricCard
                  label="Average AI Match"
                  value={
                    insights.averageMatch === null
                      ? "—"
                      : `${insights.averageMatch}%`
                  }
                  detail="Across scored roles"
                  icon={Target}
                />

                <MetricCard
                  label="Strong Fits"
                  value={insights.strongFits.toString()}
                  detail="75%+ AI match"
                  icon={Trophy}
                />
              </section>

              <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <section className="card-surface p-6">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Application Pipeline
                    </h2>
                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      Where your current opportunities stand.
                    </p>
                  </div>

                  <div className="mt-6 space-y-4">
                    {statusCounts.map(({ status, count }) => {
                      const percentage =
                        apps.length === 0 ? 0 : (count / apps.length) * 100;

                      return (
                        <div key={status}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="text-[color:var(--color-muted-foreground)]">{status}</span>
                            <span className="font-medium text-[color:var(--color-surface-foreground)]">
                              {count}
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
                            <div
                              className={`h-full rounded-full ${statusAccent[status]}`}
                              style={{
                                width:
                                  count === 0
                                    ? "0%"
                                    : `${Math.max(percentage, 5)}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Link
                    to="/applications"
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-primary)] transition hover:opacity-75"
                  >
                    Open application tracker
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </section>

                <section className="card-surface p-6">
                  <h2 className="text-lg font-semibold">Next Actions</h2>
                  <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                    Small signals from your current pipeline.
                  </p>

                  <div className="mt-5 space-y-5">
                    {overdueReminders.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-danger)]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Overdue
                        </div>

                        <div className="space-y-2">
                          {overdueReminders.slice(0, 4).map((reminder) => (
                            <ReminderAction
                              key={reminder.id}
                              reminder={reminder}
                              application={apps.find(
                                (app) => app.id === reminder.applicationId,
                              )}
                              overdue
                              onComplete={completeReminder}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {upcomingReminders.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-primary)]">
                          <BellRing className="h-3.5 w-3.5" />
                          Upcoming
                        </div>

                        <div className="space-y-2">
                          {upcomingReminders.slice(0, 4).map((reminder) => (
                            <ReminderAction
                              key={reminder.id}
                              reminder={reminder}
                              application={apps.find(
                                (app) => app.id === reminder.applicationId,
                              )}
                              onComplete={completeReminder}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {pendingReminders.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-5">
                        <p className="text-sm font-medium text-[color:var(--color-surface-foreground)]">
                          No upcoming actions
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                          Add a reminder from any application to keep follow-ups,
                          interviews and deadlines visible here.
                        </p>

                        <Link
                          to="/applications"
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-primary)] hover:opacity-75"
                        >
                          Open applications
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <section className="card-surface mt-6 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-[color:var(--color-primary)]" />
                      <h2 className="text-lg font-semibold">
                        Gmail Job Signals
                      </h2>
                    </div>

                    <p className="mt-1 max-w-2xl text-sm text-[color:var(--color-muted-foreground)]">
                      Scan recent recruitment emails for application,
                      interview, assessment, offer and rejection signals.
                    </p>
                  </div>

                  {!cloudMode ? (
                    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-2.5 text-sm text-[color:var(--color-muted-foreground)]">
                      Sign in to connect Gmail
                    </div>
                  ) : !gmailConnected ? (
                    <button
                      type="button"
                      onClick={handleConnectGmail}
                      disabled={gmailBusy}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      <Mail className="h-4 w-4" />
                      Connect Gmail
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleScanGmail}
                      disabled={gmailBusy}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${gmailBusy ? "animate-spin" : ""}`}
                      />
                      {gmailBusy ? "Scanning…" : "Scan Gmail now"}
                    </button>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-3 text-xs text-[color:var(--color-muted-foreground)]">
                  Gmail access is read-only. JobLens scans only when you ask
                  and does not store email content in your tracker.
                </div>

                {gmailError && (
                  <p className="mt-4 text-sm text-[color:var(--color-danger)]">
                    {gmailError}
                  </p>
                )}

                {gmailScanned && gmailSignals.length === 0 && (
                  <div className="mt-5 rounded-xl border border-dashed border-[color:var(--color-border)] p-5">
                    <p className="text-sm font-medium text-[color:var(--color-surface-foreground)]">
                      No job signals found
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      No clear recruitment update was detected in the recent
                      emails scanned.
                    </p>
                  </div>
                )}

                {gmailSignals.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium text-[color:var(--color-surface-foreground)]">
                        {gmailSignals.length} potential job{" "}
                        {gmailSignals.length === 1 ? "signal" : "signals"}
                      </p>

                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        Review only · No status changed
                      </span>
                    </div>

                    {gmailSignals.slice(0, 10).map((signal) => (
                      <div
                        key={signal.messageId}
                        className="rounded-xl border border-[color:var(--color-border)] p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[color:var(--color-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--color-primary)]">
                                {signal.kind}
                              </span>

                              <span className="text-xs text-[color:var(--color-muted-foreground)]">
                                {signal.confidence} confidence
                              </span>
                            </div>

                            <p className="mt-2 break-words text-sm font-semibold text-[color:var(--color-surface-foreground)]">
                              {signal.subject || "Recruitment email"}
                            </p>

                            {signal.from && (
                              <p className="mt-1 break-words text-xs text-[color:var(--color-muted-foreground)]">
                                {signal.from}
                              </p>
                            )}

                            {signal.snippet && (
                              <p className="mt-2 line-clamp-2 text-sm text-[color:var(--color-muted-foreground)]">
                                {signal.snippet}
                              </p>
                            )}
                          </div>

                          <div className="w-full shrink-0 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3 sm:w-72">
                            <p className="text-xs text-[color:var(--color-muted-foreground)]">
                              Suggested status
                            </p>

                            <p className="mt-0.5 text-sm font-semibold text-[color:var(--color-surface-foreground)]">
                              {signal.suggestedStatus}
                            </p>

                            <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
                              <p className="text-xs font-semibold text-[color:var(--color-surface-foreground)]">
                                Link to existing
                              </p>

                              <select
                                id={`gmail-app-${signal.messageId}`}
                                aria-label="Choose existing application"
                                value={
                                  gmailApplicationSelection[
                                    signal.messageId
                                  ] ?? ""
                                }
                                onChange={(event) =>
                                  setGmailApplicationSelection(
                                    (current) => ({
                                      ...current,
                                      [signal.messageId]:
                                        event.target.value,
                                    }),
                                  )
                                }
                                className="mt-1.5 w-full rounded-lg border border-[color:var(--color-border)] bg-white px-2.5 py-2 text-xs text-[color:var(--color-surface-foreground)]"
                              >
                                <option value="">
                                  Choose application…
                                </option>

                                {apps.map((app) => (
                                  <option
                                    key={app.id}
                                    value={app.id}
                                  >
                                    {app.jobTitle} ·{" "}
                                    {app.companyName || "Company"}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={() =>
                                  applyGmailSignal(signal)
                                }
                                disabled={
                                  !gmailApplicationSelection[
                                    signal.messageId
                                  ] ||
                                  gmailApplyingId ===
                                    signal.messageId
                                }
                                className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                                style={{
                                  background:
                                    "var(--gradient-hero)",
                                }}
                              >
                                {gmailApplyingId ===
                                signal.messageId
                                  ? "Updating…"
                                  : "Link & Update"}
                              </button>
                            </div>

                            <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
                              {gmailNewSignalId ===
                              signal.messageId ? (
                                <div className="space-y-2.5">
                                  <div>
                                    <label
                                      htmlFor={`gmail-company-${signal.messageId}`}
                                      className="block text-xs font-medium text-[color:var(--color-muted-foreground)]"
                                    >
                                      Company / organization
                                    </label>

                                    <input
                                      id={`gmail-company-${signal.messageId}`}
                                      value={gmailNewCompanyName}
                                      onChange={(event) =>
                                        setGmailNewCompanyName(
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-white px-2.5 py-2 text-xs text-[color:var(--color-surface-foreground)]"
                                      placeholder="e.g. Youthall"
                                    />

                                    <p className="mt-1 text-[11px] text-[color:var(--color-muted-foreground)]">
                                      Suggested from sender — edit if needed.
                                    </p>
                                  </div>

                                  <div>
                                    <label
                                      htmlFor={`gmail-title-${signal.messageId}`}
                                      className="block text-xs font-medium text-[color:var(--color-muted-foreground)]"
                                    >
                                      Job / program title
                                    </label>

                                    <input
                                      id={`gmail-title-${signal.messageId}`}
                                      value={gmailNewJobTitle}
                                      onChange={(event) =>
                                        setGmailNewJobTitle(
                                          event.target.value,
                                        )
                                      }
                                      className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-white px-2.5 py-2 text-xs text-[color:var(--color-surface-foreground)]"
                                      placeholder="Enter the real title"
                                    />
                                  </div>

                                  <div className="rounded-lg border border-[color:var(--color-border)] bg-white px-2.5 py-2 text-xs">
                                    <span className="text-[color:var(--color-muted-foreground)]">
                                      Starting status
                                    </span>
                                    <span className="ml-2 font-semibold text-[color:var(--color-surface-foreground)]">
                                      {signal.suggestedStatus}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      addGmailSignalAsApplication(
                                        signal,
                                      )
                                    }
                                    disabled={
                                      gmailApplyingId ===
                                      signal.messageId
                                    }
                                    className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                                    style={{
                                      background:
                                        "var(--gradient-hero)",
                                    }}
                                  >
                                    {gmailApplyingId ===
                                    signal.messageId
                                      ? "Adding…"
                                      : "Add to Tracker"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setGmailNewSignalId(null);
                                      setGmailNewJobTitle("");
                                      setGmailNewCompanyName("");
                                    }}
                                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-xs font-medium text-[color:var(--color-surface-foreground)] hover:bg-[color:var(--color-muted)]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openNewApplicationFromSignal(
                                      signal,
                                    )
                                  }
                                  className="w-full rounded-lg border border-[color:var(--color-primary)]/30 bg-[color:var(--color-primary)]/5 px-3 py-2 text-xs font-semibold text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary)]/10"
                                >
                                  + Add as New Application
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                dismissGmailSignal(signal)
                              }
                              className="mt-3 w-full rounded-lg px-3 py-2 text-xs font-medium text-[color:var(--color-muted-foreground)] transition hover:bg-white hover:text-[color:var(--color-surface-foreground)]"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="card-surface mt-6 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Recent Applications
                    </h2>
                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      Your latest tracker activity.
                    </p>
                  </div>

                  <Link
                    to="/applications"
                    className="text-sm font-medium text-[color:var(--color-primary)] transition hover:opacity-75"
                  >
                    View all
                  </Link>
                </div>

                {recentApplications.length === 0 ? (
                  <p className="mt-6 text-sm text-white/45">
                    No applications yet.
                  </p>
                ) : (
                  <div className="mt-5 divide-y divide-white/5">
                    {recentApplications.map((app) => (
                      <div
                        key={app.id}
                        className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[color:var(--color-surface-foreground)]">
                            {app.jobTitle}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-[color:var(--color-muted-foreground)]">
                            {app.companyName || "Company not specified"}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          {typeof app.matchScore === "number" && (
                            <span className="rounded-full bg-[color:var(--color-muted)] px-2.5 py-1 text-[color:var(--color-muted-foreground)]">
                              {app.matchScore}% match
                            </span>
                          )}

                          <span className="rounded-full border border-[color:var(--color-border)] px-2.5 py-1 text-[color:var(--color-muted-foreground)]">
                            {app.status}
                          </span>

                          <span className="hidden text-[color:var(--color-muted-foreground)] sm:inline">
                            {formatDate(app.updatedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <p className="mt-8 text-center text-xs text-white/35">
                {cloudMode
                  ? "Signed in · Dashboard insights use your synced account data."
                  : "Guest mode · Dashboard insights use this browser's data."}
                {" "}No CV text is stored in the tracker.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-muted-foreground)]">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">{detail}</p>
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--color-muted)] text-[color:var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ReminderAction({
  reminder,
  application,
  overdue = false,
  onComplete,
}: {
  reminder: Reminder;
  application?: Application;
  overdue?: boolean;
  onComplete: (reminder: Reminder) => void;
}) {
  const due = new Date(reminder.dueAt);

  const dateLabel = Number.isNaN(due.getTime())
    ? ""
    : due.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--color-surface-foreground)]">
            {reminder.title}
          </p>

          {application && (
            <p className="mt-0.5 truncate text-xs text-[color:var(--color-muted-foreground)]">
              {application.jobTitle}
              {application.companyName
                ? ` · ${application.companyName}`
                : ""}
            </p>
          )}

          <p
            className={`mt-2 text-xs font-medium ${
              overdue
                ? "text-[color:var(--color-danger)]"
                : "text-[color:var(--color-primary)]"
            }`}
          >
            {overdue ? "Overdue · " : ""}
            {dateLabel}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onComplete(reminder)}
          title="Mark as done"
          aria-label={`Mark ${reminder.title} as done`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[color:var(--color-border)] bg-white text-[color:var(--color-success)] transition hover:bg-[color:var(--color-success)]/10"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
