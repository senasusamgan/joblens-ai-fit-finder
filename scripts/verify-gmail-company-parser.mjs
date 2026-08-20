import assert from "node:assert/strict";
import {
  extractCompanyFromSignal,
  suggestCompanyFromSignal,
} from "../src/lib/gmail-signal-parser.ts";

const cases = [
  {
    name: "Youthall — Aygaz",
    signal: {
      subject: "Başvurun alındı",
      from: '"Youthall.com" <no-reply@youthall.com>',
      snippet:
        "youthall.com Başvurun alındı Başvurun Aygaz şirketine iletildi. Görüntüle",
    },
    expected: "Aygaz",
  },
  {
    name: "LinkedIn — Bayer",
    signal: {
      subject:
        "Sena Su, başvurunuz Bayer şirketine gönderildi",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
      snippet: "Başvurunuz Bayer şirketine gönderildi",
    },
    expected: "Bayer",
  },
  {
    name: "LinkedIn — Honda Türkiye A.Ş.",
    signal: {
      subject:
        "Sena Su, başvurunuz Honda Türkiye A.Ş. şirketine gönderildi",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
      snippet:
        "Başvurunuz Honda Türkiye A.Ş. şirketine gönderildi",
    },
    expected: "Honda Türkiye A.Ş.",
  },
];

for (const testCase of cases) {
  const extracted = extractCompanyFromSignal(testCase.signal);
  const suggested = suggestCompanyFromSignal(testCase.signal);

  assert.equal(
    extracted,
    testCase.expected,
    `${testCase.name}: extraction failed`,
  );

  assert.equal(
    suggested,
    testCase.expected,
    `${testCase.name}: suggestion failed`,
  );

  console.log(`✓ ${testCase.name} → ${suggested}`);
}

console.log("\n✓ Gmail company parser regression checks passed");
