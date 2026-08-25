import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
} from "@/integrations/supabase/types";
import {
  clearSearchGoals,
  hasSearchGoals,
  loadSearchGoals,
  saveSearchGoals,
  sanitiseSearchGoals,
  type SearchGoals,
} from "@/lib/search-goals";

type SearchGoalRow = Tables<"search_goals">;
type SearchGoalInsert =
  TablesInsert<"search_goals">;

type SearchGoalsInput =
  Omit<SearchGoals, "updatedAt">;

function rowToSearchGoals(
  row: SearchGoalRow,
): SearchGoals {
  return sanitiseSearchGoals({
    targetRoles: row.target_roles,
    targetIndustries:
      row.target_industries,
    locations: row.locations,
    workModels: row.work_models,
    weeklyApplicationGoal:
      row.weekly_application_goal,
    updatedAt: row.updated_at,
  });
}

function goalsToInsert(
  goals: SearchGoals | SearchGoalsInput,
  userId: string,
): SearchGoalInsert {
  const clean = sanitiseSearchGoals(goals);

  return {
    user_id: userId,
    target_roles: clean.targetRoles,
    target_industries:
      clean.targetIndustries,
    locations: clean.locations,
    work_models: clean.workModels,
    weekly_application_goal:
      clean.weeklyApplicationGoal,
  };
}

export async function loadCloudSearchGoals():
  Promise<SearchGoals | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data, error } = await supabase
    .from("search_goals")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) throw error;

  return data
    ? rowToSearchGoals(data)
    : null;
}

export async function saveCloudSearchGoals(
  goals: SearchGoals | SearchGoalsInput,
): Promise<SearchGoals> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error(
      "Authentication required",
    );
  }

  const { data, error } = await supabase
    .from("search_goals")
    .upsert(
      goalsToInsert(
        goals,
        session.user.id,
      ),
      {
        onConflict: "user_id",
      },
    )
    .select("*")
    .single();

  if (error) throw error;

  return rowToSearchGoals(data);
}

export async function migrateGuestSearchGoalsToCloud():
  Promise<SearchGoals> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return loadSearchGoals();
  }

  const existingCloud =
    await loadCloudSearchGoals();

  const localGoals = loadSearchGoals();

  // Cloud wins only when the account
  // already has a meaningful strategy.
  // An empty/default cloud row should not
  // overwrite useful browser goals.
  if (
    existingCloud &&
    hasSearchGoals(existingCloud)
  ) {
    return existingCloud;
  }

  if (!hasSearchGoals(localGoals)) {
    return (
      existingCloud ??
      localGoals
    );
  }

  const saved =
    await saveCloudSearchGoals(
      localGoals,
    );

  // Only clear browser goals after the
  // cloud write succeeds.
  clearSearchGoals();

  return saved;
}

export async function loadSearchGoalsForCurrentUser():
  Promise<SearchGoals> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return loadSearchGoals();
  }

  return (
    (await loadCloudSearchGoals()) ??
    loadSearchGoals()
  );
}

export async function saveSearchGoalsForCurrentUser(
  goals: SearchGoalsInput,
): Promise<SearchGoals> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return saveSearchGoals(goals);
  }

  return saveCloudSearchGoals(goals);
}
