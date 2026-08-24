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
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { supabase } from "@/integrations/supabase/client";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  loadApplications,
  formatDate,
} from "@/lib/applications";
import {
  migrateGuestApplicationsToCloud,
} from "@/lib/cloud-applications";
import {
  migrateGuestRemindersToCloud,
  updateCloudReminder,
} from "@/lib/cloud-reminders";
import {
  loadAllApplicationEvents,
  type ApplicationEvent,
} from "@/lib/application-events";
import {
  buildApplicationAnalytics,
} from "@/lib/application-analytics";
import {
  buildApplicationPerformanceInsights,
  buildTopPerformanceSignal,
} from "@/lib/application-performance-insights";
import {
  loadReminders,
  updateReminder,
  type Reminder,
} from "@/lib/reminders";

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

function DashboardPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [applicationEvents, setApplicationEvents] = useState<ApplicationEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [cloudMode, setCloudMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);


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

        const eventList = session
          ? await loadAllApplicationEvents()
          : [];

        if (!mounted) return;


        setCloudMode(Boolean(session));
        setApps(applications);
        setReminders(reminderList);
        setApplicationEvents(eventList);
      } catch (error) {
        console.error("[JobLens Dashboard] Could not load applications:", error);

        if (!mounted) return;

        setCloudMode(false);
        setApps(loadApplications());
        setReminders(loadReminders());
        setApplicationEvents([]);
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
    } = supabase.auth.onAuthStateChange((event) => {
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

  const analytics = useMemo(
    () =>
      buildApplicationAnalytics(
        apps,
        applicationEvents,
      ),
    [apps, applicationEvents],
  );

  const performanceInsights = useMemo(
    () =>
      buildApplicationPerformanceInsights(
        apps,
        applicationEvents,
      ),
    [apps, applicationEvents],
  );

  const topPerformanceSignal = useMemo(
    () =>
      buildTopPerformanceSignal(
        performanceInsights,
      ),
    [performanceInsights],
  );

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

              <section className="card-surface mt-6 p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                      Application Analytics
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      How is your job search converting?
                    </h2>
                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      Based on applications that have moved beyond Saved.
                    </p>
                  </div>

                  <p className="text-xs text-[color:var(--color-muted-foreground)]">
                    {analytics.submittedApplications} submitted applications
                  </p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/35 p-4">
                    <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                      Interview Reach Rate
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {analytics.interviewReachRate === null
                        ? "—"
                        : `${analytics.interviewReachRate}%`}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                      {analytics.interviewReached} reached Interview, Case or Offer
                    </p>
                  </div>

                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/35 p-4">
                    <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                      Offer Reach Rate
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {analytics.offerReachRate === null
                        ? "—"
                        : `${analytics.offerReachRate}%`}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                      {analytics.offerReached} reached Offer
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Application Activity
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--color-muted-foreground)]">
                        Applications added over the last 8 weeks.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid h-40 grid-cols-8 items-end gap-2">
                    {analytics.weeklyActivity.map((week) => {
                      const maxCount = Math.max(
                        1,
                        ...analytics.weeklyActivity.map((item) => item.count),
                      );

                      const height =
                        week.count === 0
                          ? 4
                          : Math.max(
                              12,
                              Math.round((week.count / maxCount) * 100),
                            );

                      return (
                        <div
                          key={week.weekStart}
                          className="flex h-full min-w-0 flex-col justify-end"
                        >
                          <div className="mb-1 text-center text-xs font-medium text-[color:var(--color-surface-foreground)]">
                            {week.count}
                          </div>

                          <div className="flex h-24 items-end">
                            <div
                              className="w-full rounded-t-md bg-[color:var(--color-primary)]/75"
                              style={{ height: `${height}%` }}
                              title={`${week.label}: ${week.count} applications`}
                            />
                          </div>

                          <div className="mt-2 truncate text-center text-[10px] text-[color:var(--color-muted-foreground)]">
                            {week.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="card-surface mt-6 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                    Performance Insights
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    Where are you seeing the strongest signal?
                  </h2>
                </div>

                {topPerformanceSignal ? (
                  <div className="mt-5 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/35 p-5">
                    <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                      Strongest observed signal
                    </p>

                    <p className="mt-2 text-lg font-semibold">
                      {topPerformanceSignal.headline}
                    </p>

                    <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
                      {topPerformanceSignal.detail}
                    </p>

                    <p className="mt-4 text-xs text-[color:var(--color-muted-foreground)]">
                      This is based only on your tracked application history and should be treated as directional, not predictive.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed border-[color:var(--color-border)] p-5">
                    <p className="font-medium">
                      Keep tracking — insights unlock as your history grows.
                    </p>

                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      JobLens only surfaces performance patterns when there is enough application history to avoid misleading conclusions.
                    </p>
                  </div>
                )}
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
