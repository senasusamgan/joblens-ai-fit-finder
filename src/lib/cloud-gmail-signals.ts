import { supabase } from "@/integrations/supabase/client";
import type {
  TablesInsert,
} from "@/integrations/supabase/types";

export type GmailHandledAction =
  | "linked"
  | "created"
  | "dismissed";

type GmailSignalActionInsert =
  TablesInsert<"gmail_signal_actions">;

export async function loadHandledGmailMessageIds(): Promise<
  Set<string>
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return new Set();

  const { data, error } = await supabase
    .from("gmail_signal_actions")
    .select("message_id");

  if (error) throw error;

  return new Set(
    (data ?? []).map((row) => row.message_id),
  );
}

export async function markGmailSignalHandled({
  messageId,
  action,
  applicationId,
}: {
  messageId: string;
  action: GmailHandledAction;
  applicationId?: string;
}): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Authentication required");
  }

  const row: GmailSignalActionInsert = {
    user_id: session.user.id,
    message_id: messageId,
    action,
    application_id: applicationId ?? null,
    handled_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("gmail_signal_actions")
    .insert(row);

  // Already handled = desired final state.
  if (error?.code === "23505") {
    return;
  }

  if (error) {
    console.error(
      "[JobLens Gmail] Handled signal persistence failed:",
      error,
    );

    throw new Error(
      `GMAIL_HANDLED_SYNC_FAILED:${error.code ?? "unknown"}`,
    );
  }
}
