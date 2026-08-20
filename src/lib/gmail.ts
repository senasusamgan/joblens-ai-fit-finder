import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ApplicationStatus } from "@/lib/applications";

const GMAIL_TOKEN_KEY = "joblens_gmail_access_token_v1";

export type GmailSignalKind =
  | "Applied"
  | "Interview"
  | "Case"
  | "Offer"
  | "Rejected";

export interface GmailSignal {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  kind: GmailSignalKind;
  suggestedStatus: ApplicationStatus;
  confidence: "high" | "medium";
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

export function rememberGoogleProviderToken(
  session: Session | null,
): void {
  if (!isBrowser()) return;

  if (session?.provider_token) {
    window.sessionStorage.setItem(
      GMAIL_TOKEN_KEY,
      session.provider_token,
    );
  }
}

export function clearGoogleProviderToken(): void {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(GMAIL_TOKEN_KEY);
}

export function getGoogleProviderToken(): string | null {
  if (!isBrowser()) return null;
  return window.sessionStorage.getItem(GMAIL_TOKEN_KEY);
}

export function hasGmailToken(): boolean {
  return Boolean(getGoogleProviderToken());
}

export async function connectGmail(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "https://www.googleapis.com/auth/gmail.readonly",
      queryParams: {
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  });

  if (error) throw error;
}

type GmailMessageList = {
  messages?: Array<{
    id: string;
    threadId: string;
  }>;
};

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: Array<{
      name: string;
      value: string;
    }>;
  };
};

function header(
  message: GmailMessage,
  name: string,
): string {
  return (
    message.payload?.headers?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function includesAny(
  value: string,
  terms: string[],
): boolean {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function normaliseSignalSubject(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bson\s+\d+\s+gün\b/gi, " ")
    .replace(/\bson\s+gün\b.*$/gi, " ")
    .replace(/\d{1,2}[:.]\d{2}/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function senderKey(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] ?? from).toLowerCase().trim();
}

function detectSignal(
  message: GmailMessage,
): GmailSignal | null {
  const subject = header(message, "Subject");
  const from = header(message, "From");
  const date = header(message, "Date");
  const snippet = message.snippet ?? "";

  const subjectText = subject.toLowerCase();
  const text = `${subject} ${snippet}`.toLowerCase();

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

  // Subject is the strongest signal.
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
  } else if (includesAny(subjectText, appliedTerms)) {
    kind = "Applied";
    confidence = "high";
  }

  // Fall back to subject + snippet when the subject itself is unclear.
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
    messageId: message.id,
    threadId: message.threadId,
    subject,
    from,
    date,
    snippet,
    kind,
    suggestedStatus: kind,
    confidence,
  };
}

function dedupeSignals(signals: GmailSignal[]): GmailSignal[] {
  const seen = new Set<string>();

  return signals.filter((signal) => {
    const key = [
      senderKey(signal.from),
      signal.kind,
      normaliseSignalSubject(signal.subject),
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function gmailFetch<T>(
  path: string,
  token: string,
): Promise<T> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new Error("GMAIL_AUTH_REQUIRED");
  }

  if (!response.ok) {
    throw new Error(`GMAIL_API_${response.status}`);
  }

  return (await response.json()) as T;
}

export async function scanGmailForJobSignals(): Promise<
  GmailSignal[]
> {
  const token = getGoogleProviderToken();

  if (!token) {
    throw new Error("GMAIL_AUTH_REQUIRED");
  }

  const generalQuery = [
    "newer_than:90d",
    "(",
    "application",
    "OR interview",
    "OR offer",
    "OR assessment",
    "OR rejected",
    "OR rejection",
    "OR başvuru",
    "OR mülakat",
    "OR görüşme",
    "OR teklif",
    ")",
  ].join(" ");

  const linkedInQuery = [
    "newer_than:90d",
    "from:linkedin.com",
  ].join(" ");

  const [generalList, linkedInList] = await Promise.all([
    gmailFetch<GmailMessageList>(
      `messages?maxResults=30&q=${encodeURIComponent(generalQuery)}`,
      token,
    ),
    gmailFetch<GmailMessageList>(
      `messages?maxResults=30&q=${encodeURIComponent(linkedInQuery)}`,
      token,
    ),
  ]);

  const messageMap = new Map<
    string,
    { id: string; threadId: string }
  >();

  for (const message of [
    ...(generalList.messages ?? []),
    ...(linkedInList.messages ?? []),
  ]) {
    messageMap.set(message.id, message);
  }

  const messages = [...messageMap.values()];

  const results = await Promise.all(
    messages.map(async ({ id }) => {
      const params = new URLSearchParams({
        format: "metadata",
      });

      params.append("metadataHeaders", "Subject");
      params.append("metadataHeaders", "From");
      params.append("metadataHeaders", "Date");

      return gmailFetch<GmailMessage>(
        `messages/${id}?${params.toString()}`,
        token,
      );
    }),
  );

  const signals = results
    .map(detectSignal)
    .filter((signal): signal is GmailSignal => signal !== null);

  return dedupeSignals(signals);
}
