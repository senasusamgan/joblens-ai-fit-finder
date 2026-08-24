import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
} from "@/integrations/supabase/types";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/applications";

export const APPLICATION_EVENT_SOURCES = [
  "manual",
  "gmail",
  "analysis",
] as const;

export type ApplicationEventSource =
  (typeof APPLICATION_EVENT_SOURCES)[number];

export type ApplicationEventType =
  | "created"
  | "status_change";

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  eventType: ApplicationEventType;
  source: ApplicationEventSource;
  fromStatus?: ApplicationStatus;
  toStatus?: ApplicationStatus;
  occurredAt: string;
  createdAt: string;
}

type ApplicationEventRow =
  Tables<"application_events">;

type ApplicationEventInsert =
  TablesInsert<"application_events">;

function normaliseStatus(
  value: string | null,
): ApplicationStatus | undefined {
  if (!value) return undefined;

  return (
    APPLICATION_STATUSES as readonly string[]
  ).includes(value)
    ? (value as ApplicationStatus)
    : undefined;
}

function normaliseSource(
  value: string,
): ApplicationEventSource {
  return (
    APPLICATION_EVENT_SOURCES as readonly string[]
  ).includes(value)
    ? (value as ApplicationEventSource)
    : "manual";
}

function rowToApplicationEvent(
  row: ApplicationEventRow,
): ApplicationEvent {
  return {
    id: row.id,
    applicationId: row.application_id,
    eventType:
      row.event_type === "status_change"
        ? "status_change"
        : "created",
    source: normaliseSource(row.source),
    fromStatus: normaliseStatus(row.from_status),
    toStatus: normaliseStatus(row.to_status),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export async function loadAllApplicationEvents(): Promise<ApplicationEvent[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return [];

  const { data, error } = await supabase
    .from("application_events")
    .select("*")
    .eq("user_id", session.user.id)
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(rowToApplicationEvent);
}

export async function loadApplicationEvents(
  applicationId: string,
): Promise<ApplicationEvent[]> {
  const { data, error } = await supabase
    .from("application_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(rowToApplicationEvent);
}

export async function recordApplicationEvent(input: {
  applicationId: string;
  eventType: ApplicationEventType;
  source: ApplicationEventSource;
  fromStatus?: ApplicationStatus;
  toStatus?: ApplicationStatus;
  occurredAt?: string;
}): Promise<ApplicationEvent> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Authentication required");
  }

  const row: ApplicationEventInsert = {
    user_id: session.user.id,
    application_id: input.applicationId,
    event_type: input.eventType,
    source: input.source,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    occurred_at:
      input.occurredAt ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("application_events")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;

  return rowToApplicationEvent(data);
}
