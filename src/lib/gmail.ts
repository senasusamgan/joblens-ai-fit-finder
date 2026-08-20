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

function detectSignal(
  message: GmailMessage,
): GmailSignal | null {
  const subject = header(message, "Subject");
  const from = header(message, "From");
  const date = header(message, "Date");
  const snippet = message.snippet ?? "";

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
    "technical task",
    "case çalışması",
    "vaka çalışması",
    "değerlendirme testi",
  ];

  const appliedTerms = [
    "application received",
    "application submitted",
    "thank you for applying",
    "we received your application",
    "başvurunuz alınmıştır",
    "başvurunuzu aldık",
    "başvurunuz başarıyla",
  ];

  let kind: GmailSignalKind | null = null;
  let confidence: "high" | "medium" = "medium";

  if (includesAny(text, offerTerms)) {
    kind = "Offer";
    confidence = "high";
  } else if (includesAny(text, rejectedTerms)) {
    kind = "Rejected";
    confidence = "high";
  } else if (includesAny(text, interviewTerms)) {
    kind = "Interview";
    confidence = "high";
  } else if (includesAny(text, caseTerms)) {
    kind = "Case";
    confidence = "high";
  } else if (includesAny(text, appliedTerms)) {
    kind = "Applied";
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

  const query = [
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

  const list = await gmailFetch<GmailMessageList>(
    `messages?maxResults=30&q=${encodeURIComponent(query)}`,
    token,
  );

  const messages = list.messages ?? [];

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

  return results
    .map(detectSignal)
    .filter((signal): signal is GmailSignal => signal !== null);
}
