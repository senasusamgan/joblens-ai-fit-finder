import {
  classifyGmailSignal,
  extractCompanyFromSignal,
  suggestCompanyFromSignal,
  type GmailSignalKind,
} from "@/lib/gmail-signal-parser";

export interface ParsedRecruitmentEmail {
  status: GmailSignalKind;
  confidence: "high" | "medium";
  companySuggestion: string;
  jobTitleSuggestion: string;
  applicationDateSuggestion: string;
  applicationDateIso: string;
  rawText: string;
}

function extractCompany(rawText: string): string {
  const signal = {
    subject: "",
    from: "",
    snippet: rawText,
  };

  return (
    extractCompanyFromSignal(signal) ??
    suggestCompanyFromSignal(signal)
  );
}

function extractJobTitle(rawText: string): string {
  const company = extractCompany(rawText);
  const normalisedCompany =
    company.toLocaleLowerCase("tr-TR");

  const lines = rawText
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/\*\*/g, "")
        .replace(/^\|\s*|\s*\|$/g, "")
        .trim(),
    )
    .filter(Boolean);

  const noiseTerms = new Set([
    "inbox",
    "linkedin",
    "unsubscribe",
    "to me",
    "svg",
    "image",
  ]);

  const confirmationIndexes = lines
    .map((line, index) =>
      /başvurunuz[\s\S]*şirketine\s+(?:gönderildi|iletildi|görüntülendi)/i.test(
        line,
      ) ||
      /your\s+application[\s\S]*(?:sent\s+to|viewed\s+by)/i.test(
        line,
      )
        ? index
        : -1,
    )
    .filter((index) => index >= 0);

  const confirmationIndex =
    confirmationIndexes.at(-1) ?? -1;

  if (confirmationIndex >= 0) {
    for (
      let index = confirmationIndex + 1;
      index < Math.min(
        lines.length,
        confirmationIndex + 10,
      );
      index += 1
    ) {
      const candidate = lines[index];

      const normalisedCandidate =
        candidate.toLocaleLowerCase("tr-TR");

      if (!candidate) continue;

      if (noiseTerms.has(normalisedCandidate)) {
        continue;
      }

      if (
        normalisedCandidate ===
        normalisedCompany
      ) {
        continue;
      }

      // Example:
      // Honda Türkiye A.Ş. · Maltepe (Ofiste)
      if (
        normalisedCompany &&
        normalisedCandidate.includes(
          normalisedCompany,
        )
      ) {
        continue;
      }

      if (
        /^(başvuru tarihi|application date|applied on)\s*:/i.test(
          candidate,
        )
      ) {
        continue;
      }

      if (
        /^(thu|fri|sat|sun|mon|tue|wed),/i.test(
          candidate,
        )
      ) {
        continue;
      }

      if (candidate.includes("@")) {
        continue;
      }

      if (candidate.includes("·")) {
        continue;
      }

      // Ignore another application-confirmation line.
      if (
        /başvurunuz[\s\S]*şirketine/i.test(
          candidate,
        )
      ) {
        continue;
      }

      return candidate;
    }
  }

  // Fallback when the copied email preserves LinkedIn markdown.
  const matches = rawText.matchAll(
    /\[([^\]\n]+)\]\([^)\n]*\/jobs\/view\/[^)\n]+\)/gi,
  );

  for (const match of matches) {
    const value = match[1]?.trim();
    if (!value) continue;

    const normalisedValue =
      value.toLocaleLowerCase("tr-TR");

    if (
      normalisedValue === normalisedCompany ||
      noiseTerms.has(normalisedValue) ||
      value.includes("·")
    ) {
      continue;
    }

    return value;
  }

  return "";
}
function applicationDateToIso(
  value: string,
): string {
  if (!value) return "";

  const months: Record<string, number> = {
    ocak: 1,
    şubat: 2,
    subat: 2,
    mart: 3,
    nisan: 4,
    mayıs: 5,
    mayis: 5,
    haziran: 6,
    temmuz: 7,
    ağustos: 8,
    agustos: 8,
    eylül: 9,
    eylul: 9,
    ekim: 10,
    kasım: 11,
    kasim: 11,
    aralık: 12,
    aralik: 12,

    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  const match = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .match(
      /(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/iu,
    );

  if (!match) return "";

  const day = Number(match[1]);
  const month = months[match[2]];
  const year = Number(match[3]);

  if (!month || !day || !year) return "";

  return [
    String(year),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function extractApplicationDate(
  rawText: string,
): string {
  const patterns = [
    /başvuru\s+tarihi\s*:\s*([^\n|]+)/i,
    /application\s+date\s*:\s*([^\n|]+)/i,
    /applied\s+on\s*:\s*([^\n|]+)/i,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);

    if (match?.[1]) {
      return match[1]
        .replace(/\*\*/g, "")
        .trim();
    }
  }

  return "";
}

function classifyDirectPaste(
  rawText: string,
): {
  kind: GmailSignalKind;
  confidence: "high" | "medium";
} | null {
  const text = rawText.toLocaleLowerCase();

  // Strong deterministic application confirmation patterns.
  if (
    /başvurunuz[\s\S]{0,160}?şirketine\s+(?:gönderildi|iletildi|görüntülendi)/i.test(
      rawText,
    ) ||
    /your\s+application[\s\S]{0,160}?(?:sent\s+to|viewed\s+by)/i.test(
      rawText,
    )
  ) {
    return {
      kind: "Applied",
      confidence: "high",
    };
  }

  // Reuse the existing deterministic status classifier
  // for interview / case / offer / rejection language.
  return classifyGmailSignal({
    subject: "",
    from: "",
    snippet: text,
  });
}

export function parsePastedRecruitmentEmail(
  rawText: string,
): ParsedRecruitmentEmail | null {
  const text = rawText.trim();

  if (!text) return null;

  const classification =
    classifyDirectPaste(text);

  if (!classification) return null;

  const applicationDateSuggestion =
    extractApplicationDate(text);

  return {
    status: classification.kind,
    confidence: classification.confidence,
    companySuggestion: extractCompany(text),
    jobTitleSuggestion: extractJobTitle(text),
    applicationDateSuggestion,
    applicationDateIso:
      applicationDateToIso(
        applicationDateSuggestion,
      ),
    rawText: text,
  };
}

import type { Application } from "@/lib/applications";

export interface EmailImportApplicationMatch {
  application: Application;
  reason: "company" | "company_and_position";
}

function normaliseMatchText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/\b(a\.?\s*ş\.?|anonim şirketi|ltd\.?|limited|inc\.?|corp\.?|corporation)\b/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findMatchingApplicationFromEmail(
  parsed: ParsedRecruitmentEmail,
  applications: Application[],
): EmailImportApplicationMatch | null {
  const company = normaliseMatchText(
    parsed.companySuggestion,
  );

  if (!company) return null;

  const companyMatches = applications.filter(
    (application) =>
      normaliseMatchText(application.companyName) ===
      company,
  );

  if (companyMatches.length === 0) {
    return null;
  }

  const position = normaliseMatchText(
    parsed.jobTitleSuggestion,
  );

  if (position) {
    const positionMatches = companyMatches.filter(
      (application) =>
        normaliseMatchText(application.jobTitle) ===
        position,
    );

    if (positionMatches.length === 1) {
      return {
        application: positionMatches[0],
        reason: "company_and_position",
      };
    }
  }

  if (companyMatches.length === 1) {
    return {
      application: companyMatches[0],
      reason: "company",
    };
  }

  return null;
}
