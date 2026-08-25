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

export interface NextBestAction {
  title: string;
  description: string;
  ctaLabel?: string;
  kind: NextBestActionKind;
  priority: "low" | "medium" | "high";
}

function daysSince(iso?: string): number {
  if (!iso) return 0;

  const timestamp = new Date(iso).getTime();

  if (Number.isNaN(timestamp)) return 0;

  return Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) / (1000 * 60 * 60 * 24),
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
          title: "Analyze this role",
          description:
            "Check your fit before deciding whether to apply.",
          ctaLabel: "Analyze job",
          kind: "analyze",
          priority: "medium",
        };
      }

      return {
        title: "Decide your next move",
        description:
          app.matchScore >= 70
            ? "Your match looks promising. Review the role and consider applying."
            : "Review the gaps before deciding whether this role is worth pursuing.",
        ctaLabel: "Review application",
        kind: "edit",
        priority: "medium",
      };
    }

    case "Applied": {
      const elapsedDays = daysSince(
        app.appliedAt ?? app.createdAt,
      );

      if (elapsedDays >= 10) {
        return {
          title: "Follow up now",
          description: `It has been ${elapsedDays} days since you applied. Consider sending a short follow-up.`,
          ctaLabel: "Set follow-up",
          kind: "reminder",
          priority: "high",
        };
      }

      if (elapsedDays >= 5) {
        return {
          title: "Plan your follow-up",
          description: `You applied ${elapsedDays} days ago. Set a reminder so this opportunity does not go quiet.`,
          ctaLabel: "Add reminder",
          kind: "reminder",
          priority: "medium",
        };
      }

      return {
        title: "Give it a little time",
        description:
          "Your application is still recent. Stay ready for a recruiter response.",
        kind: "none",
        priority: "low",
      };
    }

    case "Interview":
      return {
        title: "Prepare for the interview",
        description:
          "Review the role, prepare your strongest examples, and make sure the interview time is on your calendar.",
        ctaLabel: "Prepare now",
        kind: "interview_prep",
        priority: "high",
      };

    case "Case":
      return {
        title: "Lock in the case deadline",
        description:
          "Make the deadline explicit and leave enough time for a final review before submission.",
        ctaLabel: "Set case reminder",
        kind: "reminder",
        priority: "high",
      };

    case "Offer":
      return {
        title: "Review the offer carefully",
        description:
          "Capture the deadline, compensation, role scope, and any questions before making a decision.",
        ctaLabel: "Review details",
        kind: "edit",
        priority: "high",
      };

    case "Rejected":
      return {
        title: "Capture the learning",
        description:
          "Add any feedback or observations while they are still fresh, then use them for your next application.",
        ctaLabel: "Add notes",
        kind: "edit",
        priority: "low",
      };
  }
}

export function getNextBestAction(
  app: Application,
): NextBestAction {
  return actionForStatus(app.status, app);
}
