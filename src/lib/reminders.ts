export const REMINDERS_KEY = "joblens_reminders_v1";

export interface Reminder {
  id: string;
  applicationId: string;
  title: string;
  dueAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReminderInput = Omit<
  Reminder,
  "id" | "createdAt" | "updatedAt"
>;

const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined";

function makeId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      "randomUUID" in crypto
    ) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }

  return `rem_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function sanitise(raw: unknown): Reminder | null {
  if (!raw || typeof raw !== "object") return null;

  const r = raw as Record<string, unknown>;

  const applicationId =
    typeof r.applicationId === "string" ? r.applicationId : "";

  const title = typeof r.title === "string" ? r.title : "";
  const dueAt = typeof r.dueAt === "string" ? r.dueAt : "";

  if (!applicationId || !title || !dueAt) return null;

  const now = new Date().toISOString();

  return {
    id:
      typeof r.id === "string" && r.id
        ? r.id
        : makeId(),
    applicationId,
    title,
    dueAt,
    completedAt:
      typeof r.completedAt === "string"
        ? r.completedAt
        : undefined,
    createdAt:
      typeof r.createdAt === "string"
        ? r.createdAt
        : now,
    updatedAt:
      typeof r.updatedAt === "string"
        ? r.updatedAt
        : now,
  };
}

export function loadReminders(): Reminder[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(REMINDERS_KEY);

    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(sanitise)
      .filter((r): r is Reminder => r !== null);
  } catch {
    return [];
  }
}

export function saveReminders(list: Reminder[]): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(
      REMINDERS_KEY,
      JSON.stringify(list),
    );
  } catch {
    /* private mode / quota */
  }
}

export function createReminder(
  input: ReminderInput,
): Reminder {
  const now = new Date().toISOString();

  const reminder: Reminder = {
    ...input,
    id: makeId(),
    createdAt: now,
    updatedAt: now,
  };

  const current = loadReminders();

  saveReminders([reminder, ...current]);

  return reminder;
}

export function updateReminder(
  id: string,
  patch: Partial<Omit<Reminder, "id" | "createdAt">>,
): Reminder[] {
  const next = loadReminders().map((reminder) =>
    reminder.id === id
      ? {
          ...reminder,
          ...patch,
          updatedAt: new Date().toISOString(),
        }
      : reminder,
  );

  saveReminders(next);

  return next;
}

export function deleteReminder(id: string): Reminder[] {
  const next = loadReminders().filter(
    (reminder) => reminder.id !== id,
  );

  saveReminders(next);

  return next;
}

export function deleteRemindersForApplication(
  applicationId: string,
): Reminder[] {
  const next = loadReminders().filter(
    (reminder) => reminder.applicationId !== applicationId,
  );

  saveReminders(next);

  return next;
}

export function isReminderOverdue(
  reminder: Reminder,
  now = new Date(),
): boolean {
  if (reminder.completedAt) return false;

  return new Date(reminder.dueAt).getTime() < now.getTime();
}
