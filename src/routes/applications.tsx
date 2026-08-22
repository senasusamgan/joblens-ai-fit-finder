import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Briefcase,
  X,
  Sparkles,
  Bell,
  History,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { supabase } from "@/integrations/supabase/client";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  createApplication,
  deleteApplication,
  formatDate,
  loadApplications,
  summarise,
  updateApplication,
} from "@/lib/applications";
import {
  createCloudApplication,
  deleteCloudApplication,
  migrateGuestApplicationsToCloud,
  updateCloudApplication,
} from "@/lib/cloud-applications";
import { createReminderForCurrentUser } from "@/lib/cloud-reminders";
import {
  loadApplicationEvents,
  recordApplicationEvent,
  type ApplicationEvent,
} from "@/lib/application-events";
import { deleteRemindersForApplication } from "@/lib/reminders";
import { getNextBestAction } from "@/lib/next-best-action";

export const Route = createFileRoute("/applications")({
  head: () => ({
    meta: [
      { title: "Applications — JobLens AI Tracker" },
      {
        name: "description",
        content:
          "Track every job opportunity from saved role to final decision, with match scores from your JobLens AI analyses.",
      },
      { property: "og:title", content: "Applications — JobLens AI Tracker" },
      {
        property: "og:description",
        content: "Track every opportunity from saved role to final decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Applications — JobLens AI Tracker" },
      {
        name: "twitter:description",
        content: "Track every opportunity from saved role to final decision.",
      },
    ],
  }),
  component: ApplicationsPage,
});

const statusTone: Record<ApplicationStatus, string> = {
  Saved: "bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]",
  Applied: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)]",
  Interview: "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]",
  Case: "bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]",
  Offer: "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]",
  Rejected: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)]",
};

type FormState = {
  jobTitle: string;
  companyName: string;
  jobUrl: string;
  status: ApplicationStatus;
  appliedAt: string;
  notes: string;
};

const emptyForm: FormState = {
  jobTitle: "",
  companyName: "",
  jobUrl: "",
  status: "Saved",
  appliedAt: "",
  notes: "",
};

