import assert from "node:assert/strict";

import {
  applicationImportFingerprint,
  applicationsToCsv,
  parseApplicationsCsv,
} from "../src/lib/applications-csv.ts";

const csv = applicationsToCsv([
  {
    id: "1",
    jobTitle: "Product Intern",
    companyName: "Example, Inc.",
    jobUrl: "https://example.com/jobs/1",
    status: "Applied",
    matchScore: 82,
    verdict: "Worth Applying",
    jobDescription:
      'Build products, analyse feedback, and say "why".',
    appliedAt: "2026-08-20T09:00:00.000Z",
    notes: "Follow up next week.\nRecruiter: Jane",
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
  },
]);

const parsed = parseApplicationsCsv(csv);

assert.equal(parsed.totalRows, 1);
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.rows.length, 1);

assert.equal(
  parsed.rows[0].input.companyName,
  "Example, Inc.",
);

assert.equal(
  parsed.rows[0].input.notes,
  "Follow up next week.\nRecruiter: Jane",
);

assert.equal(
  parsed.rows[0].input.status,
  "Applied",
);

const aliases = parseApplicationsCsv(
  [
    "Title,Company,Stage,Score",
    "Marketing Intern,Lalamove,Assessment,74",
  ].join("\n"),
);

assert.equal(aliases.errors.length, 0);
assert.equal(
  aliases.rows[0].input.jobTitle,
  "Marketing Intern",
);
assert.equal(
  aliases.rows[0].input.status,
  "Assessment",
);
assert.equal(
  aliases.rows[0].input.matchScore,
  74,
);

const invalid = parseApplicationsCsv(
  [
    "job_title,company_name,status,match_score",
    "Role A,Company A,Unknown,50",
    "Role B,Company B,Applied,140",
    ",Company C,Saved,50",
    "Role D,,Saved,50",
  ].join("\n"),
);

assert.equal(invalid.rows.length, 0);
assert.equal(invalid.errors.length, 4);

assert.equal(
  applicationImportFingerprint({
    jobTitle: " Product Intern ",
    companyName: "Example Labs",
    jobUrl: "https://example.com/job",
    appliedAt: "2026-08-20T09:00:00Z",
  }),
  "product intern|example labs|https://example.com/job|2026-08-20",
);

console.log(
  "✓ Applications CSV regression checks passed",
);
