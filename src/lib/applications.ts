/**
 * JobLens application tracker — local-only persistence (MVP).
 * Never store CV text in this model.
 */

export const APPLICATIONS_KEY = "joblens_applications_v1";

export const APPLICATION_STATUSES = [
  "Saved",
  "Applied",
  "Interview",
  "Case",
  "Offer",
  "Rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  jobTitle: string;
  companyName: string;
  jobUrl?: string;
  status: ApplicationStatus;
  matchScore?: number;
  verdict?: string;
  jobDescription?: string;
  appliedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationInput = Omit<Application, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<Application, "status">>;

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === "string" && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

function sanitise(raw: unknown): Application | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const jobTitle = typeof r.jobTitle === "string" ? r.jobTitle : "";
  const companyName = typeof r.companyName === "string" ? r.companyName : "";
  if (!jobTitle && !companyName) return null;
  const now = new Date().toISOString();
  return {
    id: typeof r.id === "string" && r.id ? r.id : makeId(),
    jobTitle,
    companyName,
    jobUrl: typeof r.jobUrl === "string" ? r.jobUrl : undefined,
    status: isStatus(r.status) ? r.status : "Saved",
    matchScore: typeof r.matchScore === "number" && Number.isFinite(r.matchScore) ? r.matchScore : undefined,
    verdict: typeof r.verdict === "string" ? r.verdict : undefined,
    jobDescription: typeof r.jobDescription === "string" ? r.jobDescription : undefined,
    appliedAt: typeof r.appliedAt === "string" ? r.appliedAt : undefined,
    notes: typeof r.notes === "string" ? r.notes : undefined,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : now,
  };
}

export function loadApplications(): Application[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(APPLICATIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitise).filter((a): a is Application => a !== null);
  } catch {
    return [];
  }
}

export function saveApplications(list: Application[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function createApplication(input: ApplicationInput): Application {
  const now = new Date().toISOString();
  const app: Application = {
    ...input,
    id: makeId(),
    status: input.status ?? "Saved",
    createdAt: now,
    updatedAt: now,
  };
  const list = loadApplications();
  saveApplications([app, ...list]);
  return app;
}

export function updateApplication(
  id: string,
  patch: Partial<Omit<Application, "id" | "createdAt">>,
): Application[] {
  const list = loadApplications().map((a) =>
    a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
  );
  saveApplications(list);
  return list;
}

export function deleteApplication(id: string): Application[] {
  const list = loadApplications().filter((a) => a.id !== id);
  saveApplications(list);
  return list;
}

export const ACTIVE_STATUSES: ApplicationStatus[] = ["Saved", "Applied", "Interview", "Case"];

export function summarise(list: Application[]) {
  return {
    total: list.length,
    active: list.filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
    interviews: list.filter((a) => a.status === "Interview" || a.status === "Case").length,
    offers: list.filter((a) => a.status === "Offer").length,
  };
}

export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
