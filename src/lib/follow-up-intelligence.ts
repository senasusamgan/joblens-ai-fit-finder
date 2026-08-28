import type { Application } from "./applications.ts";

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

export type ReminderAssistantKind =
  | "application_follow_up"
  | "interview_thank_you"
  | "case_follow_up"
  | "offer_response";

export type ReminderAssistantTiming =
  | FollowUpTiming
  | "After interview"
  | "After submission"
  | "Before deadline";

export interface ReminderAssistantGuidance {
  kind: ReminderAssistantKind;
  actionTitle: string;
  timing: ReminderAssistantTiming;
  recommendation: string;
  suggestedReminderDate: string;
  message: string;
  daysSinceApplication?: number;
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

function toLocalDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}T09:00`;
}

function dateAfter(
  iso: string | undefined,
  days: number,
): string {
  const base = iso ? new Date(iso) : new Date();

  if (Number.isNaN(base.getTime())) {
    return toLocalDateTimeInput(new Date());
  }

  base.setDate(base.getDate() + days);

  return toLocalDateTimeInput(base);
}

function today(): string {
  return toLocalDateTimeInput(new Date());
}

function roleReference(app: Application): string {
  const role = app.jobTitle.trim();
  const company = app.companyName.trim();

  return company
    ? `the ${role} role at ${company}`
    : `the ${role} role`;
}

function messageGreeting(app: Application): string {
  const contactName = app.contactName?.trim();

  return contactName
    ? `Hi ${contactName},`
    : "Hi,";
}

function buildApplicationFollowUpMessage(
  app: Application,
): string {
  return `${messageGreeting(app)} I wanted to follow up on my application for ${roleReference(
    app,
  )}. I’m still very interested in the opportunity and wanted to check whether there are any updates on the process. I’d be happy to provide any additional information that would be helpful. Thank you for your time.`;
}

function buildInterviewThankYouMessage(
  app: Application,
): string {
  return `${messageGreeting(app)} thank you again for taking the time to speak with me about ${roleReference(
    app,
  )}. I appreciated the conversation and the opportunity to learn more about the role. I remain very interested and would be happy to provide any additional information. Thank you again for your time.`;
}

function buildCaseFollowUpMessage(
  app: Application,
): string {
  return `${messageGreeting(app)} I wanted to follow up regarding the case or task I submitted for ${roleReference(
    app,
  )}. I wanted to check whether there are any updates on the next steps or whether you need anything further from me. Thank you for your time.`;
}

function buildOfferAcknowledgementMessage(
  app: Application,
): string {
  return `${messageGreeting(app)} thank you again for the offer for ${roleReference(
    app,
  )}. I really appreciate the opportunity. I’m reviewing the details carefully and will respond within the agreed timeline. Please let me know if there is anything else you would like me to consider in the meantime.`;
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
      message: buildApplicationFollowUpMessage(app),
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
      message: buildApplicationFollowUpMessage(app),
    };
  }

  if (elapsedDays < 14) {
    return {
      timing: "Send now",
      daysSinceApplication: elapsedDays,
      recommendation:
        "A concise professional follow-up is reasonable now.",
      suggestedReminderDate: today(),
      message: buildApplicationFollowUpMessage(app),
    };
  }

  return {
    timing: "Send now",
    daysSinceApplication: elapsedDays,
    recommendation:
      "This application has been quiet for two weeks or more. Send one concise follow-up, then move it to monitoring if there is still no response.",
    suggestedReminderDate: today(),
    message: buildApplicationFollowUpMessage(app),
  };
}

export function getReminderAssistantGuidance(
  app: Application,
): ReminderAssistantGuidance | null {
  if (app.status === "Applied") {
    const guidance = getFollowUpGuidance(app);

    return {
      kind: "application_follow_up",
      actionTitle: "Follow up",
      timing: guidance.timing,
      recommendation: guidance.recommendation,
      suggestedReminderDate:
        guidance.suggestedReminderDate,
      message: guidance.message,
      daysSinceApplication:
        guidance.daysSinceApplication,
    };
  }

  if (app.status === "Interview") {
    return {
      kind: "interview_thank_you",
      actionTitle: "Interview thank-you",
      timing: "After interview",
      recommendation:
        "Send a short thank-you within about 24 hours after the interview. JobLens does not know your interview time, so choose the real date and time below.",
      suggestedReminderDate: "",
      message: buildInterviewThankYouMessage(app),
    };
  }

  if (app.status === "Case") {
    return {
      kind: "case_follow_up",
      actionTitle: "Case follow-up",
      timing: "After submission",
      recommendation:
        "Use this after you have submitted the case. If the employer did not provide a timeline, a concise follow-up after a few business days can be reasonable. Choose the real follow-up date below.",
      suggestedReminderDate: "",
      message: buildCaseFollowUpMessage(app),
    };
  }

  if (app.status === "Offer") {
    return {
      kind: "offer_response",
      actionTitle: "Offer response",
      timing: "Before deadline",
      recommendation:
        "Use the response deadline provided by the employer. JobLens will not guess an offer deadline, so set the actual date below.",
      suggestedReminderDate: "",
      message: buildOfferAcknowledgementMessage(app),
    };
  }

  return null;
}
