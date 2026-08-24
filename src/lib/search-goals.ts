export const SEARCH_GOALS_KEY =
  "joblens_search_goals_v1";

export const WORK_MODELS = [
  "On-site",
  "Hybrid",
  "Remote",
] as const;

export type WorkModel =
  (typeof WORK_MODELS)[number];

export interface SearchGoals {
  targetRoles: string[];
  locations: string[];
  workModels: WorkModel[];
  weeklyApplicationGoal: number;
  updatedAt: string;
}

export const DEFAULT_SEARCH_GOALS: SearchGoals = {
  targetRoles: [],
  locations: [],
  workModels: [],
  weeklyApplicationGoal: 5,
  updatedAt: "",
};

const isBrowser = () =>
  typeof window !== "undefined" &&
  typeof window.localStorage !== "undefined";

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter(
          (item): item is string =>
            typeof item === "string",
        )
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function cleanWorkModels(
  value: unknown,
): WorkModel[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is WorkModel =>
      typeof item === "string" &&
      (
        WORK_MODELS as readonly string[]
      ).includes(item),
  );
}

function cleanWeeklyGoal(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_SEARCH_GOALS.weeklyApplicationGoal;
  }

  return Math.min(
    50,
    Math.max(1, Math.round(value)),
  );
}

export function sanitiseSearchGoals(
  raw: unknown,
): SearchGoals {
  if (!raw || typeof raw !== "object") {
    return {
      ...DEFAULT_SEARCH_GOALS,
    };
  }

  const value = raw as Record<
    string,
    unknown
  >;

  return {
    targetRoles: cleanList(
      value.targetRoles,
    ),
    locations: cleanList(
      value.locations,
    ),
    workModels: cleanWorkModels(
      value.workModels,
    ),
    weeklyApplicationGoal:
      cleanWeeklyGoal(
        value.weeklyApplicationGoal,
      ),
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : "",
  };
}

export function loadSearchGoals(): SearchGoals {
  if (!isBrowser()) {
    return {
      ...DEFAULT_SEARCH_GOALS,
    };
  }

  try {
    const raw =
      window.localStorage.getItem(
        SEARCH_GOALS_KEY,
      );

    if (!raw) {
      return {
        ...DEFAULT_SEARCH_GOALS,
      };
    }

    return sanitiseSearchGoals(
      JSON.parse(raw),
    );
  } catch {
    return {
      ...DEFAULT_SEARCH_GOALS,
    };
  }
}

export function saveSearchGoals(
  goals: Omit<SearchGoals, "updatedAt">,
): SearchGoals {
  const saved: SearchGoals = {
    ...sanitiseSearchGoals(goals),
    updatedAt: new Date().toISOString(),
  };

  if (isBrowser()) {
    try {
      window.localStorage.setItem(
        SEARCH_GOALS_KEY,
        JSON.stringify(saved),
      );
    } catch {
      // Private mode / quota:
      // keep the in-memory result usable.
    }
  }

  return saved;
}

export function hasSearchGoals(
  goals: SearchGoals,
): boolean {
  return (
    goals.targetRoles.length > 0 ||
    goals.locations.length > 0 ||
    goals.workModels.length > 0 ||
    goals.weeklyApplicationGoal !==
      DEFAULT_SEARCH_GOALS.weeklyApplicationGoal
  );
}

export function clearSearchGoals(): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(
      SEARCH_GOALS_KEY,
    );
  } catch {
    // Private mode / storage restrictions.
  }
}
