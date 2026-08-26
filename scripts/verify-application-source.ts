import assert from "node:assert/strict";

import {
  detectApplicationSourceFromUrl,
  normaliseApplicationSource,
} from "../src/lib/application-source.ts";

assert.equal(
  detectApplicationSourceFromUrl(
    "https://www.linkedin.com/jobs/view/123",
  ),
  "LinkedIn",
);

assert.equal(
  detectApplicationSourceFromUrl(
    "https://www.youthall.com/tr/company/jobs/123",
  ),
  "Youthall",
);

assert.equal(
  detectApplicationSourceFromUrl(
    "https://www.kariyer.net/is-ilani/123",
  ),
  "Kariyer.net",
);

assert.equal(
  detectApplicationSourceFromUrl(
    "https://tr.indeed.com/viewjob?jk=123",
  ),
  "Indeed",
);

assert.equal(
  detectApplicationSourceFromUrl(
    "https://www.glassdoor.com/job-listing/123",
  ),
  "Glassdoor",
);

assert.equal(
  detectApplicationSourceFromUrl(
    "https://jobs.example.com/role/123",
  ),
  undefined,
);

assert.equal(
  normaliseApplicationSource("employee referral"),
  "Referral",
);

assert.equal(
  normaliseApplicationSource("Career Fair"),
  "Networking / Event",
);

assert.equal(
  normaliseApplicationSource("not-a-source"),
  undefined,
);

console.log(
  "✓ Application source regression checks passed",
);
