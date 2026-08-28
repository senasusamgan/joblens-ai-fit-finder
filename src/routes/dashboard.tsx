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
  migrateGuestSearchGoalsToCloud,
} from "@/lib/cloud-search-goals";
import {
  DEFAULT_SEARCH_GOALS,
  loadSearchGoals,
  type SearchGoals,
} from "@/lib/search-goals";
import {
  buildWeeklyGoalProgress,
} from "@/lib/weekly-goal-progress";
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
  buildApplicationFunnelIntelligence,
} from "@/lib/application-funnel-intelligence";
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
  "Assessment",
  "Interview",
  "Case",
];

const statusAccent: Record<ApplicationStatus, string> = {
  Saved: "bg-[color:var(--color-muted-foreground)]",
  Applied: "bg-[color:var(--color-info)]",
  Assessment: "bg-[color:var(--color-warning)]",
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
  const [searchGoals, setSearchGoals] =
    useState<SearchGoals>({
      ...DEFAULT_SEARCH_GOALS,
    });


  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      setReady(false);
      setLoadError(null);

      try {
        const applications = await migrateGuestApplicationsToCloud();
        const reminderList = await migrateGuestRemindersToCloud();
        const goalStrategy =
          await migrateGuestSearchGoalsToCloud();

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
        setSearchGoals(goalStrategy);
      } catch (error) {
        console.error("[JobLens Dashboard] Could not load applications:", error);

        if (!mounted) return;

        setCloudMode(false);
        setApps(loadApplications());
        setReminders(loadReminders());
        setApplicationEvents([]);
        setSearchGoals(loadSearchGoals());
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

  const funnelIntelligence = useMemo(
    () =>
      buildApplicationFunnelIntelligence(
        apps,
        applicationEvents,
      ),
    [apps, applicationEvents],
  );

  const weeklyGoalProgress = useMemo(
    () =>
      buildWeeklyGoalProgress(
        apps,
        applicationEvents,
        searchGoals.weeklyApplicationGoal,
      ),
    [
      apps,
      applicationEvents,
      searchGoals.weeklyApplicationGoal,
    ],
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

  const strongestScoreSegment = useMemo(
    () =>
      [...performanceInsights.scoreSegments]
        .filter(
          (segment) =>
            segment.submitted >= 2 &&
            segment.interviewReached > 0,
        )
        .sort(
          (a, b) =>
            b.interviewRate - a.interviewRate ||
            b.submitted - a.submitted,
        )[0] ?? null,
    [performanceInsights.scoreSegments],
  );

  const strongestRoleSegment = useMemo(
    () =>
      performanceInsights.roleSegments.find(
        (segment) => segment.interviewReached > 0,
      ) ?? null,
    [performanceInsights.roleSegments],
  );

  const strongestCompanySegment = useMemo(
    () =>
      performanceInsights.companySegments.find(
        (segment) => segment.interviewReached > 0,
      ) ?? null,
    [performanceInsights.companySegments],
  );

  const strongestSourceSegment = useMemo(
    () =>
      performanceInsights.sourceSegments.find(
        (segment) => segment.interviewReached > 0,
      ) ?? null,
    [performanceInsights.sourceSegments],
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

  const snoozeReminder = async (
    reminder: Reminder,
    days: number,
  ) => {
    const nextDue = new Date();

    nextDue.setDate(nextDue.getDate() + days);
    nextDue.setHours(9, 0, 0, 0);

    const dueAt = nextDue.toISOString();

    try {
      setLoadError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const updated = await updateCloudReminder(
          reminder.id,
          { dueAt },
        );

        setCloudMode(true);
        setReminders((current) =>
          current.map((item) =>
            item.id === reminder.id
              ? updated
              : item,
          ),
        );
      } else {
        setCloudMode(false);
        setReminders(
          updateReminder(reminder.id, {
            dueAt,
          }),
        );
      }
    } catch (error) {
      console.error(
        "[JobLens Dashboard] Could not snooze reminder:",
        error,
      );

      setLoadError(
        "We couldn’t reschedule this reminder. Please try again.",
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                      Weekly Goal
                    </p>

                    <h2 className="mt-1 text-lg font-semibold">
                      {weeklyGoalProgress.completed} / {weeklyGoalProgress.goal} applications
                    </h2>

                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      {weeklyGoalProgress.achieved
                        ? "Weekly target complete. Nice — keep the momentum intentional."
                        : `${weeklyGoalProgress.remaining} more ${
                            weeklyGoalProgress.remaining === 1
                              ? "application"
                              : "applications"
                          } to reach this week’s target.`}
                    </p>
                  </div>

                  <Link
                    to="/goals"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--color-primary)] transition hover:opacity-80"
                  >
                    Edit strategy
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>

                <div className="mt-5">
                  <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
                    <div
                      className="h-full rounded-full bg-[color:var(--color-primary)] transition-all"
                      style={{
                        width: `${weeklyGoalProgress.percent}%`,
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--color-muted-foreground)]">
                    <span>
                      {weeklyGoalProgress.percent}% complete
                    </span>

                    <span>
                      Goal: {weeklyGoalProgress.goal}/week
                    </span>
                  </div>
                </div>
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

                <div className="mt-6 border-t border-[color:var(--color-border)] pt-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Funnel Intelligence
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--color-muted-foreground)]">
                        Observed stage reach from submitted applications. Assessment and Case are optional stages.
                      </p>
                    </div>

                    <span className="text-xs text-[color:var(--color-muted-foreground)]">
                      Interview → Offer:{" "}
                      {funnelIntelligence.interviewToOfferRate === null
                        ? "—"
                        : `${funnelIntelligence.interviewToOfferRate}%`}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-5">
                    {funnelIntelligence.stages.map((stage) => (
                      <div
                        key={stage.stage}
                        className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/25 p-3"
                      >
                        <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                          {stage.stage}
                        </p>

                        <p className="mt-1 text-xl font-semibold">
                          {stage.reached}
                        </p>

                        <p className="mt-0.5 text-[11px] text-[color:var(--color-muted-foreground)]">
                          {stage.rateFromSubmitted === null
                            ? "No submitted data"
                            : `${stage.rateFromSubmitted}% of submitted`}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-primary)]">
                      Funnel signal
                    </p>

                    <p className="mt-2 font-semibold">
                      {funnelIntelligence.insight.headline}
                    </p>

                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                      {funnelIntelligence.insight.detail}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[color:var(--color-border)] p-4">
                      <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                        Interview reach trend
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {funnelIntelligence.trend.interviewRateChange === null
                          ? "Not enough data"
                          : `${funnelIntelligence.trend.interviewRateChange >= 0 ? "+" : ""}${funnelIntelligence.trend.interviewRateChange} pts`}
                      </p>

                      <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                        Last 30 days vs previous 30 days
                      </p>
                    </div>

                    <div className="rounded-xl border border-[color:var(--color-border)] p-4">
                      <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                        Offer reach trend
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {funnelIntelligence.trend.offerRateChange === null
                          ? "Not enough data"
                          : `${funnelIntelligence.trend.offerRateChange >= 0 ? "+" : ""}${funnelIntelligence.trend.offerRateChange} pts`}
                      </p>

                      <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                        Last 30 days vs previous 30 days
                      </p>
                    </div>
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                      Application Insights
                    </p>

                    <h2 className="mt-1 text-lg font-semibold">
                      What is actually moving you forward?
                    </h2>

                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      Patterns from your tracked applications and outcomes.
                    </p>
                  </div>

                  <span className="text-xs text-[color:var(--color-muted-foreground)]">
                    Observed history only
                  </span>
                </div>

                {topPerformanceSignal ? (
                  <div className="mt-5 rounded-2xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-primary)]">
                      Strongest signal
                    </p>

                    <p className="mt-2 text-lg font-semibold">
                      {topPerformanceSignal.headline}
                    </p>

                    <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                      {topPerformanceSignal.detail}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-dashed border-[color:var(--color-border)] p-5">
                    <p className="font-medium">
                      No reliable pattern yet
                    </p>

                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      Keep tracking applications and outcomes. JobLens waits for repeated observations before surfacing a pattern.
                    </p>
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <PerformancePatternCard
                    eyebrow="Match score"
                    title="Best observed score band"
                    segment={strongestScoreSegment}
                    emptyText="Need at least 2 scored applications with interview outcomes."
                  />

                  <PerformancePatternCard
                    eyebrow="Role"
                    title="Strongest role pattern"
                    segment={strongestRoleSegment}
                    emptyText="Apply to the same type of role more than once to unlock this pattern."
                  />

                  <PerformancePatternCard
                    eyebrow="Company"
                    title="Strongest company pattern"
                    segment={strongestCompanySegment}
                    emptyText="Repeated applications to the same company are needed for this signal."
                  />

                  <PerformancePatternCard
                    eyebrow="Source"
                    title="Strongest source pattern"
                    segment={strongestSourceSegment}
                    emptyText="Track at least 2 submitted applications from the same source to unlock this pattern."
                  />
                </div>

                <p className="mt-4 text-xs text-[color:var(--color-muted-foreground)]">
                  These patterns are directional, not predictive. Small samples can change quickly as you track more applications.
                </p>
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
                              onSnooze={snoozeReminder}
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
                              onSnooze={snoozeReminder}
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

function PerformancePatternCard({
  eyebrow,
  title,
  segment,
  emptyText,
}: {
  eyebrow: string;
  title: string;
  segment: {
    label: string;
    submitted: number;
    interviewReached: number;
    interviewRate: number;
  } | null;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-muted-foreground)]">
        {eyebrow}
      </p>

      <p className="mt-1 text-sm font-semibold">
        {title}
      </p>

      {segment ? (
        <>
          <p className="mt-4 text-base font-semibold text-[color:var(--color-primary)]">
            {segment.label}
          </p>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold">
                {segment.interviewRate}%
              </p>
              <p className="mt-0.5 text-[11px] text-[color:var(--color-muted-foreground)]">
                interview reach
              </p>
            </div>

            <p className="text-right text-xs text-[color:var(--color-muted-foreground)]">
              {segment.interviewReached} of {segment.submitted}
              <br />
              moved forward
            </p>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
            <div
              className="h-full rounded-full bg-[color:var(--color-primary)]"
              style={{
                width: `${Math.max(
                  4,
                  Math.min(100, segment.interviewRate),
                )}%`,
              }}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
          {emptyText}
        </p>
      )}
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
  onSnooze,
}: {
  reminder: Reminder;
  application?: Application;
  overdue?: boolean;
  onComplete: (reminder: Reminder) => void;
  onSnooze: (
    reminder: Reminder,
    days: number,
  ) => void | Promise<void>;
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
              <Clock3 className="h-3 w-3" />
              Remind later
            </span>

            <button
              type="button"
              onClick={() => void onSnooze(reminder, 1)}
              className="rounded-lg border border-[color:var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)]"
            >
              Tomorrow
            </button>

            <button
              type="button"
              onClick={() => void onSnooze(reminder, 3)}
              className="rounded-lg border border-[color:var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)]"
            >
              +3 days
            </button>
          </div>
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
