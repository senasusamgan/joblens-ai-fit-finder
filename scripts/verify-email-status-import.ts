import assert from "node:assert/strict";

import {
  findMatchingApplicationFromEmail,
  parsePastedRecruitmentEmail,
} from "../src/lib/email-status-import.ts";

import type { Application } from "../src/lib/applications.ts";

function application(
  id: string,
  companyName: string,
  jobTitle: string,
): Application {
  return {
    id,
    companyName,
    jobTitle,
    status: "Applied",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

const linkedIn =
  parsePastedRecruitmentEmail(`
From: LinkedIn <jobs-noreply@linkedin.com>
Subject: Your application was sent to Honda Türkiye A.Ş.

Your application was sent to Honda Türkiye A.Ş.
Product Intern
Application Date: August 17, 2026
`);

assert.ok(linkedIn);
assert.equal(linkedIn.status, "Applied");
assert.equal(
  linkedIn.companySuggestion,
  "Honda Türkiye A.Ş.",
);
assert.equal(
  linkedIn.jobTitleSuggestion,
  "Product Intern",
);
assert.equal(
  linkedIn.applicationDateIso,
  "2026-08-17",
);

console.log("✓ LinkedIn applied confirmation");

const bayer =
  parsePastedRecruitmentEmail(`
From: Bayer Careers <careers@bayer.com>
Subject: Interview invitation for Product Intern

We would like to invite you to an interview.
`);

assert.ok(bayer);
assert.equal(bayer.status, "Interview");
assert.equal(
  bayer.companySuggestion,
  "Bayer",
);
assert.equal(
  bayer.jobTitleSuggestion,
  "",
);

assert.equal(
  findMatchingApplicationFromEmail(
    bayer,
    [
      application(
        "bayer-product",
        "Bayer",
        "Product Intern",
      ),
    ],
  )?.application.id,
  "bayer-product",
);

assert.equal(
  findMatchingApplicationFromEmail(
    bayer,
    [
      application(
        "bayer-product",
        "Bayer",
        "Product Intern",
      ),
      application(
        "bayer-business",
        "Bayer",
        "Business Intern",
      ),
    ],
  ),
  null,
);

console.log("✓ Bayer matching safety");

const spotify =
  parsePastedRecruitmentEmail(`
From: Spotify Recruiting <jobs@spotify.com>
Subject: Application update

Unfortunately, we are not moving forward with your application.
`);

assert.ok(spotify);
assert.equal(spotify.status, "Rejected");
assert.equal(
  spotify.companySuggestion,
  "Spotify",
);

console.log("✓ Spotify rejection");

const aygaz =
  parsePastedRecruitmentEmail(`
Gönderen: Aygaz Kariyer Ekibi <kariyer@aygaz.com.tr>
Konu: Mülakat Daveti

Sizi mülakat sürecine davet etmek istiyoruz.
`);

assert.ok(aygaz);
assert.equal(aygaz.status, "Interview");
assert.equal(
  aygaz.companySuggestion,
  "Aygaz",
);

console.log("✓ Aygaz Turkish headers");

const englishDate =
  parsePastedRecruitmentEmail(`
From: LinkedIn <jobs-noreply@linkedin.com>
Subject: Application received

Thank you for applying.
Applied on August 17, 2026
`);

assert.ok(englishDate);
assert.equal(
  englishDate.applicationDateIso,
  "2026-08-17",
);

console.log("✓ Applied on without colon");

const invalidDate =
  parsePastedRecruitmentEmail(`
From: Example Careers <careers@example.com>
Subject: Application received

Thank you for applying.
Applied on February 31, 2026
`);

assert.ok(invalidDate);
assert.equal(
  invalidDate.applicationDateIso,
  "",
);

console.log("✓ Invalid calendar date rejected");

console.log(
  "\n✓ Email Status Import V1.1 regression checks passed",
);
