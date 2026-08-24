import type {
  Application,
  ApplicationStatus,
} from "@/lib/applications";

import type {
  ApplicationEvent,
} from "@/lib/application-events";

const SUBMITTED_STATUSES:
  ApplicationStatus[] = [
    "Applied",
    "Interview",
    "Case",
    "Offer",
    "Rejected",
  ];

export interface WeeklyGoalProgress {
  completed: number;
  goal: number;
  remaining: number;
  percent: number;
  achieved: boolean;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();

  const diff =
    day === 0
      ? -6
      : 1 - day;

  result.setDate(
    result.getDate() + diff,
  );

  result.setHours(0, 0, 0, 0);

  return result;
}

function validDate(
  value?: string,
): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function firstSubmittedDate(
  application: Application,
  events: ApplicationEvent[],
): Date | null {
  const explicitAppliedAt =
    validDate(application.appliedAt);

  if (explicitAppliedAt) {
    return explicitAppliedAt;
  }

  const timelineDates = events
    .filter(
      (event) =>
        event.applicationId ===
          application.id &&
        event.eventType ===
          "status_change" &&
        event.toStatus !== undefined &&
        SUBMITTED_STATUSES.includes(
          event.toStatus,
        ),
    )
    .map((event) =>
      validDate(event.occurredAt),
    )
    .filter(
      (date): date is Date =>
        date !== null,
    )
    .sort(
      (a, b) =>
        a.getTime() - b.getTime(),
    );

  if (timelineDates.length > 0) {
    return timelineDates[0];
  }

  if (
    SUBMITTED_STATUSES.includes(
      application.status,
    )
  ) {
    return validDate(
      application.createdAt,
    );
  }

  return null;
}

export function buildWeeklyGoalProgress(
  applications: Application[],
  events: ApplicationEvent[],
  weeklyGoal: number,
  now = new Date(),
): WeeklyGoalProgress {
  const weekStart = startOfWeek(now);

  const nextWeek = new Date(
    weekStart,
  );

  nextWeek.setDate(
    nextWeek.getDate() + 7,
  );

  const completed =
    applications.filter(
      (application) => {
        const submittedAt =
          firstSubmittedDate(
            application,
            events,
          );

        if (!submittedAt) {
          return false;
        }

        return (
          submittedAt >= weekStart &&
          submittedAt < nextWeek
        );
      },
    ).length;

  const goal = Math.max(
    1,
    Math.round(weeklyGoal),
  );

  const remaining = Math.max(
    0,
    goal - completed,
  );

  const percent = Math.min(
    100,
    Math.round(
      (completed / goal) * 100,
    ),
  );

  return {
    completed,
    goal,
    remaining,
    percent,
    achieved:
      completed >= goal,
  };
}
