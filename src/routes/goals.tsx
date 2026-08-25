import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Check,
  MapPin,
  Target,
} from "lucide-react";

import { SiteNav } from "@/components/SiteNav";
import { supabase } from "@/integrations/supabase/client";

import {
  DEFAULT_SEARCH_GOALS,
  WORK_MODELS,
  loadSearchGoals,
  type SearchGoals,
  type WorkModel,
} from "@/lib/search-goals";

import {
  migrateGuestSearchGoalsToCloud,
  saveSearchGoalsForCurrentUser,
} from "@/lib/cloud-search-goals";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      {
        title: "My Goals — JobLens AI",
      },
      {
        name: "description",
        content:
          "Define the roles, locations and work setup you want JobLens to optimise your job search around.",
      },
    ],
  }),
  component: GoalsPage,
});

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function GoalsPage() {
  const [goals, setGoals] =
    useState<SearchGoals>({
      ...DEFAULT_SEARCH_GOALS,
    });

  const [rolesText, setRolesText] =
    useState("");

  const [locationsText, setLocationsText] =
    useState("");

  const [industriesText, setIndustriesText] =
    useState("");

  const [draftWorkModels, setDraftWorkModels] =
    useState<WorkModel[]>([]);

  const [
    draftWeeklyApplicationGoal,
    setDraftWeeklyApplicationGoal,
  ] = useState(
    DEFAULT_SEARCH_GOALS.weeklyApplicationGoal,
  );

  const [hydrated, setHydrated] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
    useState(false);

  const [editing, setEditing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      setHydrated(false);
      setError(null);

      try {
        const loaded =
          await migrateGuestSearchGoalsToCloud();

        if (!active) return;

        setGoals(loaded);
        setRolesText(
          loaded.targetRoles.join(", "),
        );
        setLocationsText(
          loaded.locations.join(", "),
        );
        setIndustriesText(
          loaded.targetIndustries.join(", "),
        );
        setDraftWorkModels(
          loaded.workModels,
        );
        setDraftWeeklyApplicationGoal(
          loaded.weeklyApplicationGoal,
        );

        setEditing(
          loaded.targetRoles.length === 0 &&
            loaded.locations.length === 0 &&
            loaded.workModels.length === 0,
        );
      } catch (loadError) {
        console.error(
          "[JobLens Goals] Load failed:",
          loadError,
        );

        if (!active) return;

        const fallback =
          loadSearchGoals();

        setGoals(fallback);
        setRolesText(
          fallback.targetRoles.join(", "),
        );
        setLocationsText(
          fallback.locations.join(", "),
        );
        setIndustriesText(
          fallback.targetIndustries.join(", "),
        );
        setDraftWorkModels(
          fallback.workModels,
        );
        setDraftWeeklyApplicationGoal(
          fallback.weeklyApplicationGoal,
        );

        setEditing(
          fallback.targetRoles.length === 0 &&
            fallback.locations.length === 0 &&
            fallback.workModels.length === 0,
        );

        setError(
          "Cloud goals couldn’t be loaded. Showing browser strategy instead.",
        );
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    };

    void hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT"
        ) {
          void hydrate();
        }
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const toggleWorkModel = (
    model: WorkModel,
  ) => {
    setSaved(false);

    setDraftWorkModels((current) =>
      current.includes(model)
        ? current.filter(
            (item) => item !== model,
          )
        : [...current, model],
    );
  };

  const cancelEditing = () => {
    setRolesText(
      goals.targetRoles.join(", "),
    );
    setLocationsText(
      goals.locations.join(", "),
    );
    setIndustriesText(
      goals.targetIndustries.join(", "),
    );
    setDraftWorkModels(
      goals.workModels,
    );
    setDraftWeeklyApplicationGoal(
      goals.weeklyApplicationGoal,
    );
    setSaved(false);
    setEditing(false);
  };

  const primaryTargetRole =
    goals.targetRoles[0] ?? null;

  const secondaryTargetRoles =
    goals.targetRoles.slice(1);

  const strategySignals = [
    goals.targetRoles.length > 0,
    goals.targetIndustries.length > 0,
    goals.locations.length > 0,
    goals.workModels.length > 0,
  ];

  const strategyReadiness =
    Math.round(
      (strategySignals.filter(Boolean).length /
        strategySignals.length) *
        100,
    );

  const save = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    const targetRoles =
      splitList(rolesText);

    if (targetRoles.length === 0) {
      setSaved(false);
      setError(
        "Add at least one target role before saving your strategy.",
      );
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const result =
        await saveSearchGoalsForCurrentUser({
          targetRoles,

          targetIndustries:
            splitList(industriesText),

          locations:
            splitList(locationsText),

          workModels:
            draftWorkModels,

          weeklyApplicationGoal:
            draftWeeklyApplicationGoal,
        });

      setGoals(result);
      setRolesText(
        result.targetRoles.join(", "),
      );
      setLocationsText(
        result.locations.join(", "),
      );
      setIndustriesText(
        result.targetIndustries.join(", "),
      );
      setDraftWorkModels(
        result.workModels,
      );
      setDraftWeeklyApplicationGoal(
        result.weeklyApplicationGoal,
      );

      setSaved(true);
      setEditing(false);
    } catch (saveError) {
      console.error(
        "[JobLens Goals] Save failed:",
        saveError,
      );

      setError(
        "JobLens couldn’t save your goals. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteNav />

      <main className="px-5 pb-24 pt-10 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-primary)]">
              Target Strategy
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              What are you actually looking for?
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/60 md:text-base">
              Give JobLens a target so future
              recommendations can optimise for
              your career direction — not only
              CV keyword match.
            </p>
          </div>

          {!hydrated ? (
            <div className="card-surface mt-8 p-6">
              <p className="text-sm text-[color:var(--color-muted-foreground)]">
                Loading your strategy...
              </p>
            </div>
          ) : (
            <>
              <section className="card-surface mt-8 p-6 md:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                      Your current strategy
                    </p>

                    <h2 className="mt-1 text-xl font-semibold">
                      Career search snapshot
                    </h2>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                      JobLens uses these goals to understand where you want your career search to go — not just whether your CV matches a single job.
                    </p>

                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
                        <div
                          className="h-full rounded-full bg-[color:var(--color-primary)] transition-all"
                          style={{
                            width: `${strategyReadiness}%`,
                          }}
                        />
                      </div>

                      <span className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                        Strategy readiness {strategyReadiness}%
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                  >
                    Edit strategy
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/25 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                      Primary target
                    </p>

                    {primaryTargetRole ? (
                      <>
                        <p className="mt-3 text-base font-semibold text-[color:var(--color-primary)]">
                          {primaryTargetRole}
                        </p>

                        {secondaryTargetRoles.length > 0 && (
                          <>
                            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-muted-foreground)]">
                              Secondary directions
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {secondaryTargetRoles.map(
                                (role) => (
                                  <span
                                    key={role}
                                    className="rounded-lg border border-[color:var(--color-border)] px-2.5 py-1 text-xs font-medium"
                                  >
                                    {role}
                                  </span>
                                ),
                              )}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-[color:var(--color-muted-foreground)]">
                        No target roles yet
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/25 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                      Target industries
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {goals.targetIndustries.length > 0 ? (
                        goals.targetIndustries.map(
                          (industry) => (
                            <span
                              key={industry}
                              className="rounded-lg border border-[color:var(--color-border)] px-2.5 py-1 text-xs font-medium"
                            >
                              {industry}
                            </span>
                          ),
                        )
                      ) : (
                        <span className="text-sm text-[color:var(--color-muted-foreground)]">
                          No industries selected
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/25 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                      Location & work style
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {goals.locations.map((location) => (
                        <span
                          key={location}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium"
                        >
                          {location}
                        </span>
                      ))}

                      {goals.workModels.map((model) => (
                        <span
                          key={model}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium"
                        >
                          {model}
                        </span>
                      ))}

                      {goals.locations.length === 0 &&
                        goals.workModels.length === 0 && (
                          <span className="text-sm text-[color:var(--color-muted-foreground)]">
                            Not defined yet
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/25 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                      Weekly focus
                    </p>

                    <p className="mt-3 text-3xl font-semibold">
                      {goals.weeklyApplicationGoal}
                    </p>

                    <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                      applications per week
                    </p>
                  </div>
                </div>

                <div className="mt-5 border-t border-[color:var(--color-border)] pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                    Strategy guardrails
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-[color:var(--color-muted)]/30 p-4">
                      <p className="text-xs font-semibold text-[color:var(--color-muted-foreground)]">
                        ROLE FILTER
                      </p>

                      <p className="mt-2 text-sm font-semibold">
                        {primaryTargetRole ?? "Set a primary target"}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                        Prioritise opportunities closest to your primary direction.
                      </p>
                    </div>

                    <div className="rounded-xl bg-[color:var(--color-muted)]/30 p-4">
                      <p className="text-xs font-semibold text-[color:var(--color-muted-foreground)]">
                        INDUSTRY FILTER
                      </p>

                      <p className="mt-2 text-sm font-semibold">
                        {goals.targetIndustries.length > 0
                          ? goals.targetIndustries.join(" · ")
                          : "Any industry"}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                        Give extra weight to opportunities inside your chosen industries.
                      </p>
                    </div>

                    <div className="rounded-xl bg-[color:var(--color-muted)]/30 p-4">
                      <p className="text-xs font-semibold text-[color:var(--color-muted-foreground)]">
                        WORK FILTER
                      </p>

                      <p className="mt-2 text-sm font-semibold">
                        {goals.locations.length > 0
                          ? goals.locations.join(" · ")
                          : "Any location"}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                        {goals.workModels.length > 0
                          ? goals.workModels.join(" · ")
                          : "No work model preference yet"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[color:var(--color-muted)]/30 p-4">
                      <p className="text-xs font-semibold text-[color:var(--color-muted-foreground)]">
                        WEEKLY PACE
                      </p>

                      <p className="mt-2 text-sm font-semibold">
                        {goals.weeklyApplicationGoal} quality applications
                      </p>

                      <p className="mt-1 text-xs leading-5 text-[color:var(--color-muted-foreground)]">
                        Use your target as a pacing guide, not a volume contest.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/[0.06] p-5 md:flex md:items-center md:justify-between md:gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-primary)]">
                      Your next move
                    </p>

                    <p className="mt-2 text-sm leading-6 text-[color:var(--color-muted-foreground)]">
                      {primaryTargetRole
                        ? `Your primary direction is ${primaryTargetRole}. Use this strategy as the lens for the next opportunity you evaluate.`
                        : "Define your primary target so JobLens can evaluate opportunities against your actual career direction."}
                    </p>
                  </div>

                  <div className="mt-4 flex shrink-0 flex-wrap gap-2 md:mt-0">
                    <Link
                      to="/"
                      className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      style={{
                        background:
                          "var(--gradient-hero)",
                      }}
                    >
                      Analyze a role →
                    </Link>

                    <Link
                      to="/applications"
                      className="inline-flex items-center justify-center rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                    >
                      View applications
                    </Link>
                  </div>
                </div>
              </section>

              {editing && (
                <form
                  id="edit-strategy"
                  onSubmit={save}
                  className="card-surface mt-6 p-6 md:p-8"
                >
              <div>
                <div className="flex items-center gap-2">
                  <Target
                    className="h-4 w-4 text-[color:var(--color-primary)]"
                    aria-hidden
                  />

                  <label
                    htmlFor="target-roles"
                    className="text-sm font-semibold"
                  >
                    Target roles
                  </label>
                </div>

                <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  Separate multiple roles with commas. Put your highest-priority role first.
                </p>

                <input
                  id="target-roles"
                  value={rolesText}
                  onChange={(event) => {
                    setRolesText(
                      event.target.value,
                    );
                    setSaved(false);
                  }}
                  placeholder="Product Intern, Business Development Intern, Digital Transformation"
                  className="mt-3 w-full rounded-xl border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-sm outline-none transition focus:border-[color:var(--color-primary)]"
                />
              </div>

              <div className="mt-7">
                <label
                  htmlFor="target-industries"
                  className="text-sm font-semibold"
                >
                  Target industries
                </label>

                <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  Add the industries you want JobLens to prioritise. Separate multiple industries with commas.
                </p>

                <input
                  id="target-industries"
                  value={industriesText}
                  onChange={(event) => {
                    setIndustriesText(
                      event.target.value,
                    );
                    setSaved(false);
                  }}
                  placeholder="Technology, Pharmaceuticals, Automotive"
                  className="mt-3 w-full rounded-xl border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-sm outline-none transition focus:border-[color:var(--color-primary)]"
                />
              </div>

              <div className="mt-7">
                <div className="flex items-center gap-2">
                  <MapPin
                    className="h-4 w-4 text-[color:var(--color-primary)]"
                    aria-hidden
                  />

                  <label
                    htmlFor="target-locations"
                    className="text-sm font-semibold"
                  >
                    Preferred locations
                  </label>
                </div>

                <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  Cities or regions you would realistically work in.
                </p>

                <input
                  id="target-locations"
                  value={locationsText}
                  onChange={(event) => {
                    setLocationsText(
                      event.target.value,
                    );
                    setSaved(false);
                  }}
                  placeholder="İstanbul, Kocaeli"
                  className="mt-3 w-full rounded-xl border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-sm outline-none transition focus:border-[color:var(--color-primary)]"
                />
              </div>

              <div className="mt-7">
                <p className="text-sm font-semibold">
                  Work model
                </p>

                <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  Select every setup you would consider.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {WORK_MODELS.map((model) => {
                    const selected =
                      draftWorkModels.includes(
                        model,
                      );

                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() =>
                          toggleWorkModel(model)
                        }
                        className={
                          selected
                            ? "rounded-xl border border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/15 px-4 py-2 text-sm font-semibold text-[color:var(--color-primary)]"
                            : "rounded-xl border border-[color:var(--color-border)] px-4 py-2 text-sm font-medium text-[color:var(--color-muted-foreground)] transition hover:bg-[color:var(--color-muted)]"
                        }
                      >
                        {model}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7">
                <label
                  htmlFor="weekly-goal"
                  className="text-sm font-semibold"
                >
                  Weekly application goal
                </label>

                <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  A realistic target is more useful than a huge number.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <input
                    id="weekly-goal"
                    type="number"
                    min={1}
                    max={50}
                    value={
                      draftWeeklyApplicationGoal
                    }
                    onChange={(event) => {
                      setSaved(false);

                      setDraftWeeklyApplicationGoal(
                        Number(
                          event.target.value,
                        ),
                      );
                    }}
                    className="w-28 rounded-xl border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-sm font-semibold outline-none transition focus:border-[color:var(--color-primary)]"
                  />

                  <span className="text-sm text-[color:var(--color-muted-foreground)]">
                    applications / week
                  </span>
                </div>
              </div>

              {error && (
                <p className="mt-6 text-sm text-[color:var(--color-danger)]">
                  {error}
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background:
                      "var(--gradient-hero)",
                  }}
                >
                  {saving
                    ? "Saving..."
                    : "Save Strategy"}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelEditing}
                  className="rounded-xl border border-[color:var(--color-border)] px-5 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                {saved && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-success)]">
                    <Check
                      className="h-4 w-4"
                      aria-hidden
                    />
                    Saved
                  </span>
                )}
              </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
