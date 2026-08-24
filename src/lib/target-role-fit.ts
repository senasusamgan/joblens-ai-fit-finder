export type TargetRoleFitLevel =
  | "strong"
  | "adjacent"
  | "outside"
  | "not_set";

export interface TargetRoleFit {
  level: TargetRoleFitLevel;
  score: number | null;
  matchedTargetRole?: string;
}

const GENERIC_ROLE_TOKENS = new Set([
  "intern",
  "internship",
  "staj",
  "stajyer",
  "stajyeri",
  "trainee",
  "graduate",
  "junior",
  "jr",
  "senior",
  "sr",
  "full",
  "part",
  "time",
  "long",
  "term",
  "position",
  "role",
]);

function normaliseText(
  value: string,
): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function significantTokens(
  value: string,
): string[] {
  const all = normaliseText(value)
    .split(" ")
    .filter(Boolean);

  const filtered = all.filter(
    (token) =>
      !GENERIC_ROLE_TOKENS.has(token),
  );

  // If the whole role is generic
  // ("Intern", for example), keep the
  // original tokens rather than returning
  // an empty comparison.
  return filtered.length > 0
    ? filtered
    : all;
}

function roleSimilarity(
  jobTitle: string,
  targetRole: string,
): number {
  const jobNormalised =
    normaliseText(jobTitle);

  const targetNormalised =
    normaliseText(targetRole);

  if (
    !jobNormalised ||
    !targetNormalised
  ) {
    return 0;
  }

  if (
    jobNormalised ===
    targetNormalised
  ) {
    return 100;
  }

  const jobTokens =
    significantTokens(jobTitle);

  const targetTokens =
    significantTokens(targetRole);

  const jobKey =
    jobTokens.join(" ");

  const targetKey =
    targetTokens.join(" ");

  // Treat differences such as
  // "Product Intern" vs
  // "Product Internship" as equivalent.
  if (
    jobKey &&
    jobKey === targetKey
  ) {
    return 100;
  }

  const jobSet =
    new Set(jobTokens);

  const targetSet =
    new Set(targetTokens);

  const intersection = [
    ...jobSet,
  ].filter((token) =>
    targetSet.has(token),
  ).length;

  if (intersection === 0) {
    return 0;
  }

  const smallestSet =
    Math.min(
      jobSet.size,
      targetSet.size,
    );

  const union =
    new Set([
      ...jobSet,
      ...targetSet,
    ]).size;

  const overlapCoefficient =
    intersection /
    Math.max(1, smallestSet);

  const jaccard =
    intersection /
    Math.max(1, union);

  return Math.round(
    overlapCoefficient * 65 +
      jaccard * 35,
  );
}

export function buildTargetRoleFit(
  jobTitle: string,
  targetRoles: string[],
): TargetRoleFit {
  const cleanTargets =
    targetRoles
      .map((role) => role.trim())
      .filter(Boolean);

  if (cleanTargets.length === 0) {
    return {
      level: "not_set",
      score: null,
    };
  }

  let bestRole =
    cleanTargets[0];

  let bestScore = 0;

  for (
    const targetRole
    of cleanTargets
  ) {
    const score =
      roleSimilarity(
        jobTitle,
        targetRole,
      );

    if (score > bestScore) {
      bestScore = score;
      bestRole = targetRole;
    }
  }

  const level:
    TargetRoleFitLevel =
      bestScore >= 75
        ? "strong"
        : bestScore >= 40
          ? "adjacent"
          : "outside";

  return {
    level,
    score: bestScore,
    matchedTargetRole:
      bestRole,
  };
}
