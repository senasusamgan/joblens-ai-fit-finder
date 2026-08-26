import assert from "node:assert/strict";
import {
  classifyGmailSignal,
} from "../src/lib/gmail-signal-parser.ts";

const cases = [
  {
    name: "Youthall application",
    input: {
      subject: "Başvurun alındı",
      from: '"Youthall.com" <no-reply@youthall.com>',
      snippet:
        "Başvurun Aygaz şirketine iletildi.",
    },
    expected: "Applied",
  },
  {
    name: "LinkedIn application",
    input: {
      subject:
        "Sena Su, başvurunuz Bayer şirketine gönderildi",
      from: "LinkedIn <jobs-noreply@linkedin.com>",
      snippet:
        "Başvurunuz Bayer şirketine gönderildi",
    },
    expected: "Applied",
  },
  {
    name: "Youthall video interview",
    input: {
      subject:
        "Video Mülakat İçin Davet Aldınız: Bir Sonraki Aşamaya Geçtiniz!",
      from: '"Youthall.com" <no-reply@youthall.com>',
      snippet:
        "Youthall seni video mülakatı aşamasına davet etti.",
    },
    expected: "Interview",
  },
  {
    name: "COP31 assessment",
    input: {
      subject:
        "COP31 Gönüllülük Programı Online Değerlendirme Sınavı",
      from: '"Yetenek.io" <info@ukxperience.com>',
      snippet:
        "Online Video Mülakat için değerlendirme süreciniz başlatılmıştır.",
    },
    expected: "Assessment",
  },
  {
    name: "Language assessment",
    input: {
      subject: "English Assessment Invitation",
      from: '"Careers" <careers@example.com>',
      snippet:
        "Please complete your online English language test before the deadline.",
    },
    expected: "Assessment",
  },
  {
    name: "LinkedIn job alert is not a signal",
    input: {
      subject:
        "tesviklendir.com şirketinde Stajyer Öğrenci",
      from:
        '"LinkedIn İş İlanı Uyarıları" <jobalerts-noreply@linkedin.com>',
      snippet:
        "İş ilanı hakkında iş hayatını yakından tanımak...",
    },
    expected: null,
  },
];

for (const testCase of cases) {
  const result = classifyGmailSignal(testCase.input);

  assert.equal(
    result?.kind ?? null,
    testCase.expected,
    `${testCase.name} failed`,
  );

  console.log(
    `✓ ${testCase.name} → ${result?.kind ?? "no signal"}`,
  );
}

console.log("\n✓ Gmail signal classification checks passed");
