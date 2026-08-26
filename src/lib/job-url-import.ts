export type JobUrlExtraction = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  extractionMethod: "structured_data" | "page_text";
};

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name) => named[name.toLowerCase()] ?? match,
    );
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(
        /<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " ",
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|article|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getAttribute(
  tag: string,
  attribute: string,
): string | null {
  const match = tag.match(
    new RegExp(
      `${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function getMetaContent(
  html: string,
  key: string,
): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const property =
      getAttribute(tag, "property") ??
      getAttribute(tag, "name");

    if (property?.toLowerCase() !== key.toLowerCase()) {
      continue;
    }

    return decodeHtmlEntities(
      getAttribute(tag, "content") ?? "",
    ).trim();
  }

  return "";
}

function getTitleTag(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return match
    ? htmlToPlainText(match[1])
    : "";
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }

    return null;
  }

  if (typeof value !== "object") return null;

  const object = value as Record<string, unknown>;
  const type = object["@type"];

  const types = Array.isArray(type)
    ? type
    : [type];

  if (
    types.some(
      (item) =>
        typeof item === "string" &&
        item.toLowerCase() === "jobposting",
    )
  ) {
    return object;
  }

  for (const child of Object.values(object)) {
    const found = findJobPosting(child);
    if (found) return found;
  }

  return null;
}

function extractStructuredJob(
  html: string,
): JobUrlExtraction | null {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      const job = findJobPosting(parsed);

      if (!job) continue;

      const hiringOrganization =
        job.hiringOrganization &&
        typeof job.hiringOrganization === "object"
          ? (job.hiringOrganization as Record<string, unknown>)
          : null;

      const jobTitle =
        typeof job.title === "string"
          ? htmlToPlainText(job.title)
          : "";

      const companyName =
        typeof hiringOrganization?.name === "string"
          ? htmlToPlainText(hiringOrganization.name)
          : "";

      const jobDescription =
        typeof job.description === "string"
          ? htmlToPlainText(job.description)
          : "";

      if (jobDescription.length >= 150) {
        return {
          jobTitle,
          companyName,
          jobDescription,
          extractionMethod: "structured_data",
        };
      }
    } catch {
      // Ignore malformed JSON-LD and continue to other blocks.
    }
  }

  return null;
}

function extractReadablePageText(html: string): string {
  const article =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html;

  return htmlToPlainText(
    article
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, " "),
  );
}

export function extractJobFromHtml(
  html: string,
): JobUrlExtraction | null {
  const structured = extractStructuredJob(html);

  if (structured) {
    return structured;
  }

  const jobDescription = extractReadablePageText(html);

  if (jobDescription.length < 150) {
    return null;
  }

  const jobTitle =
    getMetaContent(html, "og:title") ||
    getMetaContent(html, "twitter:title") ||
    getTitleTag(html);

  return {
    jobTitle,
    companyName: "",
    jobDescription,
    extractionMethod: "page_text",
  };
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) ||
        part < 0 ||
        part > 255,
    )
  ) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function isLinkedInJobUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "linkedin.com" ||
      hostname === "www.linkedin.com" ||
      hostname.endsWith(".linkedin.com")
    );
  } catch {
    return false;
  }
}

export function parsePublicJobUrl(value: string): URL {
  const url = new URL(value.trim());

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new Error("unsupported_protocol");
  }

  if (url.username || url.password) {
    throw new Error("credentials_not_allowed");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "::1" ||
    hostname.includes(":") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("private_address");
  }

  return url;
}
