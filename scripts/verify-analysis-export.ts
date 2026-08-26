import assert from "node:assert/strict";

import {
  buildAnalysisExportFilename,
  buildAnalysisExportText,
  buildAnalysisShareSummary,
  type AnalysisExportInput,
} from "../src/lib/analysis-export.ts";

const input: AnalysisExportInput = {
  jobTitle: "Product Intern",
  companyName: "Example Labs",
  jobUrl: "https://careers.example.com/jobs/123",
  language: "English",
  analysis: {
    verdict: "Worth Applying",
    verdictExplanation:
      "Your experience covers several core requirements.",
    matchScore: 78,
    strongMatches: [
      {
        requirement: "Analytical thinking",
        jobEvidence: "The role requires data analysis.",
        cvEvidence: "Built an operational dashboard.",
        explanation: "Direct evidence exists.",
      },
    ],
    partialMatches: [],
    learnableGaps: [],
    possibleBlockers: [],
    cvSuggestions: [
      {
        section: "Projects",
        suggestion: "Make the outcome clearer.",
        reason: "The role values measurable impact.",
        example: "Built a dashboard that improved reporting.",
      },
    ],
    recruiterMessage: "Hello, I’m interested in this opportunity.",
    disclaimer: "Estimated analysis only.",
  },
  decisionBrief: {
    evidenceStrengthLabel: "Good",
    mainRisk: "Limited direct product ownership.",
    bestNextMove: "Strengthen your project evidence.",
    recruiterPerspective: "A credible early-career profile.",
  },
  careerDirection: {
    label: "Strong Direction Fit",
    score: 91,
  },
};

const summary = buildAnalysisShareSummary(input);

assert.match(summary, /Product Intern/);
assert.match(summary, /78\/100/);
assert.match(summary, /Best next move/);

const report = buildAnalysisExportText(input);

assert.match(report, /STRONG MATCHES/);
assert.match(report, /Built an operational dashboard/);
assert.match(report, /CV IMPROVEMENT SUGGESTIONS/);
assert.match(report, /https:\/\/careers\.example\.com\/jobs\/123/);

assert.equal(
  buildAnalysisExportFilename(input),
  "example-labs-product-intern-joblens.txt",
);

console.log("✓ Analysis export regression checks passed");
