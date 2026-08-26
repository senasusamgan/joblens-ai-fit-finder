import type { Application } from "@/lib/applications";

export type FollowUpTiming =
  | "Wait"
  | "Plan"
  | "Send now";

export interface FollowUpGuidance {
  timing: FollowUpTiming;
  daysSinceApplication: number;
  recommendation: string;
  suggestedReminderDate: string;
  message: string;
}

function daysSince(iso?: string): number {
  if (!iso) return 0;

  const timestamp = new Date(iso).getTime();

  if (Number.isNaN(timestamp)) return 0;

  return Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) /
        (1000 * 60 * 60 * 24),
    ),
  );
}

function dateAfter(
  iso: string | undefined,
  days: number,
): string {
  const base = iso ? new Date(iso) : new Date();

  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  base.setDate(base.getDate() + days);

  return base.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildMessage(app: Application): string {
  const role = app.jobTitle.trim();
  const company = app.companyName.trim();

  const roleReference = company
    ? `the ${role} role at ${company}`
    : `the ${role} role`;

  return `Hi, I wanted to follow up on my application for ${roleReference}. I’m still very interested in the opportunity and wanted to check whether there are any updates on the process. I’d be happy to provide any additional information that would be helpful. Thank you for your time.`;
}

export function getFollowUpGuidance(
  app: Application,
): FollowUpGuidance {
  const anchor = app.appliedAt ?? app.createdAt;
  const elapsedDays = daysSince(anchor);

  if (elapsedDays < 5) {
    return {
      timing: "Wait",
      daysSinceApplication: elapsedDays,
      recommendation:
        "Your application is still recent. Give the hiring team a little more time before following up.",
      suggestedReminderDate: dateAfter(
        anchor,
        5,
      ),
      message: buildMessage(app),
    };
  }

  if (elapsedDays < 10) {
    return {
      timing: "Plan",
      daysSinceApplication: elapsedDays,
      recommendation:
        "You are entering a reasonable follow-up window. Set a reminder now and aim to follow up around day 10 unless the employer gave a different timeline.",
      suggestedReminderDate: dateAfter(
        anchor,
        10,
      ),
      message: buildMessage(app),
    };
  }

  if (elapsedDays < 14) {
    return {
      timing: "Send now",
      daysSinceApplication: elapsedDays,
      recommendation:
        "A concise professional follow-up is reasonable now.",
      suggestedReminderDate: today(),
      message: buildMessage(app),
    };
  }

  return {
    timing: "Send now",
    daysSinceApplication: elapsedDays,
    recommendation:
      "This application has been quiet for two weeks or more. Send one concise follow-up, then move it to monitoring if there is still no response.",
    suggestedReminderDate: today(),
    message: buildMessage(app),
  };
}
