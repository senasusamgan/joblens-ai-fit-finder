import assert from "node:assert/strict";
import {
  getFollowUpGuidance,
  getReminderAssistantGuidance,
} from "../src/lib/follow-up-intelligence.ts";
import type { Application } from "../src/lib/applications.ts";

function makeApplication(
  status: Application["status"],
  overrides: Partial<Application> = {},
): Application {
  const now = new Date().toISOString();

  return {
    id: `test-${status}`,
    jobTitle: "Business Development Intern",
    companyName: "Youthall",
    status,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const elevenDaysAgo = new Date(
  Date.now() - 11 * 24 * 60 * 60 * 1000,
).toISOString();

const applied = makeApplication("Applied", {
  appliedAt: elevenDaysAgo,
});

const appliedGuidance =
  getReminderAssistantGuidance(applied);

assert.ok(appliedGuidance);
assert.equal(
  appliedGuidance.kind,
  "application_follow_up",
);
assert.equal(appliedGuidance.timing, "Send now");
assert.ok(appliedGuidance.suggestedReminderDate);
assert.match(
  appliedGuidance.message,
  /Business Development Intern/,
);
assert.match(appliedGuidance.message, /Youthall/);

const legacyAppliedGuidance =
  getFollowUpGuidance(applied);

assert.equal(
  legacyAppliedGuidance.message,
  appliedGuidance.message,
);

const interview = getReminderAssistantGuidance(
  makeApplication("Interview"),
);

assert.ok(interview);
assert.equal(
  interview.kind,
  "interview_thank_you",
);
assert.equal(interview.timing, "After interview");
assert.equal(interview.suggestedReminderDate, "");
assert.match(interview.message, /thank you/i);
assert.match(interview.message, /Youthall/);

const caseGuidance = getReminderAssistantGuidance(
  makeApplication("Case"),
);

assert.ok(caseGuidance);
assert.equal(caseGuidance.kind, "case_follow_up");
assert.equal(caseGuidance.timing, "After submission");
assert.equal(caseGuidance.suggestedReminderDate, "");
assert.match(caseGuidance.message, /case or task/i);

const offer = getReminderAssistantGuidance(
  makeApplication("Offer"),
);

assert.ok(offer);
assert.equal(offer.kind, "offer_response");
assert.equal(offer.timing, "Before deadline");
assert.equal(offer.suggestedReminderDate, "");
assert.match(offer.message, /offer/i);
assert.match(
  offer.recommendation,
  /will not guess/i,
);

assert.equal(
  getReminderAssistantGuidance(
    makeApplication("Saved"),
  ),
  null,
);

assert.equal(
  getReminderAssistantGuidance(
    makeApplication("Rejected"),
  ),
  null,
);

console.log(
  "✓ Reminder assistant regression checks passed",
);
