import type { Application, ApplicationStatus } from "./applications.ts";
import type { ApplicationEvent } from "./application-events.ts";

export const FUNNEL_STAGES = [
  "Applied",
  "Assessment",
  "Interview",
  "Case",
  "Offer",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelStageMetric {
  stage: FunnelStage;
  reached: number;
  rateFromSubmitted: number | null;
}

export interface FunnelWindowMetrics {
  submitted: number;
  interviewReached: number;
  interviewRate: number | null;
  offerReached: number;
  offerRate: number | null;
}

export interface FunnelTrend {
  current30Days: FunnelWindowMetrics;
  previous30Days: FunnelWindowMetrics;
  interviewRateChange: number | null;
  offerRateChange: number | null;
}

export interface FunnelInsight {
  kind:
    | "insufficient_data"
    | "interview_bottleneck"
    | "offer_bottleneck"
    | "balanced";
  headline: string;
  detail: string;
}

export interface ApplicationFunnelIntelligence {
  submitted: number;
  stages: FunnelStageMetric[];
  interviewToOfferRate: number | null;
  trend: FunnelTrend;
  insight: FunnelInsight;
}

const SUBMITTED_STATUSES: readonly ApplicationStatus[] = [
  "Applied",
  "Assessment",
  "Interview",
  "Case",
  "Offer",
  "Rejected",
];

const INTERVIEW_REACHED_STATUSES: readonly ApplicationStatus[] = [
  "Interview",
  "Case",
  "Offer",
];

function applicationEvents(
  application: Application,
  events: ApplicationEvent[],
): ApplicationEvent[] {
  return events.filter(
    (event) => event.applicationId === application.id,
  );
}

function hasReachedAnyStatus(
  application: Application,
  events: ApplicationEvent[],
  statuses: readonly ApplicationStatus[],
): boolean {
  if (statuses.includes(application.status)) return true;

  return applicationEvents(application, events).some(
    (event) =>
      event.eventType === "status_change" &&
      event.toStatus !== undefined &&
      statuses.includes(event.toStatus),
  );
}

function hasReachedStage(
  application: Application,
  events: ApplicationEvent[],
  stage: FunnelStage,
): boolean {
  if (stage === "Applied") {
    return hasReachedAnyStatus(
      application,
      events,
      SUBMITTED_STATUSES,
    );
  }

  if (stage === "Interview") {
    return hasReachedAnyStatus(
      application,
      events,
      INTERVIEW_REACHED_STATUSES,
    );
  }

  return hasReachedAnyStatus(application, events, [stage]);
}

function rate(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator === 0) return null;

  return Math.round((numerator / denominator) * 100);
}

function applicationActivityDate(
  application: Application,
): Date | null {
  const parsed = new Date(
    application.appliedAt ?? application.createdAt,
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildWindowMetrics(
  applications: Application[],
  events: ApplicationEvent[],
  start: Date,
  end: Date,
): FunnelWindowMetrics {
  const windowApplications = applications.filter(
    (application) => {
      const date = applicationActivityDate(application);

      return (
        date !== null &&
        date >= start &&
        date < end &&
        hasReachedStage(application, events, "Applied")
      );
    },
  );

  const interviewReached = windowApplications.filter(
    (application) =>
      hasReachedStage(application, events, "Interview"),
  ).length;

  const offerReached = windowApplications.filter(
    (application) =>
      hasReachedStage(application, events, "Offer"),
  ).length;

  return {
    submitted: windowApplications.length,
    interviewReached,
    interviewRate: rate(
      interviewReached,
      windowApplications.length,
    ),
    offerReached,
    offerRate: rate(
      offerReached,
      windowApplications.length,
    ),
  };
}

function subtractDays(date: Date, days: number): Date {
  return new Date(
    date.getTime() - days * 24 * 60 * 60 * 1000,
  );
}

function buildTrend(
  applications: Application[],
  events: ApplicationEvent[],
  now: Date,
): FunnelTrend {
  const current = buildWindowMetrics(
    applications,
    events,
    subtractDays(now, 30),
    new Date(now.getTime() + 1),
  );

  const previous = buildWindowMetrics(
    applications,
    events,
    subtractDays(now, 60),
    subtractDays(now, 30),
  );

  const enoughForComparison =
    current.submitted >= 2 &&
    previous.submitted >= 2;

  return {
    current30Days: current,
    previous30Days: previous,
    interviewRateChange:
      enoughForComparison &&
      current.interviewRate !== null &&
      previous.interviewRate !== null
        ? current.interviewRate - previous.interviewRate
        : null,
    offerRateChange:
      enoughForComparison &&
      current.offerRate !== null &&
      previous.offerRate !== null
        ? current.offerRate - previous.offerRate
        : null,
  };
}

function buildInsight(
  submitted: number,
  interviewReached: number,
  offerReached: number,
): FunnelInsight {
  if (submitted < 4 || interviewReached < 2) {
    return {
      kind: "insufficient_data",
      headline: "More application history is needed.",
      detail:
        "JobLens will surface a funnel bottleneck once there is enough submitted and interview-stage data.",
    };
  }

  const interviewRate = rate(
    interviewReached,
    submitted,
  ) ?? 0;

  const interviewToOfferRate = rate(
    offerReached,
    interviewReached,
  ) ?? 0;

  if (interviewRate < interviewToOfferRate) {
    return {
      kind: "interview_bottleneck",
      headline:
        "Reaching interviews is your largest observed funnel drop.",
      detail:
        `${interviewReached} of ${submitted} submitted applications reached Interview, Case or Offer (${interviewRate}%).`,
    };
  }

  if (interviewToOfferRate < interviewRate) {
    return {
      kind: "offer_bottleneck",
      headline:
        "Converting interviews into offers is your largest observed funnel drop.",
      detail:
        `${offerReached} of ${interviewReached} applications that reached Interview, Case or Offer reached Offer (${interviewToOfferRate}%).`,
    };
  }

  return {
    kind: "balanced",
    headline:
      "Your observed funnel is currently balanced.",
    detail:
      "Interview reach and downstream offer conversion are moving at similar rates.",
  };
}

export function buildApplicationFunnelIntelligence(
  applications: Application[],
  events: ApplicationEvent[],
  now = new Date(),
): ApplicationFunnelIntelligence {
  const submittedApplications = applications.filter(
    (application) =>
      hasReachedStage(application, events, "Applied"),
  );

  const stages = FUNNEL_STAGES.map((stage) => {
    const reached = submittedApplications.filter(
      (application) =>
        hasReachedStage(application, events, stage),
    ).length;

    return {
      stage,
      reached,
      rateFromSubmitted: rate(
        reached,
        submittedApplications.length,
      ),
    };
  });

  const interviewReached =
    stages.find((stage) => stage.stage === "Interview")
      ?.reached ?? 0;

  const offerReached =
    stages.find((stage) => stage.stage === "Offer")
      ?.reached ?? 0;

  return {
    submitted: submittedApplications.length,
    stages,
    interviewToOfferRate: rate(
      offerReached,
      interviewReached,
    ),
    trend: buildTrend(applications, events, now),
    insight: buildInsight(
      submittedApplications.length,
      interviewReached,
      offerReached,
    ),
  };
}
