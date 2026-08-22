export type DecisionBriefLanguage = "English" | "Turkish";

export type DecisionBriefInput = {
  verdict:
    | "Strong Fit"
    | "Worth Applying"
    | "Stretch Opportunity"
    | "Low Fit";
  matchScore: number;
  strongMatches: {
    requirement: string;
  }[];
  partialMatches: {
    requirement: string;
    remainingGap: string;
  }[];
  learnableGaps: {
    skill: string;
    importance: string;
  }[];
  possibleBlockers: {
    requirement: string;
    reason: string;
    severity: "Low" | "Medium" | "High";
  }[];
};

export type EvidenceStrength =
  | "Strong"
  | "Mixed"
  | "Limited";

export interface MatchDecisionBrief {
  evidenceStrength: EvidenceStrength;
  evidenceStrengthLabel: string;
  mainRisk: string;
  bestNextMove: string;
  recruiterPerspective: string;
}

function getEvidenceStrength(
  input: DecisionBriefInput,
): EvidenceStrength {
  const strong = input.strongMatches.length;
  const partial = input.partialMatches.length;
  const highBlockers = input.possibleBlockers.filter(
    (blocker) => blocker.severity === "High",
  ).length;

  if (
    strong >= 3 &&
    strong >= partial &&
    highBlockers === 0
  ) {
    return "Strong";
  }

  if (strong >= 1 || partial >= 2) {
    return "Mixed";
  }

  return "Limited";
}

function getMainRisk(
  input: DecisionBriefInput,
  language: DecisionBriefLanguage,
): string {
  const highBlocker = input.possibleBlockers.find(
    (blocker) => blocker.severity === "High",
  );

  if (highBlocker) {
    return highBlocker.reason;
  }

  const mediumBlocker = input.possibleBlockers.find(
    (blocker) => blocker.severity === "Medium",
  );

  if (mediumBlocker) {
    return mediumBlocker.reason;
  }

  const partial = input.partialMatches[0];

  if (partial) {
    return partial.remainingGap;
  }

  const gap = input.learnableGaps[0];

  if (gap) {
    return language === "Turkish"
      ? `${gap.skill} bu rol için geliştirilmesi gereken en belirgin alan.`
      : `${gap.skill} is the clearest area to strengthen for this role.`;
  }

  return language === "Turkish"
    ? "CV'de bu rol için belirgin bir kritik risk görünmüyor."
    : "No major critical risk is evident from the CV for this role.";
}

function getBestNextMove(
  input: DecisionBriefInput,
  language: DecisionBriefLanguage,
): string {
  const hasHighBlocker = input.possibleBlockers.some(
    (blocker) => blocker.severity === "High",
  );

  if (hasHighBlocker) {
    return language === "Turkish"
      ? "Başvurmadan önce yüksek önem seviyesindeki zorunlu gerekliliği doğrula."
      : "Verify the high-severity mandatory requirement before applying.";
  }

  switch (input.verdict) {
    case "Strong Fit":
      return language === "Turkish"
        ? "Başvuruya geç ve CV'de en güçlü eşleşmeleri daha görünür hale getir."
        : "Apply and make the strongest matching evidence more visible in your CV.";

    case "Worth Applying":
      return language === "Turkish"
        ? "Başvur; aynı zamanda kısmi eşleşmeleri CV'de daha güçlü kanıtlarla destekle."
        : "Apply, while strengthening the evidence behind your partial matches.";

    case "Stretch Opportunity":
      return language === "Turkish"
        ? "Başvuruyu stratejik değerlendir ve önce en önemli beceri açığını azalt."
        : "Treat this as a strategic application and address the most important skill gap first.";

    case "Low Fit":
      return language === "Turkish"
        ? "Başvurmadan önce eksiklerin rolün temel gereklilikleriyle ne kadar kritik olduğunu değerlendir."
        : "Before applying, assess whether the missing requirements are fundamental to the role.";
  }
}

function getRecruiterPerspective(
  input: DecisionBriefInput,
  language: DecisionBriefLanguage,
): string {
  const strong = input.strongMatches.length;
  const partial = input.partialMatches.length;
  const blockers = input.possibleBlockers.length;

  if (language === "Turkish") {
    if (strong >= 3 && blockers === 0) {
      return `CV, rolün gereklilikleriyle güçlü ve açık kanıtlar sunuyor. ${strong} güçlü eşleşme bulunurken kritik bir zorunlu engel tespit edilmedi.`;
    }

    if (strong > 0 || partial > 0) {
      return `Adayın rol için anlamlı bir temeli var: ${strong} güçlü ve ${partial} kısmi eşleşme bulunuyor. Karar özellikle kalan boşlukların ve olası engellerin önemine bağlı.`;
    }

    return "CV ile rol arasında sınırlı doğrudan kanıt bulunuyor. İşe alım tarafında daha güçlü ve role özgü kanıtlar görmek gerekebilir.";
  }

  if (strong >= 3 && blockers === 0) {
    return `The CV presents clear evidence for this role, with ${strong} strong matches and no identified mandatory blocker.`;
  }

  if (strong > 0 || partial > 0) {
    return `The candidate has a meaningful foundation for the role: ${strong} strong and ${partial} partial matches. The decision will depend on the importance of the remaining gaps and blockers.`;
  }

  return "The CV provides limited direct evidence for this role. A recruiter may need stronger, role-specific proof of fit.";
}

export function buildMatchDecisionBrief(
  input: DecisionBriefInput,
  language: DecisionBriefLanguage,
): MatchDecisionBrief {
  const evidenceStrength = getEvidenceStrength(input);

  const evidenceStrengthLabel =
    language === "Turkish"
      ? {
          Strong: "Güçlü",
          Mixed: "Karma",
          Limited: "Sınırlı",
        }[evidenceStrength]
      : evidenceStrength;

  return {
    evidenceStrength,
    evidenceStrengthLabel,
    mainRisk: getMainRisk(input, language),
    bestNextMove: getBestNextMove(input, language),
    recruiterPerspective: getRecruiterPerspective(
      input,
      language,
    ),
  };
}
