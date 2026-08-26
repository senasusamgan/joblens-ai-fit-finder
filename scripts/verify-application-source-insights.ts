import assert from "node:assert/strict";

import {
  buildApplicationPerformanceInsights,
  buildTopPerformanceSignal,
} from "../src/lib/application-performance-insights.ts";

const now = "2026-08-26T12:00:00.000Z";

const applications = [
  {
    id: "linkedin-1",
    jobTitle: "Product Intern",
    companyName: "Company A",
    applicationSource: "LinkedIn" as const,
    status: "Interview" as const,
    matchScore: 80,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "linkedin-2",
    jobTitle: "Marketing Intern",
    companyName: "Company B",
    applicationSource: "LinkedIn" as const,
    status: "Applied" as const,
    matchScore: 70,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "youthall-1",
    jobTitle: "Business Development Intern",
    companyName: "Company C",
    applicationSource: "Youthall" as const,
    status: "Interview" as const,
    matchScore: 68,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "youthall-2",
    jobTitle: "Operations Intern",
    companyName: "Company D",
    applicationSource: "Youthall" as const,
    status: "Case" as const,
    matchScore: 72,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "unset-1",
    jobTitle: "Analyst Intern",
    companyName: "Company E",
    status: "Applied" as const,
    createdAt: now,
    updatedAt: now,
  },
];

const insights =
  buildApplicationPerformanceInsights(
    applications,
    [],
  );

assert.equal(
  insights.sourceSegments.length,
  2,
);

const linkedin =
  insights.sourceSegments.find(
    (segment) => segment.label === "LinkedIn",
  );

assert.ok(linkedin);
assert.equal(linkedin.submitted, 2);
assert.equal(linkedin.interviewReached, 1);
assert.equal(linkedin.interviewRate, 50);

const youthall =
  insights.sourceSegments.find(
    (segment) => segment.label === "Youthall",
  );

assert.ok(youthall);
assert.equal(youthall.submitted, 2);
assert.equal(youthall.interviewReached, 2);
assert.equal(youthall.interviewRate, 100);

assert.equal(
  insights.sourceSegments.some(
    (segment) => segment.label === "Not set",
  ),
  false,
);

const topSignal =
  buildTopPerformanceSignal(insights);

assert.ok(topSignal);
assert.equal(topSignal.type, "source");
assert.equal(topSignal.label, "Youthall");
assert.equal(topSignal.interviewRate, 100);
assert.match(
  topSignal.headline,
  /application source/,
);

console.log(
  "✓ Application source insights regression checks passed",
);
