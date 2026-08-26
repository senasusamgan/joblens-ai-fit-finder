export const APPLICATION_SOURCES = [
  "LinkedIn",
  "Company Website",
  "Youthall",
  "Kariyer.net",
  "Indeed",
  "Glassdoor",
  "Referral",
  "Networking / Event",
  "Other Job Board",
  "Other",
] as const;

export type ApplicationSource =
  (typeof APPLICATION_SOURCES)[number];

const SOURCE_ALIASES: Record<
  string,
  ApplicationSource
> = {
  linkedin: "LinkedIn",
  "company website": "Company Website",
  "company site": "Company Website",
  "career site": "Company Website",
  "careers page": "Company Website",
  youthall: "Youthall",
  "kariyer.net": "Kariyer.net",
  kariyer: "Kariyer.net",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  referral: "Referral",
  "employee referral": "Referral",
  networking: "Networking / Event",
  "networking / event": "Networking / Event",
  event: "Networking / Event",
  "career fair": "Networking / Event",
  "other job board": "Other Job Board",
  "job board": "Other Job Board",
  other: "Other",
};

export function normaliseApplicationSource(
  value: string | null | undefined,
): ApplicationSource | undefined {
  const normalised = value?.trim().toLowerCase();

  if (!normalised) return undefined;

  return SOURCE_ALIASES[normalised];
}

function isDomainOrSubdomain(
  hostname: string,
  domain: string,
): boolean {
  return (
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

export function detectApplicationSourceFromUrl(
  value: string | null | undefined,
): ApplicationSource | undefined {
  const raw = value?.trim();

  if (!raw) return undefined;

  try {
    const url = new URL(
      raw.includes("://")
        ? raw
        : `https://${raw}`,
    );

    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (
      isDomainOrSubdomain(
        hostname,
        "linkedin.com",
      )
    ) {
      return "LinkedIn";
    }

    if (
      isDomainOrSubdomain(
        hostname,
        "youthall.com",
      )
    ) {
      return "Youthall";
    }

    if (
      isDomainOrSubdomain(
        hostname,
        "kariyer.net",
      )
    ) {
      return "Kariyer.net";
    }

    if (
      isDomainOrSubdomain(
        hostname,
        "indeed.com",
      ) ||
      isDomainOrSubdomain(
        hostname,
        "indeed.co.uk",
      ) ||
      isDomainOrSubdomain(
        hostname,
        "indeed.com.tr",
      )
    ) {
      return "Indeed";
    }

    if (
      isDomainOrSubdomain(
        hostname,
        "glassdoor.com",
      ) ||
      isDomainOrSubdomain(
        hostname,
        "glassdoor.co.uk",
      ) ||
      isDomainOrSubdomain(
        hostname,
        "glassdoor.com.tr",
      )
    ) {
      return "Glassdoor";
    }

    return undefined;
  } catch {
    return undefined;
  }
}
