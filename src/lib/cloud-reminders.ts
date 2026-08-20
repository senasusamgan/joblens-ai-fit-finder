import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";
import {
  createReminder,
  loadReminders,
  saveReminders,
  type Reminder,
  type ReminderInput,
} from "@/lib/reminders";

type ReminderRow = Tables<"application_reminders">;
type ReminderInsert = TablesInsert<"application_reminders">;
type ReminderUpdate = TablesUpdate<"application_reminders">;

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    applicationId: row.application_id,
    title: row.title,
    dueAt: row.due_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToInsert(
  input: ReminderInput,
  userId: string,
  sourceLocalId?: string,
): ReminderInsert {
  return {
    user_id: userId,
    application_id: input.applicationId,
    title: input.title,
    due_at: input.dueAt,
    completed_at: input.completedAt ?? null,
    source_local_id: sourceLocalId ?? null,
  };
}

function patchToUpdate(
  patch: Partial<Omit<Reminder, "id" | "createdAt">>,
): ReminderUpdate {
  const result: ReminderUpdate = {};

  if (patch.applicationId !== undefined) {
    result.application_id = patch.applicationId;
  }

  if (patch.title !== undefined) {
    result.title = patch.title;
  }

  if (patch.dueAt !== undefined) {
    result.due_at = patch.dueAt;
  }

  if (patch.completedAt !== undefined) {
    result.completed_at = patch.completedAt ?? null;
  }

  return result;
}

export async function loadCloudReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from("application_reminders")
    .select("*")
    .order("due_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map(rowToReminder);
}

export async function migrateGuestRemindersToCloud(): Promise<
  Reminder[]
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return loadReminders();
  }

  const guestReminders = loadReminders();

  if (guestReminders.length === 0) {
    return loadCloudReminders();
  }

  const localApplicationIds = [
    ...new Set(
      guestReminders.map(
        (reminder) => reminder.applicationId,
      ),
    ),
  ];

  const { data: cloudApplications, error: appError } =
    await supabase
      .from("applications")
      .select("id,source_local_id")
      .in("source_local_id", localApplicationIds);

  if (appError) throw appError;

  const applicationMap = new Map<string, string>();

  for (const app of cloudApplications ?? []) {
    if (app.source_local_id) {
      applicationMap.set(app.source_local_id, app.id);
    }
  }

  const rows: ReminderInsert[] = [];
  const migratedLocalReminderIds = new Set<string>();

  for (const reminder of guestReminders) {
    const cloudApplicationId = applicationMap.get(
      reminder.applicationId,
    );

    if (!cloudApplicationId) continue;

    rows.push(
      inputToInsert(
        {
          applicationId: cloudApplicationId,
          title: reminder.title,
          dueAt: reminder.dueAt,
          completedAt: reminder.completedAt,
        },
        session.user.id,
        reminder.id,
      ),
    );

    migratedLocalReminderIds.add(reminder.id);
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("application_reminders")
      .upsert(rows, {
        onConflict: "user_id,source_local_id",
      });

    if (error) throw error;
  }

  const cloudReminders = await loadCloudReminders();

  if (migratedLocalReminderIds.size > 0) {
    saveReminders(
      guestReminders.filter(
        (reminder) =>
          !migratedLocalReminderIds.has(reminder.id),
      ),
    );
  }

  return cloudReminders;
}

export async function createCloudReminder(
  input: ReminderInput,
): Promise<Reminder> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Authentication required");
  }

  const { data, error } = await supabase
    .from("application_reminders")
    .insert(inputToInsert(input, session.user.id))
    .select("*")
    .single();

  if (error) throw error;

  return rowToReminder(data);
}

export async function updateCloudReminder(
  id: string,
  patch: Partial<Omit<Reminder, "id" | "createdAt">>,
): Promise<Reminder> {
  const { data, error } = await supabase
    .from("application_reminders")
    .update(patchToUpdate(patch))
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return rowToReminder(data);
}

export async function deleteCloudReminder(
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("application_reminders")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function createReminderForCurrentUser(
  input: ReminderInput,
): Promise<Reminder> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return createReminder(input);
  }

  return createCloudReminder(input);
}
