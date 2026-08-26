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
    jobUrl: "https://www.linkedin.com/jobs/view/1",
    applicationSource: "LinkedIn",
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

assert.equal(
  parsed.rows[0].input.applicationSource,
  "LinkedIn",
);

const aliases = parseApplicationsCsv(
  [
    "Title,Company,Source,Stage,Score",
    "Marketing Intern,Lalamove,Youthall,Assessment,74",
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

assert.equal(
  aliases.rows[0].input.applicationSource,
  "Youthall",
);

const inferredSource = parseApplicationsCsv(
  [
    "job_title,company_name,job_url,status",
    "Product Intern,Example,https://www.linkedin.com/jobs/view/99,Saved",
  ].join("\n"),
);

assert.equal(
  inferredSource.rows[0].input.applicationSource,
  "LinkedIn",
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

const invalidSource = parseApplicationsCsv(
  [
    "job_title,company_name,application_source",
    "Role E,Company E,MySpace",
  ].join("\n"),
);

assert.equal(invalidSource.rows.length, 0);
assert.equal(invalidSource.errors.length, 1);
assert.match(
  invalidSource.errors[0].message,
  /Unknown application source/,
);

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
