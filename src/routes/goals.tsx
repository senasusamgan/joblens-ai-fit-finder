import { createFileRoute } from "@tanstack/react-router";
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

  const [hydrated, setHydrated] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [saved, setSaved] =
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
      } catch (loadError) {
        console.error(
          "[JobLens Goals] Load failed:",
          loadError,
        );

        if (!active) return;

        setError(
          "Your goals couldn’t be loaded right now.",
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

    setGoals((current) => ({
      ...current,
      workModels:
        current.workModels.includes(model)
          ? current.workModels.filter(
              (item) => item !== model,
            )
          : [
              ...current.workModels,
              model,
            ],
    }));
  };

  const save = async (
    event: React.FormEvent,
  ) => {
    event.preventDefault();

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const result =
        await saveSearchGoalsForCurrentUser({
          targetRoles:
            splitList(rolesText),

          locations:
            splitList(locationsText),

          workModels:
            goals.workModels,

          weeklyApplicationGoal:
            goals.weeklyApplicationGoal,
        });

      setGoals(result);
      setRolesText(
        result.targetRoles.join(", "),
      );
      setLocationsText(
        result.locations.join(", "),
      );

      setSaved(true);
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
            <form
              onSubmit={save}
              className="card-surface mt-8 p-6 md:p-8"
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
                  Separate multiple roles with commas.
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
                      goals.workModels.includes(
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
                      goals.weeklyApplicationGoal
                    }
                    onChange={(event) => {
                      setSaved(false);

                      setGoals(
                        (current) => ({
                          ...current,
                          weeklyApplicationGoal:
                            Number(
                              event.target.value,
                            ),
                        }),
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
        </div>
      </main>
    </div>
  );
}
