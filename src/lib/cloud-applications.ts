import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";
import {
  APPLICATION_STATUSES,
  createApplication,
  loadApplications,
  saveApplications,
  type Application,
  type ApplicationInput,
  type ApplicationStatus,
} from "@/lib/applications";
import {
  normaliseApplicationSource,
} from "@/lib/application-source";

type ApplicationRow = Tables<"applications">;
type ApplicationInsert = TablesInsert<"applications">;
type ApplicationUpdate = TablesUpdate<"applications">;

function normaliseStatus(status: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(status)
    ? (status as ApplicationStatus)
    : "Saved";
}

function rowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    jobTitle: row.job_title,
    companyName: row.company_name,
    jobUrl: row.job_url ?? undefined,
    applicationSource:
      normaliseApplicationSource(
        row.application_source,
      ),
    status: normaliseStatus(row.status),
    matchScore: row.match_score ?? undefined,
    verdict: row.verdict ?? undefined,
    jobDescription: row.job_description ?? undefined,
    appliedAt: row.applied_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToInsert(
  input: ApplicationInput,
  userId: string,
  sourceLocalId?: string,
): ApplicationInsert {
  return {
    user_id: userId,
    job_title: input.jobTitle,
    company_name: input.companyName,
    job_url: input.jobUrl ?? null,
    application_source:
      input.applicationSource ?? null,
    status: input.status ?? "Saved",
    match_score: input.matchScore ?? null,
    verdict: input.verdict ?? null,
    job_description: input.jobDescription ?? null,
    applied_at: input.appliedAt ?? null,
    notes: input.notes ?? null,
    source_local_id: sourceLocalId ?? null,
  };
}

function patchToUpdate(
  patch: Partial<Omit<Application, "id" | "createdAt">>,
): ApplicationUpdate {
  const result: ApplicationUpdate = {};

  if (patch.jobTitle !== undefined) result.job_title = patch.jobTitle;
  if (patch.companyName !== undefined) result.company_name = patch.companyName;
  if (patch.jobUrl !== undefined) result.job_url = patch.jobUrl ?? null;
  if (patch.applicationSource !== undefined)
    result.application_source =
      patch.applicationSource ?? null;
  if (patch.status !== undefined) result.status = patch.status;
  if (patch.matchScore !== undefined) result.match_score = patch.matchScore ?? null;
  if (patch.verdict !== undefined) result.verdict = patch.verdict ?? null;
  if (patch.jobDescription !== undefined)
    result.job_description = patch.jobDescription ?? null;
  if (patch.appliedAt !== undefined) result.applied_at = patch.appliedAt ?? null;
  if (patch.notes !== undefined) result.notes = patch.notes ?? null;

  return result;
}

export async function hasAuthenticatedUser(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return Boolean(session);
}

export async function loadCloudApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(rowToApplication);
}

export async function migrateGuestApplicationsToCloud(): Promise<Application[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return loadApplications();

  const guestApplications = loadApplications();

  if (guestApplications.length > 0) {
    const rows: ApplicationInsert[] = guestApplications.map((app) =>
      inputToInsert(
        {
          jobTitle: app.jobTitle,
          companyName: app.companyName,
          jobUrl: app.jobUrl,
          applicationSource:
            app.applicationSource,
          status: app.status,
          matchScore: app.matchScore,
          verdict: app.verdict,
          jobDescription: app.jobDescription,
          appliedAt: app.appliedAt,
          notes: app.notes,
        },
        session.user.id,
        app.id,
      ),
    );

    const { error } = await supabase.from("applications").upsert(rows, {
      onConflict: "user_id,source_local_id",
    });

    if (error) throw error;
  }

  const cloudApplications = await loadCloudApplications();

  // Only clear guest storage after migration + cloud reload both succeed.
  if (guestApplications.length > 0) {
    saveApplications([]);
  }

  return cloudApplications;
}

export async function createCloudApplication(
  input: ApplicationInput,
): Promise<Application> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Authentication required");
  }

  const { data, error } = await supabase
    .from("applications")
    .insert(inputToInsert(input, session.user.id))
    .select("*")
    .single();

  if (error) throw error;

  return rowToApplication(data);
}

export async function updateCloudApplication(
  id: string,
  patch: Partial<Omit<Application, "id" | "createdAt">>,
): Promise<Application> {
  const { data, error } = await supabase
    .from("applications")
    .update(patchToUpdate(patch))
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return rowToApplication(data);
}

export async function deleteCloudApplication(id: string): Promise<void> {
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function saveApplicationForCurrentUser(
  input: ApplicationInput,
): Promise<Application> {
  const authenticated = await hasAuthenticatedUser();

  if (!authenticated) {
    return createApplication(input);
  }

  return createCloudApplication(input);
}
