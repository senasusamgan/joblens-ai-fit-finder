import type {
  Application,
  ApplicationInput,
} from "./applications.ts";

export type ApplicationMatchReason =
  | "job_url"
  | "company_and_role";

export interface ApplicationMatch {
  application: Application;
  reason: ApplicationMatchReason;
  confidence: "strong";
}

type MatchInput = Pick<
  ApplicationInput,
  "jobTitle" | "companyName" | "jobUrl"
>;

export interface FindApplicationMatchOptions {
  excludeApplicationId?: string;
}

function normaliseText(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseApplicationRole(
  value: string,
): string {
  return normaliseText(value);
}

export function normaliseApplicationCompany(
  value: string,
): string {
  let company = normaliseText(value);

  const legalSuffix =
    /\s+(?:a s|as|anonim sirketi|ltd|limited|limited sirketi|inc|incorporated|corp|corporation|llc|plc)$/u;

  for (let index = 0; index < 3; index += 1) {
    const next = company
      .replace(legalSuffix, "")
      .trim();

    if (next === company) break;

    company = next;
  }

  return company;
}

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "trk",
  "trackingid",
  "refid",
]);

function isTrackingQueryKey(key: string): boolean {
  const normalised = key.toLowerCase();

  return (
    normalised.startsWith("utm_") ||
    TRACKING_QUERY_KEYS.has(normalised)
  );
}

export function normaliseApplicationJobUrl(
  value?: string,
): string {
  const raw = value?.trim();

  if (!raw) return "";

  let candidate = raw;

  if (
    !/^https?:\/\//i.test(candidate) &&
    /^[\w.-]+\.[a-z]{2,}\//i.test(candidate)
  ) {
    candidate = `https://${candidate}`;
  }

  try {
    const url = new URL(candidate);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return "";
    }

    const host = url.host
      .toLowerCase()
      .replace(/^www\./, "");

    let pathname = url.pathname || "/";

    if (
      pathname.length > 1 &&
      pathname.endsWith("/")
    ) {
      pathname = pathname.slice(0, -1);
    }

    const params = new URLSearchParams();

    for (const [key, item] of url.searchParams) {
      if (isTrackingQueryKey(key)) continue;

      params.append(key, item);
    }

    params.sort();

    const query = params.toString();

    return `${host}${pathname}${
      query ? `?${query}` : ""
    }`;
  } catch {
    return "";
  }
}

function uniqueMatch(
  applications: Application[],
): Application | null {
  return applications.length === 1
    ? applications[0]
    : null;
}

export function findSingleCompanyApplicationMatch(
  companyName: string,
  applications: Application[],
  options: FindApplicationMatchOptions = {},
): Application | null {
  const company =
    normaliseApplicationCompany(companyName);

  if (!company) return null;

  return uniqueMatch(
    applications.filter(
      (application) =>
        application.id !==
          options.excludeApplicationId &&
        normaliseApplicationCompany(
          application.companyName,
        ) === company,
    ),
  );
}

export function findStrongApplicationMatch(
  input: MatchInput,
  applications: Application[],
  options: FindApplicationMatchOptions = {},
): ApplicationMatch | null {
  const candidates = applications.filter(
    (application) =>
      application.id !==
      options.excludeApplicationId,
  );

  const inputUrl =
    normaliseApplicationJobUrl(input.jobUrl);

  if (inputUrl) {
    const urlMatches = candidates.filter(
      (application) =>
        normaliseApplicationJobUrl(
          application.jobUrl,
        ) === inputUrl,
    );

    const match = uniqueMatch(urlMatches);

    if (match) {
      return {
        application: match,
        reason: "job_url",
        confidence: "strong",
      };
    }
  }

  const inputCompany =
    normaliseApplicationCompany(
      input.companyName,
    );

  const inputRole =
    normaliseApplicationRole(input.jobTitle);

  if (!inputCompany || !inputRole) {
    return null;
  }

  const companyAndRoleMatches =
    candidates.filter(
      (application) =>
        normaliseApplicationCompany(
          application.companyName,
        ) === inputCompany &&
        normaliseApplicationRole(
          application.jobTitle,
        ) === inputRole,
    );

  const match =
    uniqueMatch(companyAndRoleMatches);

  if (!match) return null;

  return {
    application: match,
    reason: "company_and_role",
    confidence: "strong",
  };
}