function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [cloudMode, setCloudMode] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [reminderApp, setReminderApp] = useState<Application | null>(null);
  const [reminderTitle, setReminderTitle] = useState("Follow up");
  const [reminderDueAt, setReminderDueAt] = useState("");
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);

  const [timelineApp, setTimelineApp] =
    useState<Application | null>(null);
  const [timelineEvents, setTimelineEvents] =
    useState<ApplicationEvent[]>([]);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineError, setTimelineError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const hydrate = async (signedIn: boolean) => {
      setHydrated(false);
      setSyncError(null);

      try {
        if (signedIn) {
          const cloudApplications = await migrateGuestApplicationsToCloud();

          if (!active) return;
          setCloudMode(true);
          setApps(cloudApplications);
        } else {
          if (!active) return;
          setCloudMode(false);
          setApps(loadApplications());
        }
      } catch (error) {
        console.error("[JobLens] Cloud application sync failed:", error);

        if (!active) return;

        // Important safety fallback:
        // never remove browser records if cloud migration fails.
        setCloudMode(false);
        setApps(loadApplications());
        setSyncError(
          "Cloud sync could not be completed. Your browser copies are still safe.",
        );
      } finally {
        if (active) setHydrated(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      void hydrate(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void hydrate(Boolean(session));
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const stats = useMemo(() => summarise(apps), [apps]);

  const attentionApps = useMemo(
    () =>
      apps.filter(
        (app) => getNextBestAction(app).priority === "high",
      ),
    [apps],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (a: Application) => {
    setEditingId(a.id);
    setForm({
      jobTitle: a.jobTitle,
      companyName: a.companyName,
      jobUrl: a.jobUrl ?? "",
      status: a.status,
      appliedAt: a.appliedAt ? a.appliedAt.slice(0, 10) : "",
      notes: a.notes ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.jobTitle.trim() || !form.companyName.trim()) {
      setFormError("Job title and company are required.");
      return;
    }

    setFormError(null);

    const payload = {
      jobTitle: form.jobTitle.trim(),
      companyName: form.companyName.trim(),
      jobUrl: form.jobUrl.trim() || undefined,
      status: form.status,
      appliedAt: form.appliedAt || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (editingId) {
        const previous = apps.find((app) => app.id === editingId);

        if (cloudMode) {
          const updated = await updateCloudApplication(editingId, payload);

          setApps((current) =>
            current.map((app) =>
              app.id === editingId ? updated : app,
            ),
          );

          if (
            previous &&
            previous.status !== updated.status
          ) {
            try {
              await recordApplicationEvent({
                applicationId: editingId,
                eventType: "status_change",
                source: "manual",
                fromStatus: previous.status,
                toStatus: updated.status,
              });
            } catch (eventError) {
              console.error(
                "[JobLens Timeline] Could not record manual status change:",
                eventError,
              );
              setSyncError(
                "Application updated, but its timeline history could not be saved.",
              );
            }
          }
        } else {
          setApps(updateApplication(editingId, payload));
        }
      } else if (cloudMode) {
        const created = await createCloudApplication(payload);

        setApps((current) => [created, ...current]);

        try {
          await recordApplicationEvent({
            applicationId: created.id,
            eventType: "created",
            source: "manual",
            toStatus: created.status,
            occurredAt: created.createdAt,
          });
        } catch (eventError) {
          console.error(
            "[JobLens Timeline] Could not record application creation:",
            eventError,
          );
          setSyncError(
            "Application saved, but its timeline history could not be created.",
          );
        }
      } else {
        createApplication(payload);
        setApps(loadApplications());
      }

      setDialogOpen(false);
    } catch (error) {
      console.error("[JobLens] Application save failed:", error);
      setFormError("We couldn’t save this application. Please try again.");
    }
  };

  const changeStatus = async (id: string, status: ApplicationStatus) => {
    try {
      const previous = apps.find((app) => app.id === id);

      if (cloudMode) {
        const updated = await updateCloudApplication(id, { status });

        setApps((current) =>
          current.map((app) =>
            app.id === id ? updated : app,
          ),
        );

        if (
          previous &&
          previous.status !== updated.status
        ) {
          try {
            await recordApplicationEvent({
              applicationId: id,
              eventType: "status_change",
              source: "manual",
              fromStatus: previous.status,
              toStatus: updated.status,
            });
          } catch (eventError) {
            console.error(
              "[JobLens Timeline] Could not record manual status change:",
              eventError,
            );
            setSyncError(
              "Status updated, but its timeline history could not be saved.",
            );
          }
        }
      } else {
        setApps(updateApplication(id, { status }));
      }
    } catch (error) {
      console.error("[JobLens] Status update failed:", error);
      setSyncError("We couldn’t update this application. Please try again.");
    }
  };

  const remove = async (a: Application) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete “${a.jobTitle}” at ${a.companyName}?`)
    ) {
      return;
    }

    try {
      if (cloudMode) {
        await deleteCloudApplication(a.id);
        setApps((current) => current.filter((app) => app.id !== a.id));
      } else {
        deleteRemindersForApplication(a.id);
        setApps(deleteApplication(a.id));
      }
    } catch (error) {
      console.error("[JobLens] Application delete failed:", error);
      setSyncError("We couldn’t delete this application. Please try again.");
    }
  };

  const openTimeline = async (app: Application) => {
    setTimelineApp(app);
    setTimelineEvents([]);
    setTimelineError(null);

    if (!cloudMode) {
      setTimelineError(
        "Sign in to keep application history synced across devices.",
      );
      return;
    }

    setTimelineBusy(true);

    try {
      const events = await loadApplicationEvents(app.id);
      setTimelineEvents(events);
    } catch (error) {
      console.error(
        "[JobLens Timeline] Could not load application history:",
        error,
      );
      setTimelineError(
        "We couldn’t load this application’s timeline.",
      );
    } finally {
      setTimelineBusy(false);
    }
  };

  const openReminder = (app: Application) => {
    setReminderApp(app);

    const suggestedTitle =
      app.status === "Interview"
        ? "Interview"
        : app.status === "Case"
          ? "Case deadline"
          : "Follow up";

    setReminderTitle(suggestedTitle);
    setReminderDueAt("");
    setReminderError(null);
  };

  const submitReminder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reminderApp) return;

    if (!reminderTitle.trim()) {
      setReminderError("Please enter a reminder title.");
      return;
    }

    if (!reminderDueAt) {
      setReminderError("Please choose a date and time.");
      return;
    }

    const dueDate = new Date(reminderDueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setReminderError("Please choose a valid date and time.");
      return;
    }

    setReminderBusy(true);
    setReminderError(null);

    try {
      await createReminderForCurrentUser({
        applicationId: reminderApp.id,
        title: reminderTitle.trim(),
        dueAt: dueDate.toISOString(),
      });

      setReminderApp(null);
      setReminderTitle("Follow up");
      setReminderDueAt("");
    } catch (error) {
      console.error("[JobLens] Reminder creation failed:", error);
      setReminderError("We couldn’t save this reminder. Please try again.");
    } finally {
      setReminderBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteNav />

      <main className="px-5 pb-24 pt-10 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Applications</h1>
              <p className="mt-2 text-sm text-white/60 md:text-base">
                Track every opportunity from saved role to final decision.
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add Application
            </button>
          </div>

          {/* Summary */}
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Active" value={stats.active} />
            <Stat label="Interviews" value={stats.interviews} />
            <Stat label="Offers" value={stats.offers} />
          </div>

          {hydrated && attentionApps.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {attentionApps.length} application{attentionApps.length === 1 ? "" : "s"} need your attention
                  </p>

                  <p className="mt-1 text-sm text-white/60">
                    {attentionApps
                      .slice(0, 3)
                      .map((app) => app.companyName || app.jobTitle)
                      .join(", ")}
                    {attentionApps.length > 3
                      ? ` +${attentionApps.length - 3} more`
                      : ""}
                  </p>

                  <p className="mt-1 text-xs text-white/45">
                    Review the highlighted next actions below.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!hydrated ? null : apps.length === 0 ? (
            <div className="card-surface mt-8 p-10 text-center">
              <div
                className="mx-auto grid h-12 w-12 place-items-center rounded-xl text-white"
                style={{ background: "var(--gradient-hero)" }}
                aria-hidden
              >
                <Briefcase className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">No applications yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--color-muted-foreground)]">
                Analyse a role to save it here automatically, or add an application manually to start tracking.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Analyze a Job
                </Link>
                <button
                  type="button"
                  onClick={openAdd}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Application
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {APPLICATION_STATUSES.map((status) => {
                const items = apps.filter((a) => a.status === status);
                return (
                  <section key={status} aria-label={status} className="min-w-0">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold tracking-wide text-white/80">{status}</h2>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                        {items.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {items.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
                          Nothing here
                        </p>
                      ) : (
                        items.map((a) => (
                          <AppCard
                            key={a.id}
                            app={a}
                            onStatus={changeStatus}
                            onEdit={openEdit}
                            onDelete={remove}
                            onReminder={openReminder}
                            onTimeline={openTimeline}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {syncError && (
            <p className="mt-6 text-center text-sm text-[color:var(--color-warning)]">
              {syncError}
            </p>
          )}

          <p className="mt-10 text-center text-xs text-white/40">
            {cloudMode
              ? "Signed in · Applications are synced to your account."
              : "Guest mode · Applications are stored only in this browser."}
            {" "}No CV text is ever saved here.
          </p>
        </div>
      </main>

      {timelineApp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timeline-dialog-title"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget &&
              !timelineBusy
            ) {
              setTimelineApp(null);
            }
          }}
        >
          <div className="card-surface max-h-[85vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <History
                    className="h-5 w-5 text-[color:var(--color-primary)]"
                    aria-hidden
                  />
                  <h2
                    id="timeline-dialog-title"
                    className="text-xl font-semibold"
                  >
                    Application timeline
                  </h2>
                </div>

                <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                  {timelineApp.jobTitle}
                  {timelineApp.companyName
                    ? ` · ${timelineApp.companyName}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTimelineApp(null)}
                disabled={timelineBusy}
                aria-label="Close application timeline"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-6">
              {timelineBusy ? (
                <p className="py-8 text-center text-sm text-[color:var(--color-muted-foreground)]">
                  Loading history…
                </p>
              ) : timelineError ? (
                <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/50 p-4">
                  <p className="text-sm text-[color:var(--color-muted-foreground)]">
                    {timelineError}
                  </p>
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-5 text-center">
                  <History
                    className="mx-auto h-5 w-5 text-[color:var(--color-muted-foreground)]"
                    aria-hidden
                  />
                  <p className="mt-2 text-sm font-medium">
                    No recorded history yet
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                    Future status changes will appear here automatically.
                  </p>
                </div>
              ) : (
                <ol className="relative ml-2 border-l border-[color:var(--color-border)]">
                  {timelineEvents.map((event) => (
                    <li
                      key={event.id}
                      className="relative ml-6 pb-7 last:pb-0"
                    >
                      <span
                        className="absolute -left-[1.86rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-[color:var(--color-surface)]"
                        style={{
                          background:
                            "var(--color-primary)",
                        }}
                        aria-hidden
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">
                          {event.eventType === "created"
                            ? "Application created"
                            : `${event.fromStatus ?? "Previous"} → ${event.toStatus ?? "Updated"}`}
                        </p>

                        <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                          {event.source}
                        </span>
                      </div>

                      {event.eventType === "created" &&
                        event.toStatus && (
                          <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                            Starting stage: {event.toStatus}
                          </p>
                        )}

                      <time className="mt-1 block text-[11px] text-[color:var(--color-muted-foreground)]">
                        {new Date(
                          event.occurredAt,
                        ).toLocaleString(undefined, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="mt-6 border-t border-[color:var(--color-border)] pt-4">
              <p className="text-xs text-[color:var(--color-muted-foreground)]">
                Timeline stores application stage history only.
                Gmail message content is not saved here.
              </p>
            </div>
          </div>
        </div>
      )}

      {reminderApp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminder-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !reminderBusy) {
              setReminderApp(null);
            }
          }}
        >
          <div className="card-surface w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reminder-dialog-title" className="text-xl font-semibold">
                  Add reminder
                </h2>
                <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                  {reminderApp.jobTitle}
                  {reminderApp.companyName
                    ? ` · ${reminderApp.companyName}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReminderApp(null)}
                disabled={reminderBusy}
                aria-label="Close reminder dialog"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submitReminder}>
              <FormField id="reminder-title" label="Action">
                <select
                  id="reminder-title"
                  className="jl-input"
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                >
                  <option value="Follow up">Follow up</option>
                  <option value="Interview">Interview</option>
                  <option value="Case deadline">Case deadline</option>
                  <option value="Application deadline">
                    Application deadline
                  </option>
                  <option value="Check application status">
                    Check application status
                  </option>
                </select>
              </FormField>

              <FormField id="reminder-due" label="Date & time" required>
                <input
                  id="reminder-due"
                  type="datetime-local"
                  className="jl-input"
                  value={reminderDueAt}
                  onChange={(e) => setReminderDueAt(e.target.value)}
                />
              </FormField>

              {reminderError && (
                <p
                  role="alert"
                  className="text-sm text-[color:var(--color-danger)]"
                >
                  {reminderError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setReminderApp(null)}
                  disabled={reminderBusy}
                  className="rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-surface-foreground)] hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={reminderBusy}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <Bell className="h-4 w-4" aria-hidden />
                  {reminderBusy ? "Saving…" : "Add reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false);
          }}
        >
          <div className="card-surface max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 id="app-dialog-title" className="text-xl font-semibold">
                {editingId ? "Edit application" : "Add application"}
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submitForm} noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="f-title" label="Job title" required>
                  <input
                    id="f-title"
                    className="jl-input"
                    value={form.jobTitle}
                    onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                    placeholder="e.g. Product Intern"
                    autoFocus
                  />
                </FormField>
                <FormField id="f-company" label="Company" required>
                  <input
                    id="f-company"
                    className="jl-input"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="e.g. Acme"
                  />
                </FormField>
              </div>

              <FormField id="f-url" label="Job URL" hint="Optional">
                <input
                  id="f-url"
                  className="jl-input"
                  value={form.jobUrl}
                  onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
                  placeholder="https://…"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="f-status" label="Status">
                  <select
                    id="f-status"
                    className="jl-input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ApplicationStatus })}
                  >
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="f-date" label="Applied date" hint="Optional">
                  <input
                    id="f-date"
                    type="date"
                    className="jl-input"
                    value={form.appliedAt}
                    onChange={(e) => setForm({ ...form, appliedAt: e.target.value })}
                  />
                </FormField>
              </div>

              <FormField id="f-notes" label="Notes" hint="Optional">
                <textarea
                  id="f-notes"
                  rows={3}
                  className="jl-input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Referral, deadline, next step…"
                />
              </FormField>

              {formError && (
                <p role="alert" className="text-sm text-[color:var(--color-danger)]">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-surface-foreground)] hover:bg-[color:var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {editingId ? "Save changes" : "Add application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .jl-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: white;
          color: var(--color-surface-foreground);
          padding: 0.6rem 0.8rem;
          font-size: 0.925rem;
        }
        .jl-input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 25%, transparent);
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function AppCard({
  app,
  onStatus,
  onEdit,
  onDelete,
  onReminder,
  onTimeline,
}: {
  app: Application;
  onStatus: (id: string, s: ApplicationStatus) => void;
  onEdit: (a: Application) => void;
  onDelete: (a: Application) => void;
  onReminder: (a: Application) => void;
  onTimeline: (a: Application) => void;
}) {
  const date = app.appliedAt ? formatDate(app.appliedAt) : formatDate(app.createdAt);
  const dateLabel = app.appliedAt
    ? "Applied"
    : app.status === "Saved"
      ? "Saved"
      : "Added";
  const nextAction = getNextBestAction(app);

  const nextActionTone =
    nextAction.priority === "high"
      ? "border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/10"
      : nextAction.priority === "medium"
        ? "border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5"
        : "border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40";

  return (
    <article className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{app.companyName || "—"}</p>
          <p className="mt-0.5 break-words text-sm text-[color:var(--color-muted-foreground)]">
            {app.jobTitle}
          </p>
        </div>
        {typeof app.matchScore === "number" && (
          <span className="shrink-0 rounded-lg bg-[color:var(--color-primary)]/12 px-2 py-1 text-xs font-semibold text-[color:var(--color-primary)]">
            {app.matchScore}%
          </span>
        )}
      </div>

      {app.verdict && (
        <span
          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[app.status]}`}
        >
          {app.verdict}
        </span>
      )}

      {app.notes && (
        <p className="mt-2 line-clamp-2 text-xs text-[color:var(--color-muted-foreground)]">{app.notes}</p>
      )}

      <p className="mt-2 text-[11px] text-[color:var(--color-muted-foreground)]">
        {dateLabel} {date}
      </p>

      <div className={`mt-3 rounded-xl border p-3 ${nextActionTone}`}>
        <div className="flex items-center gap-1.5">
          <Sparkles
            className="h-3.5 w-3.5 text-[color:var(--color-primary)]"
            aria-hidden
          />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
            Next best action
          </p>
        </div>

        <p className="mt-1.5 text-xs font-semibold">
          {nextAction.title}
        </p>

        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--color-muted-foreground)]">
          {nextAction.description}
        </p>

        {nextAction.kind === "analyze" && nextAction.ctaLabel ? (
          <Link
            to="/"
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </Link>
        ) : nextAction.kind === "reminder" && nextAction.ctaLabel ? (
          <button
            type="button"
            onClick={() => onReminder(app)}
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </button>
        ) : nextAction.kind === "edit" && nextAction.ctaLabel ? (
          <button
            type="button"
            onClick={() => onEdit(app)}
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label className="sr-only" htmlFor={`status-${app.id}`}>
          Status for {app.jobTitle}
        </label>
        <select
          id={`status-${app.id}`}
          value={app.status}
          onChange={(e) => onStatus(app.id, e.target.value as ApplicationStatus)}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[color:var(--color-surface-foreground)]"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {app.jobUrl && (
          <a
            href={app.jobUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open job posting for ${app.jobTitle}`}
            className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        <button
          type="button"
          onClick={() => onTimeline(app)}
          aria-label={`View timeline for ${app.jobTitle}`}
          title="View timeline"
          className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
        >
          <History className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onReminder(app)}
          aria-label={`Add reminder for ${app.jobTitle}`}
          title="Add reminder"
          className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary)]/10"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onEdit(app)}
          aria-label={`View or edit ${app.jobTitle}`}
          className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onDelete(app)}
          aria-label={`Delete ${app.jobTitle}`}
          className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </article>
  );
}

function FormField({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-[color:var(--color-danger)]"> *</span>}
        {hint && (
          <span className="ml-1 text-xs font-normal text-[color:var(--color-muted-foreground)]">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}
