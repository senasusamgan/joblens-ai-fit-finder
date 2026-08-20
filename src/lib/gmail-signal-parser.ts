export interface CompanySignalInput {
  subject: string;
  snippet: string;
  from: string;
}

function cleanCompanySuggestion(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .replace(/[,:;!?]+$/g, "")
    .trim();
}

export function extractCompanyFromSignal(
  signal: CompanySignalInput,
): string | null {
  const text = `${signal.subject}\n${signal.snippet}`;

  const patterns = [
    /başvurunuz\s+(?!alındı(?:\s|$))(.+?)\s+şirketine\s+(?:gönderildi|iletildi|görüntülendi)/i,
    /başvurun\s+(?!alındı(?:\s|$))(.+?)\s+şirketine\s+(?:gönderildi|iletildi|görüntülendi)/i,
    /(?:your\s+)?application(?:\s+was)?\s+(?:sent to|viewed by)\s+(.+?)(?:[.!]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const company = cleanCompanySuggestion(match[1]);
      if (company) return company;
    }
  }

  return null;
}

export function suggestCompanyFromSignal(
  signal: CompanySignalInput,
): string {
  const extractedCompany = extractCompanyFromSignal(signal);

  if (extractedCompany) {
    return extractedCompany;
  }

  const displayName = signal.from
    .split("<")[0]
    .replace(/^["']|["']$/g, "")
    .trim();

  if (displayName && !displayName.includes("@")) {
    return displayName
      .replace(/^["']+|["']+$/g, "")
      .replace(/\.(com|io)$/i, "")
      .trim();
  }

  const emailMatch = signal.from.match(/@([^>\s]+)/);

  if (!emailMatch) return "";

  const domain = emailMatch[1]
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .trim();

  return domain
    ? domain.charAt(0).toUpperCase() + domain.slice(1)
    : "";
}


export type GmailSignalKind =
  | "Applied"
  | "Interview"
  | "Case"
  | "Offer"
  | "Rejected";

export interface GmailSignalClassification {
  kind: GmailSignalKind;
  confidence: "high" | "medium";
}

export interface GmailClassificationInput {
  subject: string;
  from: string;
  snippet: string;
}

function includesAny(
  value: string,
  terms: string[],
): boolean {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function senderKey(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] ?? from).toLowerCase().trim();
}

export function classifyGmailSignal(
  input: GmailClassificationInput,
): GmailSignalClassification | null {
  const subjectText = input.subject.toLowerCase();
  const text =
    `${input.subject} ${input.snippet}`.toLowerCase();

  const sender = senderKey(input.from);

  const isLinkedInSender =
    sender.endsWith("@linkedin.com");

  const isYouthallSender =
    sender.endsWith("@youthall.com");

  const youthallAppliedSignal =
    isYouthallSender &&
    (
      (
        subjectText.includes("başvurun") &&
        subjectText.includes("alındı")
      ) ||
      (
        text.includes("başvurun") &&
        text.includes("iletildi")
      )
    );

  const linkedInAppliedSignal =
    isLinkedInSender &&
    subjectText.includes("application") &&
    (
      subjectText.includes("sent") ||
      subjectText.includes("viewed")
    );

  const linkedInTurkishAppliedSignal =
    isLinkedInSender &&
    subjectText.includes("başvurunuz") &&
    (
      subjectText.includes("gönderildi") ||
      subjectText.includes("görüntülendi")
    );

  const rejectedTerms = [
    "unfortunately",
    "not moving forward",
    "not proceed",
    "other candidates",
    "başvurunuz olumsuz",
    "olumsuz sonuç",
    "başvurunuza devam edemiyoruz",
    "başvurunuzla ilerleyemiyoruz",
  ];

  const offerTerms = [
    "job offer",
    "offer letter",
    "employment offer",
    "teklifimizi",
    "iş teklifi",
    "offer for",
  ];

  const interviewTerms = [
    "interview",
    "interview invitation",
    "schedule a call",
    "schedule your interview",
    "mülakat",
    "görüşme daveti",
    "görüşme planlamak",
  ];

  const caseTerms = [
    "case study",
    "case assignment",
    "take-home assignment",
    "assessment",
    "online assessment",
    "technical task",
    "case çalışması",
    "vaka çalışması",
    "değerlendirme sınavı",
    "değerlendirme testi",
  ];

  const appliedTerms = [
    "application received",
    "application submitted",
    "thank you for applying",
    "we received your application",
    "your application was sent",
    "application was sent to",
    "your application was viewed",
    "application was viewed by",
    "başvurunuz alınmıştır",
    "başvurunuzu aldık",
    "başvurunuz başarıyla",
    "başvurunuz gönderildi",
    "başvurunuz görüntülendi",
  ];

  let kind: GmailSignalKind | null = null;
  let confidence: "high" | "medium" = "medium";

  if (includesAny(subjectText, offerTerms)) {
    kind = "Offer";
    confidence = "high";
  } else if (includesAny(subjectText, rejectedTerms)) {
    kind = "Rejected";
    confidence = "high";
  } else if (includesAny(subjectText, caseTerms)) {
    kind = "Case";
    confidence = "high";
  } else if (includesAny(subjectText, interviewTerms)) {
    kind = "Interview";
    confidence = "high";
  } else if (
    youthallAppliedSignal ||
    linkedInAppliedSignal ||
    linkedInTurkishAppliedSignal ||
    includesAny(subjectText, appliedTerms)
  ) {
    kind = "Applied";
    confidence = "high";
  }

  if (!kind) {
    if (includesAny(text, offerTerms)) {
      kind = "Offer";
      confidence = "high";
    } else if (includesAny(text, rejectedTerms)) {
      kind = "Rejected";
      confidence = "high";
    } else if (includesAny(text, caseTerms)) {
      kind = "Case";
      confidence = "high";
    } else if (includesAny(text, interviewTerms)) {
      kind = "Interview";
      confidence = "high";
    } else if (includesAny(text, appliedTerms)) {
      kind = "Applied";
    }
  }

  if (!kind) return null;

  return {
    kind,
    confidence,
  };
}
