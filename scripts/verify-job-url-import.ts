import assert from "node:assert/strict";

import {
  extractJobFromHtml,
  isLinkedInJobUrl,
  parsePublicJobUrl,
} from "../src/lib/job-url-import.ts";

const structured = extractJobFromHtml(`
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Product Intern",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "Example Labs"
  },
  "description": "<p>Join our product team and support research, customer discovery, experimentation and cross-functional delivery.</p><p>You will work with designers, engineers and business stakeholders while developing product thinking, communication and analytical skills. Candidates should be curious, collaborative and comfortable learning quickly in a fast-moving environment.</p>"
}
</script>
</head>
</html>
`);

assert.ok(structured);
assert.equal(structured.jobTitle, "Product Intern");
assert.equal(structured.companyName, "Example Labs");
assert.equal(
  structured.extractionMethod,
  "structured_data",
);
assert.ok(structured.jobDescription.length >= 150);

const fallback = extractJobFromHtml(`
<html>
<head>
  <meta property="og:title" content="Business Development Intern">
</head>
<body>
<main>
  <h1>Business Development Intern</h1>
  <p>We are looking for a motivated intern to support partnership research, market mapping, outreach preparation and commercial analysis.</p>
  <p>The role involves working across multiple teams, organizing findings, preparing presentations and helping identify new growth opportunities. Strong communication, curiosity and structured problem solving are important for success in this internship.</p>
</main>
</body>
</html>
`);

assert.ok(fallback);
assert.equal(
  fallback.jobTitle,
  "Business Development Intern",
);
assert.equal(fallback.extractionMethod, "page_text");

assert.equal(
  parsePublicJobUrl(
    "https://careers.example.com/jobs/123",
  ).hostname,
  "careers.example.com",
);

assert.throws(() =>
  parsePublicJobUrl("http://127.0.0.1/admin"),
);

assert.throws(() =>
  parsePublicJobUrl("http://192.168.1.5/job"),
);

assert.equal(
  isLinkedInJobUrl(
    "https://www.linkedin.com/jobs/view/123456789",
  ),
  true,
);

assert.equal(
  isLinkedInJobUrl(
    "https://jobs.lever.co/example/123",
  ),
  false,
);

console.log("✓ LinkedIn job URLs detected");

console.log("✓ Job URL Import regression checks passed");
