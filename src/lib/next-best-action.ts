import type {
  Application,
  ApplicationStatus,
} from "@/lib/applications";

export type NextBestActionKind =
  | "analyze"
  | "reminder"
  | "interview_prep"
  | "edit"
  | "none";

export type NextBestActionPriority =
  | "low"
  | "medium"
  | "high";

export interface NextBestAction {
  title: string;
  description: string;
  ctaLabel?: string;
  kind: NextBestActionKind;
  priority: NextBestActionPriority;
  urgencyLabel: "Now" | "Soon" | "Monitor";
  score: number;
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

function actionForStatus(
  status: ApplicationStatus,
  app: Application,
): NextBestAction {
  switch (status) {
    case "Saved": {
      if (typeof app.matchScore !== "number") {
        return {
          title: "Analyze before you apply",
          description:
            "You saved this role but have not checked your fit yet. Analyze it before investing more time.",
          ctaLabel: "Analyze job",
          kind: "analyze",
          priority: "medium",
          urgencyLabel: "Soon",
          score: 55,
        };
      }

      if (app.matchScore >= 70) {
        return {
          title: "Decide whether to apply",
          description:
            "Your match score is promising. Review the role once more and decide whether to submit an application.",
          ctaLabel: "Review application",
          kind: "edit",
          priority: "medium",
          urgencyLabel: "Soon",
          score: 50,
        };
      }

      return {
        title: "Review the gaps first",
        description:
          "Your current match is weaker. Check the gaps before deciding whether this opportunity deserves more time.",
        ctaLabel: "Review application",
        kind: "edit",
        priority: "low",
        urgencyLabel: "Monitor",
        score: 30,
      };
    }

    case "Applied": {
      const elapsedDays = daysSince(
        app.appliedAt ?? app.createdAt,
      );

      if (elapsedDays >= 14) {
        return {
          title: "Follow up now",
          description: `It has been ${elapsedDays} days since you applied. This application is at risk of going quiet.`,
          ctaLabel: "Set follow-up",
          kind: "reminder",
          priority: "high",
          urgencyLabel: "Now",
          score: 90,
        };
      }

      if (elapsedDays >= 10) {
        return {
          title: "Follow up now",
          description: `It has been ${elapsedDays} days since you applied. A short, professional follow-up is reasonable.`,
          ctaLabel: "Set follow-up",
          kind: "reminder",
          priority: "high",
          urgencyLabel: "Now",
          score: 85,
        };
      }

      if (elapsedDays >= 5) {
        return {
          title: "Plan your follow-up",
          description: `You applied ${elapsedDays} days ago. Set a reminder now so this opportunity does not disappear from your radar.`,
          ctaLabel: "Add reminder",
          kind: "reminder",
          priority: "medium",
          urgencyLabel: "Soon",
          score: 60,
        };
      }

      return {
        title: "Stay ready for a response",
        description:
          "Your application is still recent. No action is needed yet, but keep the role details fresh.",
        kind: "none",
        priority: "low",
        urgencyLabel: "Monitor",
        score: 15,
      };
    }

    case "Assessment":
      return {
        title: "Complete the assessment",
        description:
          "Confirm the test format and deadline before you start. Leave enough time for aptitude, language, technical, or other online assessments.",
        ctaLabel: "Set assessment reminder",
        kind: "reminder",
        priority: "high",
        urgencyLabel: "Now",
        score: 98,
      };

    case "Interview":
      return {
        title: "Prepare for the interview",
        description:
          "This is your highest-leverage stage. Prepare your introduction, examples, likely questions, and questions for the interviewer.",
        ctaLabel: "Prepare now",
        kind: "interview_prep",
        priority: "high",
        urgencyLabel: "Now",
        score: 100,
      };

    case "Case":
      return {
        title: "Protect the case deadline",
        description:
          "Make the deadline explicit and leave enough time for a final review before submission.",
        ctaLabel: "Set case reminder",
        kind: "reminder",
        priority: "high",
        urgencyLabel: "Now",
        score: 95,
      };

    case "Offer":
      return {
        title: "Review the offer carefully",
        description:
          "Capture the decision deadline, compensation, role scope, and unanswered questions before responding.",
        ctaLabel: "Review details",
        kind: "edit",
        priority: "high",
        urgencyLabel: "Now",
        score: 92,
      };

    case "Rejected":
      return {
        title: "Capture the learning",
        description:
          "Add any feedback or observations while they are still fresh, then carry those lessons into your next application.",
        ctaLabel: "Add notes",
        kind: "edit",
        priority: "low",
        urgencyLabel: "Monitor",
        score: 10,
      };
  }
}

export function getNextBestAction(
  app: Application,
): NextBestAction {
  return actionForStatus(app.status, app);
}

export function rankApplicationsByNextBestAction(
  applications: Application[],
): Application[] {
  return [...applications].sort(
    (a, b) =>
      getNextBestAction(b).score -
      getNextBestAction(a).score,
  );
}
