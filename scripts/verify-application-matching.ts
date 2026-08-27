import assert from "node:assert/strict";

import {
  findSingleCompanyApplicationMatch,
  findStrongApplicationMatch,
  normaliseApplicationCompany,
  normaliseApplicationJobUrl,
  normaliseApplicationRole,
} from "../src/lib/application-matching.ts";

import type {
  Application,
  ApplicationStatus,
} from "../src/lib/applications.ts";

function makeApplication(
  id: string,
  jobTitle: string,
  companyName: string,
  options: {
    jobUrl?: string;
    status?: ApplicationStatus;
  } = {},
): Application {
  const now = new Date().toISOString();

  return {
    id,
    jobTitle,
    companyName,
    jobUrl: options.jobUrl,
    status: options.status ?? "Applied",
    createdAt: now,
    updatedAt: now,
  };
}

/* Normalisation */

assert.equal(
  normaliseApplicationRole(
    "  Business Development Intern  ",
  ),
  "business development intern",
);

assert.equal(
  normaliseApplicationCompany(
    "Genveon İlaç A.Ş.",
  ),
  "genveon ilac",
);

assert.equal(
  normaliseApplicationJobUrl(
    "https://www.linkedin.com/jobs/view/12345/?utm_source=email&trackingId=abc",
  ),
  "linkedin.com/jobs/view/12345",
);

assert.equal(
  normaliseApplicationJobUrl(
    "https://careers.example.com/job?b=2&a=1&utm_campaign=test",
  ),
  "careers.example.com/job?a=1&b=2",
);

/* URL matching */

const linkedinApplication = makeApplication(
  "linkedin-1",
  "Product Intern",
  "Example Company",
  {
    jobUrl:
      "https://www.linkedin.com/jobs/view/12345?trackingId=old",
  },
);

const urlMatch = findStrongApplicationMatch(
  {
    jobTitle: "Different Display Title",
    companyName: "Example Company",
    jobUrl:
      "https://linkedin.com/jobs/view/12345?utm_source=share",
  },
  [linkedinApplication],
);

assert.ok(urlMatch);
assert.equal(urlMatch.reason, "job_url");
assert.equal(
  urlMatch.application.id,
  "linkedin-1",
);

/* Company + role matching */

const companyRoleApplication =
  makeApplication(
    "company-role-1",
    "Business Development Intern",
    "Genveon İlaç A.Ş.",
  );

const companyRoleMatch =
  findStrongApplicationMatch(
    {
      jobTitle:
        " business-development intern ",
      companyName: "GENVEON İLAÇ",
      jobUrl: undefined,
    },
    [companyRoleApplication],
  );

assert.ok(companyRoleMatch);
assert.equal(
  companyRoleMatch.reason,
  "company_and_role",
);
assert.equal(
  companyRoleMatch.application.id,
  "company-role-1",
);

/* Company-only fallback */

const uniqueCompanyMatch =
  findSingleCompanyApplicationMatch(
    "Genveon İlaç",
    [companyRoleApplication],
  );

assert.ok(uniqueCompanyMatch);
assert.equal(
  uniqueCompanyMatch.id,
  "company-role-1",
);

const ambiguousCompanyMatch =
  findSingleCompanyApplicationMatch(
    "Acme",
    [
      makeApplication(
        "acme-one",
        "Product Intern",
        "Acme",
      ),
      makeApplication(
        "acme-two",
        "Business Intern",
        "Acme",
      ),
    ],
  );

assert.equal(
  ambiguousCompanyMatch,
  null,
  "Company-only matching must stay ambiguous when multiple applications exist",
);

/* Safety */

const differentRole =
  findStrongApplicationMatch(
    {
      jobTitle: "Product Intern",
      companyName: "Genveon İlaç",
      jobUrl: undefined,
    },
    [companyRoleApplication],
  );

assert.equal(differentRole, null);

const differentCompany =
  findStrongApplicationMatch(
    {
      jobTitle:
        "Business Development Intern",
      companyName: "Another Company",
      jobUrl: undefined,
    },
    [companyRoleApplication],
  );

assert.equal(differentCompany, null);

const ambiguousApplications = [
  makeApplication(
    "duplicate-1",
    "Product Intern",
    "Acme",
  ),
  makeApplication(
    "duplicate-2",
    "Product Intern",
    "Acme",
  ),
];

const ambiguous =
  findStrongApplicationMatch(
    {
      jobTitle: "Product Intern",
      companyName: "Acme",
      jobUrl: undefined,
    },
    ambiguousApplications,
  );

assert.equal(
  ambiguous,
  null,
  "Ambiguous matches must not be auto-selected",
);

const selfExcluded =
  findStrongApplicationMatch(
    {
      jobTitle: "Product Intern",
      companyName: "Acme",
      jobUrl: undefined,
    },
    [
      makeApplication(
        "editing-self",
        "Product Intern",
        "Acme",
      ),
    ],
    {
      excludeApplicationId:
        "editing-self",
    },
  );

assert.equal(
  selfExcluded,
  null,
  "Editing an application must not match itself",
);

/* Meaningful URL query params must stay distinct */

const queryIdOne = makeApplication(
  "query-job-1",
  "Role One",
  "Example",
  {
    jobUrl:
      "https://careers.example.com/job?id=100",
  },
);

const queryIdDifferent =
  findStrongApplicationMatch(
    {
      jobTitle: "Role Two",
      companyName: "Example",
      jobUrl:
        "https://careers.example.com/job?id=200",
    },
    [queryIdOne],
  );

assert.equal(
  queryIdDifferent,
  null,
  "Meaningful URL query parameters must be preserved",
);

console.log(
  "✓ Application matching regression checks passed",
);
