import type {
  Application,
  ApplicationStatus,
} from "@/lib/applications";
import type {
  ApplicationEvent,
} from "@/lib/application-events";

const SUBMITTED_STATUSES: ApplicationStatus[] = [
  "Applied",
  "Interview",
  "Case",
  "Offer",
  "Rejected",
];

const INTERVIEW_REACHED_STATUSES: ApplicationStatus[] = [
  "Interview",
  "Case",
  "Offer",
];

export interface PerformanceSegment {
  key: string;
  label: string;
  submitted: number;
  interviewReached: number;
  interviewRate: number;
}

export interface ApplicationPerformanceInsights {
  scoreSegments: PerformanceSegment[];
  roleSegments: PerformanceSegment[];
  companySegments: PerformanceSegment[];
}

function hasEverReached(
  application: Application,
  events: ApplicationEvent[],
  statuses: readonly ApplicationStatus[],
): boolean {
  if (statuses.includes(application.status)) return true;

  return events.some(
    (event) =>
      event.applicationId === application.id &&
      event.eventType === "status_change" &&
      event.toStatus !== undefined &&
      statuses.includes(event.toStatus),
  );
}

function buildSegment(
  key: string,
  label: string,
  applications: Application[],
  events: ApplicationEvent[],
): PerformanceSegment {
  const submitted = applications.filter((application) =>
    hasEverReached(
      application,
      events,
      SUBMITTED_STATUSES,
    ),
  );

  const interviewReached = submitted.filter((application) =>
    hasEverReached(
      application,
      events,
      INTERVIEW_REACHED_STATUSES,
    ),
  ).length;

  return {
    key,
    label,
    submitted: submitted.length,
    interviewReached,
    interviewRate:
      submitted.length === 0
        ? 0
        : Math.round(
            (interviewReached / submitted.length) * 100,
          ),
  };
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function groupByText(
  applications: Application[],
  selector: (application: Application) => string,
): Map<string, Application[]> {
  const groups = new Map<string, Application[]>();

  for (const application of applications) {
    const raw = selector(application).trim();
    if (!raw) continue;

    const key = normalise(raw);
    const current = groups.get(key) ?? [];
    current.push(application);
    groups.set(key, current);
  }

  return groups;
}

export function buildApplicationPerformanceInsights(
  applications: Application[],
  events: ApplicationEvent[],
): ApplicationPerformanceInsights {
  const scoreDefinitions = [
    {
      key: "under-50",
      label: "Under 50% match",
      matches: (score: number) => score < 50,
    },
    {
      key: "50-64",
      label: "50–64% match",
      matches: (score: number) => score >= 50 && score < 65,
    },
    {
      key: "65-74",
      label: "65–74% match",
      matches: (score: number) => score >= 65 && score < 75,
    },
    {
      key: "75-plus",
      label: "75%+ match",
      matches: (score: number) => score >= 75,
    },
  ];

  const scoreSegments = scoreDefinitions
    .map((definition) =>
      buildSegment(
        definition.key,
        definition.label,
        applications.filter(
          (application) =>
            typeof application.matchScore === "number" &&
            definition.matches(application.matchScore),
        ),
        events,
      ),
    )
    .filter((segment) => segment.submitted > 0);

  const roleGroups = groupByText(
    applications,
    (application) => application.jobTitle,
  );

  const roleSegments = Array.from(roleGroups.entries())
    .map(([key, groupedApplications]) =>
      buildSegment(
        key,
        groupedApplications[0]?.jobTitle ?? key,
        groupedApplications,
        events,
      ),
    )
    .filter((segment) => segment.submitted >= 2)
    .sort(
      (a, b) =>
        b.interviewRate - a.interviewRate ||
        b.submitted - a.submitted,
    );

  const companyGroups = groupByText(
    applications,
    (application) => application.companyName,
  );

  const companySegments = Array.from(companyGroups.entries())
    .map(([key, groupedApplications]) =>
      buildSegment(
        key,
        groupedApplications[0]?.companyName ?? key,
        groupedApplications,
        events,
      ),
    )
    .filter((segment) => segment.submitted >= 2)
    .sort(
      (a, b) =>
        b.interviewRate - a.interviewRate ||
        b.submitted - a.submitted,
    );

  return {
    scoreSegments,
    roleSegments,
    companySegments,
  };
}

export interface PerformanceSignal {
  type: "match_score" | "role" | "company";
  label: string;
  submitted: number;
  interviewReached: number;
  interviewRate: number;
  headline: string;
  detail: string;
}

export function buildTopPerformanceSignal(
  insights: ApplicationPerformanceInsights,
): PerformanceSignal | null {
  const candidates: Array<{
    type: PerformanceSignal["type"];
    segment: PerformanceSegment;
  }> = [
    ...insights.scoreSegments
      .filter((segment) => segment.submitted >= 2)
      .map((segment) => ({
        type: "match_score" as const,
        segment,
      })),
    ...insights.roleSegments.map((segment) => ({
      type: "role" as const,
      segment,
    })),
    ...insights.companySegments.map((segment) => ({
      type: "company" as const,
      segment,
    })),
  ];

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) =>
      b.segment.interviewRate - a.segment.interviewRate ||
      b.segment.submitted - a.segment.submitted,
  );

  const best = candidates[0];

  if (!best || best.segment.interviewReached === 0) {
    return null;
  }

  const context =
    best.type === "match_score"
      ? "match-score range"
      : best.type === "role"
        ? "role"
        : "company";

  return {
    type: best.type,
    label: best.segment.label,
    submitted: best.segment.submitted,
    interviewReached: best.segment.interviewReached,
    interviewRate: best.segment.interviewRate,
    headline: `${best.segment.label} is your strongest observed ${context} so far.`,
    detail: `${best.segment.interviewReached} of ${best.segment.submitted} submitted applications reached Interview, Case or Offer (${best.segment.interviewRate}%).`,
  };
}
