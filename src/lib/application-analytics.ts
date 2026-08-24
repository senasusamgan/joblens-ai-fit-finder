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

export interface WeeklyApplicationActivity {
  weekStart: string;
  label: string;
  count: number;
}

export interface ApplicationAnalytics {
  submittedApplications: number;
  interviewReached: number;
  interviewReachRate: number | null;
  offerReached: number;
  offerReachRate: number | null;
  weeklyActivity: WeeklyApplicationActivity[];
}

function hasEverReachedStatus(
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

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);

  return result;
}

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildWeeklyActivity(
  applications: Application[],
  now: Date,
  numberOfWeeks = 8,
): WeeklyApplicationActivity[] {
  const currentWeek = startOfWeek(now);

  const weeks = Array.from({ length: numberOfWeeks }, (_, index) => {
    const week = new Date(currentWeek);
    week.setDate(
      week.getDate() - (numberOfWeeks - 1 - index) * 7,
    );

    return {
      weekStart: weekKey(week),
      label: week.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      count: 0,
    };
  });

  const counts = new Map(
    weeks.map((week) => [week.weekStart, 0]),
  );

  for (const application of applications) {
    const activityDate = new Date(
      application.appliedAt ?? application.createdAt,
    );

    if (Number.isNaN(activityDate.getTime())) continue;

    const key = weekKey(startOfWeek(activityDate));

    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return weeks.map((week) => ({
    ...week,
    count: counts.get(week.weekStart) ?? 0,
  }));
}

export function buildApplicationAnalytics(
  applications: Application[],
  events: ApplicationEvent[],
  now = new Date(),
): ApplicationAnalytics {
  const submitted = applications.filter((application) =>
    hasEverReachedStatus(
      application,
      events,
      SUBMITTED_STATUSES,
    ),
  );

  const interviewReached = submitted.filter((application) =>
    hasEverReachedStatus(
      application,
      events,
      INTERVIEW_REACHED_STATUSES,
    ),
  ).length;

  const offerReached = submitted.filter((application) =>
    hasEverReachedStatus(
      application,
      events,
      ["Offer"],
    ),
  ).length;

  return {
    submittedApplications: submitted.length,
    interviewReached,
    interviewReachRate:
      submitted.length === 0
        ? null
        : Math.round(
            (interviewReached / submitted.length) * 100,
          ),
    offerReached,
    offerReachRate:
      submitted.length === 0
        ? null
        : Math.round(
            (offerReached / submitted.length) * 100,
          ),
    weeklyActivity: buildWeeklyActivity(
      applications,
      now,
    ),
  };
}
