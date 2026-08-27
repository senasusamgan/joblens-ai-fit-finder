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

interface CopiedEmailHeaders {
  subject: string;
  from: string;
}

function extractCopiedEmailHeaders(
  rawText: string,
): CopiedEmailHeaders {
  let subject = "";
  let from = "";

  const lines = rawText
    .split(/\r?\n/)
    .slice(0, 50);

  for (const line of lines) {
    if (!from) {
      const match = line.match(
        /^\s*(?:from|kimden|gönderen)\s*:\s*(.+?)\s*$/iu,
      );

      if (match?.[1]) {
        from = match[1].trim();
      }
    }

    if (!subject) {
      const match = line.match(
        /^\s*(?:subject|konu)\s*:\s*(.+?)\s*$/iu,
      );

      if (match?.[1]) {
        subject = match[1].trim();
      }
    }

    if (from && subject) break;
  }

  return {
    subject,
    from,
  };
}

function cleanSenderCompany(
  value: string,
): string {
  let company = value
    .replace(/\s+/g, " ")
    .trim();

  const suffix =
    /\s+(?:careers?(?:\s+team)?|career\s+team|recruiting|recruitment|talent\s+acquisition|hr|human\s+resources|jobs?|kariyer(?:\s+ekibi)?|işe\s+alım(?:\s+ekibi)?|insan\s+kaynakları(?:\s+ekibi)?)$/iu;

  for (let index = 0; index < 3; index += 1) {
    const cleaned = company
      .replace(suffix, "")
      .trim();

    if (cleaned === company) break;

    company = cleaned;
  }

  return company;
}

function isGenericSenderCompany(
  value: string,
): boolean {
  // Locale-independent on purpose:
  // Turkish locale turns "LinkedIn" into "linkedın".
  const company = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return [
    "linkedin",
    "youthall",
    "indeed",
    "greenhouse",
    "lever",
    "workday",
    "smartrecruiters",
    "teamtailor",
    "noreply",
    "no-reply",
    "no reply",
    "recruiting",
    "recruitment",
    "careers",
    "jobs",
  ].includes(company);
}

function extractCompany(rawText: string): string {
  const headers =
    extractCopiedEmailHeaders(rawText);

  const signal = {
    subject: headers.subject,
    from: headers.from,
    snippet: rawText,
  };

  const explicitCompany =
    extractCompanyFromSignal(signal);

  if (explicitCompany) {
    return explicitCompany;
  }

  const senderCompany = cleanSenderCompany(
    suggestCompanyFromSignal(signal),
  );

  if (
    !senderCompany ||
    isGenericSenderCompany(senderCompany)
  ) {
    return "";
  }

  return senderCompany;
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
        /^(başvuru tarihi|application date|applied on)\s*:?/i.test(
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
const APPLICATION_DATE_MONTHS: Record<
  string,
  number
> = {
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
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function validApplicationDateIso(
  year: number,
  month: number,
  day: number,
): string {
  if (!year || !month || !day) return "";

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return [
    String(year),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function applicationDateToIso(
  value: string,
): string {
  if (!value) return "";

  const text = value
    .replace(/\*\*/g, "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  let match = text.match(
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  );

  if (match) {
    return validApplicationDateIso(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  match = text.match(
    /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/,
  );

  if (match) {
    return validApplicationDateIso(
      Number(match[3]),
      Number(match[2]),
      Number(match[1]),
    );
  }

  match = text.match(
    /\b(\d{1,2})\s+([a-zçğıöşü]+)\s*,?\s*(\d{4})\b/iu,
  );

  if (match) {
    return validApplicationDateIso(
      Number(match[3]),
      APPLICATION_DATE_MONTHS[match[2]],
      Number(match[1]),
    );
  }

  match = text.match(
    /\b([a-zçğıöşü]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})\b/iu,
  );

  if (match) {
    return validApplicationDateIso(
      Number(match[3]),
      APPLICATION_DATE_MONTHS[match[1]],
      Number(match[2]),
    );
  }

  return "";
}

function extractApplicationDate(
  rawText: string,
): string {
  const patterns = [
    /başvuru\s+tarihi\s*:?\s*([^\n|]+)/i,
    /application\s+date\s*:?\s*([^\n|]+)/i,
    /applied\s+on\s*:?\s*([^\n|]+)/i,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);

    if (!match?.[1]) continue;

    const value = match[1]
      .replace(/\*\*/g, "")
      .trim();

    if (applicationDateToIso(value)) {
      return value;
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
  const headers =
    extractCopiedEmailHeaders(rawText);

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

  return classifyGmailSignal({
    subject: headers.subject,
    from: headers.from,
    snippet: rawText,
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
import {
  findSingleCompanyApplicationMatch,
  findStrongApplicationMatch,
} from "./application-matching.ts";

export interface EmailImportApplicationMatch {
  application: Application;
  reason: "company" | "company_and_position";
}

export function findMatchingApplicationFromEmail(
  parsed: ParsedRecruitmentEmail,
  applications: Application[],
): EmailImportApplicationMatch | null {
  const company = parsed.companySuggestion.trim();

  if (!company) return null;

  const position =
    parsed.jobTitleSuggestion.trim();

  if (position) {
    const strongMatch =
      findStrongApplicationMatch(
        {
          jobTitle: position,
          companyName: company,
          jobUrl: undefined,
        },
        applications,
      );

    if (
      strongMatch?.reason ===
      "company_and_role"
    ) {
      return {
        application: strongMatch.application,
        reason: "company_and_position",
      };
    }
  }

  const companyMatch =
    findSingleCompanyApplicationMatch(
      company,
      applications,
    );

  if (!companyMatch) return null;

  return {
    application: companyMatch,
    reason: "company",
  };
}
