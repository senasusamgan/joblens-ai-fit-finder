import assert from "node:assert/strict";

import {
  buildApplicationFunnelIntelligence,
} from "../src/lib/application-funnel-intelligence.ts";

const now = new Date("2026-08-28T09:00:00.000Z");

const applications = [
  {
    id: "a1",
    jobTitle: "Role 1",
    companyName: "A",
    status: "Applied",
    appliedAt: "2026-08-25T10:00:00.000Z",
    createdAt: "2026-08-25T10:00:00.000Z",
    updatedAt: "2026-08-25T10:00:00.000Z",
  },
  {
    id: "a2",
    jobTitle: "Role 2",
    companyName: "B",
    status: "Interview",
    appliedAt: "2026-08-20T10:00:00.000Z",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "a3",
    jobTitle: "Role 3",
    companyName: "C",
    status: "Offer",
    appliedAt: "2026-08-10T10:00:00.000Z",
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  },
  {
    id: "a4",
    jobTitle: "Role 4",
    companyName: "D",
    status: "Assessment",
    appliedAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
  },
  {
    id: "a5",
    jobTitle: "Role 5",
    companyName: "E",
    status: "Rejected",
    appliedAt: "2026-07-15T10:00:00.000Z",
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-25T10:00:00.000Z",
  },
  {
    id: "a6",
    jobTitle: "Role 6",
    companyName: "F",
    status: "Case",
    appliedAt: "2026-07-10T10:00:00.000Z",
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-25T10:00:00.000Z",
  },
] as any[];

const events = [
  {
    id: "e1",
    applicationId: "a5",
    eventType: "status_change",
    source: "manual",
    fromStatus: "Applied",
    toStatus: "Interview",
    occurredAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-20T10:00:00.000Z",
  },
  {
    id: "e2",
    applicationId: "a5",
    eventType: "status_change",
    source: "manual",
    fromStatus: "Interview",
    toStatus: "Rejected",
    occurredAt: "2026-07-25T10:00:00.000Z",
    createdAt: "2026-07-25T10:00:00.000Z",
  },
] as any[];

const result = buildApplicationFunnelIntelligence(
  applications,
  events,
  now,
);

assert.equal(result.submitted, 6);

assert.deepEqual(
  result.stages.map((stage) => [
    stage.stage,
    stage.reached,
  ]),
  [
    ["Applied", 6],
    ["Assessment", 1],
    ["Interview", 4],
    ["Case", 1],
    ["Offer", 1],
  ],
);

assert.equal(result.interviewToOfferRate, 25);

assert.equal(result.trend.current30Days.submitted, 3);
assert.equal(
  result.trend.current30Days.interviewReached,
  2,
);
assert.equal(result.trend.current30Days.offerReached, 1);

assert.equal(result.trend.previous30Days.submitted, 3);
assert.equal(
  result.trend.previous30Days.interviewReached,
  2,
);
assert.equal(
  result.trend.previous30Days.offerReached,
  0,
);

assert.equal(result.trend.interviewRateChange, 0);
assert.equal(result.trend.offerRateChange, 33);

assert.equal(
  result.insight.kind,
  "offer_bottleneck",
);

assert.equal(
  result.stages.find(
    (stage) => stage.stage === "Assessment",
  )?.reached,
  1,
  "Offer must not imply that Assessment was reached.",
);

console.log(
  "✓ Funnel Intelligence V2 regression checks passed",
);
