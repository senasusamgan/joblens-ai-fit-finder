import type {
  Application,
  ApplicationInput,
  ApplicationStatus,
} from "@/lib/applications";

const CSV_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "Saved",
  "Applied",
  "Assessment",
  "Interview",
  "Case",
  "Offer",
  "Rejected",
];

export const APPLICATION_CSV_COLUMNS = [
  "job_title",
  "company_name",
  "job_url",
  "status",
  "match_score",
  "verdict",
  "job_description",
  "applied_at",
  "notes",
] as const;

export type ApplicationCsvImportRow = {
  rowNumber: number;
  input: ApplicationInput;
};

export type ApplicationCsvRowError = {
  rowNumber: number;
  message: string;
};

export type ApplicationCsvParseResult = {
  rows: ApplicationCsvImportRow[];
  errors: ApplicationCsvRowError[];
  totalRows: number;
};

const HEADER_ALIASES: Record<
  (typeof APPLICATION_CSV_COLUMNS)[number],
  string[]
> = {
  job_title: ["job_title", "title", "role", "position"],
  company_name: ["company_name", "company"],
  job_url: ["job_url", "url", "job_link", "link"],
  status: ["status", "stage"],
  match_score: ["match_score", "score", "match"],
  verdict: ["verdict", "fit_verdict"],
  job_description: ["job_description", "description", "jd"],
  applied_at: [
    "applied_at",
    "applied_date",
    "application_date",
    "date_applied",
  ],
  notes: ["notes", "note"],
};

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

function escapeCsvValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function parseCsvMatrix(value: string): string[][] {
  const input = value.replace(/^\uFEFF/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }

      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      row.push(field);
      field = "";

      if (
        row.some((cell) => cell.trim().length > 0)
      ) {
        rows.push(row);
      }

      row = [];

      if (
        char === "\r" &&
        input[index + 1] === "\n"
      ) {
        index += 1;
      }

      continue;
    }

    field += char;
  }

  if (quoted) {
    throw new Error(
      "The CSV contains an unclosed quoted field.",
    );
  }

  row.push(field);

  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function findColumn(
  headers: string[],
  column: (typeof APPLICATION_CSV_COLUMNS)[number],
): number {
  const aliases = HEADER_ALIASES[column];

  return headers.findIndex((header) =>
    aliases.includes(header),
  );
}

function readCell(
  row: string[],
  headers: string[],
  column: (typeof APPLICATION_CSV_COLUMNS)[number],
): string {
  const index = findColumn(headers, column);

  if (index < 0) {
    return "";
  }

  return row[index]?.trim() ?? "";
}

function parseStatus(
  value: string,
): ApplicationStatus | null {
  if (!value) {
    return "Saved";
  }

  const status = CSV_APPLICATION_STATUSES.find(
    (candidate) =>
      candidate.toLowerCase() === value.toLowerCase(),
  );

  return status ?? null;
}

export function applicationsToCsv(
  applications: Application[],
): string {
  const rows = applications.map((application) => [
    application.jobTitle,
    application.companyName,
    application.jobUrl ?? "",
    application.status,
    application.matchScore ?? "",
    application.verdict ?? "",
    application.jobDescription ?? "",
    application.appliedAt ?? "",
    application.notes ?? "",
  ]);

  return [
    APPLICATION_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      row.map(escapeCsvValue).join(","),
    ),
  ].join("\r\n");
}

export function parseApplicationsCsv(
  csv: string,
): ApplicationCsvParseResult {
  const matrix = parseCsvMatrix(csv);

  if (matrix.length === 0) {
    throw new Error("The CSV file is empty.");
  }

  const headers = matrix[0].map(normaliseHeader);

  if (findColumn(headers, "job_title") < 0) {
    throw new Error(
      'The CSV needs a "job_title" column.',
    );
  }

  if (findColumn(headers, "company_name") < 0) {
    throw new Error(
      'The CSV needs a "company_name" column.',
    );
  }

  const rows: ApplicationCsvImportRow[] = [];
  const errors: ApplicationCsvRowError[] = [];

  matrix.slice(1).forEach((record, index) => {
    const rowNumber = index + 2;

    const jobTitle = readCell(
      record,
      headers,
      "job_title",
    );

    const companyName = readCell(
      record,
      headers,
      "company_name",
    );

    if (!jobTitle) {
      errors.push({
        rowNumber,
        message: "Job title is required.",
      });

      return;
    }

    if (!companyName) {
      errors.push({
        rowNumber,
        message: "Company name is required.",
      });

      return;
    }

    const statusValue = readCell(
      record,
      headers,
      "status",
    );

    const status = parseStatus(statusValue);

    if (!status) {
      errors.push({
        rowNumber,
        message: `Unknown status "${statusValue}".`,
      });

      return;
    }

    const scoreValue = readCell(
      record,
      headers,
      "match_score",
    );

    let matchScore: number | undefined;

    if (scoreValue) {
      const parsedScore = Number(scoreValue);

      if (
        !Number.isFinite(parsedScore) ||
        parsedScore < 0 ||
        parsedScore > 100
      ) {
        errors.push({
          rowNumber,
          message:
            "Match score must be between 0 and 100.",
        });

        return;
      }

      matchScore = parsedScore;
    }

    const appliedAt = readCell(
      record,
      headers,
      "applied_at",
    );

    if (
      appliedAt &&
      Number.isNaN(new Date(appliedAt).getTime())
    ) {
      errors.push({
        rowNumber,
        message: `Invalid applied date "${appliedAt}".`,
      });

      return;
    }

    rows.push({
      rowNumber,
      input: {
        jobTitle,
        companyName,
        jobUrl:
          readCell(record, headers, "job_url") ||
          undefined,
        status,
        matchScore,
        verdict:
          readCell(record, headers, "verdict") ||
          undefined,
        jobDescription:
          readCell(
            record,
            headers,
            "job_description",
          ) || undefined,
        appliedAt: appliedAt || undefined,
        notes:
          readCell(record, headers, "notes") ||
          undefined,
      },
    });
  });

  return {
    rows,
    errors,
    totalRows: matrix.length - 1,
  };
}

function normaliseFingerprintPart(
  value: string | undefined,
): string {
  return value?.trim().toLowerCase() ?? "";
}

export function applicationImportFingerprint(
  input: Pick<
    ApplicationInput,
    "jobTitle" | "companyName" | "jobUrl" | "appliedAt"
  >,
): string {
  const appliedDate =
    input.appliedAt?.slice(0, 10) ?? "";

  return [
    normaliseFingerprintPart(input.jobTitle),
    normaliseFingerprintPart(input.companyName),
    normaliseFingerprintPart(input.jobUrl),
    appliedDate,
  ].join("|");
}
