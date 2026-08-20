import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Briefcase,
  X,
  Sparkles,
} from "lucide-react";
import { SiteNav } from "@/components/SiteNav";
import { supabase } from "@/integrations/supabase/client";
import {
  APPLICATION_STATUSES,
  type Application,
  type ApplicationStatus,
  createApplication,
  deleteApplication,
  formatDate,
  loadApplications,
  summarise,
  updateApplication,
} from "@/lib/applications";
import {
  createCloudApplication,
  deleteCloudApplication,
  migrateGuestApplicationsToCloud,
  updateCloudApplication,
} from "@/lib/cloud-applications";

export const Route = createFileRoute("/applications")({
  head: () => ({
    meta: [
      { title: "Applications — JobLens AI Tracker" },
      {
        name: "description",
        content:
          "Track every job opportunity from saved role to final decision, with match scores from your JobLens AI analyses.",
      },
      { property: "og:title", content: "Applications — JobLens AI Tracker" },
      {
        property: "og:description",
        content: "Track every opportunity from saved role to final decision.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Applications — JobLens AI Tracker" },
      {
        name: "twitter:description",
        content: "Track every opportunity from saved role to final decision.",
      },
    ],
  }),
  component: ApplicationsPage,
});

const statusTone: Record<ApplicationStatus, string> = {
  Saved: "bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]",
  Applied: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)]",
  Interview: "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]",
  Case: "bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]",
  Offer: "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]",
  Rejected: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)]",
};

type FormState = {
  jobTitle: string;
  companyName: string;
  jobUrl: string;
  status: ApplicationStatus;
  appliedAt: string;
  notes: string;
};

const emptyForm: FormState = {
  jobTitle: "",
  companyName: "",
  jobUrl: "",
  status: "Saved",
  appliedAt: "",
  notes: "",
};

function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [cloudMode, setCloudMode] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const hydrate = async (signedIn: boolean) => {
      setHydrated(false);
      setSyncError(null);

      try {
        if (signedIn) {
          const cloudApplications = await migrateGuestApplicationsToCloud();

          if (!active) return;
          setCloudMode(true);
          setApps(cloudApplications);
        } else {
          if (!active) return;
          setCloudMode(false);
          setApps(loadApplications());
        }
      } catch (error) {
        console.error("[JobLens] Cloud application sync failed:", error);

        if (!active) return;

        // Important safety fallback:
        // never remove browser records if cloud migration fails.
        setCloudMode(false);
        setApps(loadApplications());
        setSyncError(
          "Cloud sync could not be completed. Your browser copies are still safe.",
        );
      } finally {
        if (active) setHydrated(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      void hydrate(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void hydrate(Boolean(session));
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const stats = useMemo(() => summarise(apps), [apps]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (a: Application) => {
    setEditingId(a.id);
    setForm({
      jobTitle: a.jobTitle,
      companyName: a.companyName,
      jobUrl: a.jobUrl ?? "",
      status: a.status,
      appliedAt: a.appliedAt ? a.appliedAt.slice(0, 10) : "",
      notes: a.notes ?? "",
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.jobTitle.trim() || !form.companyName.trim()) {
      setFormError("Job title and company are required.");
      return;
    }

    setFormError(null);

    const payload = {
      jobTitle: form.jobTitle.trim(),
      companyName: form.companyName.trim(),
      jobUrl: form.jobUrl.trim() || undefined,
      status: form.status,
      appliedAt: form.appliedAt || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (editingId) {
        if (cloudMode) {
          const updated = await updateCloudApplication(editingId, payload);
          setApps((current) =>
            current.map((app) => (app.id === editingId ? updated : app)),
          );
        } else {
          setApps(updateApplication(editingId, payload));
        }
      } else if (cloudMode) {
        const created = await createCloudApplication(payload);
        setApps((current) => [created, ...current]);
      } else {
        createApplication(payload);
        setApps(loadApplications());
      }

      setDialogOpen(false);
    } catch (error) {
      console.error("[JobLens] Application save failed:", error);
      setFormError("We couldn’t save this application. Please try again.");
    }
  };

  const changeStatus = async (id: string, status: ApplicationStatus) => {
    try {
      if (cloudMode) {
        const updated = await updateCloudApplication(id, { status });
        setApps((current) =>
          current.map((app) => (app.id === id ? updated : app)),
        );
      } else {
        setApps(updateApplication(id, { status }));
      }
    } catch (error) {
      console.error("[JobLens] Status update failed:", error);
      setSyncError("We couldn’t update this application. Please try again.");
    }
  };

  const remove = async (a: Application) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete “${a.jobTitle}” at ${a.companyName}?`)
    ) {
      return;
    }

    try {
      if (cloudMode) {
        await deleteCloudApplication(a.id);
        setApps((current) => current.filter((app) => app.id !== a.id));
      } else {
        setApps(deleteApplication(a.id));
      }
    } catch (error) {
      console.error("[JobLens] Application delete failed:", error);
      setSyncError("We couldn’t delete this application. Please try again.");
    }
  };

  return (
    <div className="min-h-screen">
      <SiteNav />

      <main className="px-5 pb-24 pt-10 md:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Applications</h1>
              <p className="mt-2 text-sm text-white/60 md:text-base">
                Track every opportunity from saved role to final decision.
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: "var(--gradient-hero)" }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add Application
            </button>
          </div>

          {/* Summary */}
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Active" value={stats.active} />
            <Stat label="Interviews" value={stats.interviews} />
            <Stat label="Offers" value={stats.offers} />
          </div>

          {!hydrated ? null : apps.length === 0 ? (
            <div className="card-surface mt-8 p-10 text-center">
              <div
                className="mx-auto grid h-12 w-12 place-items-center rounded-xl text-white"
                style={{ background: "var(--gradient-hero)" }}
                aria-hidden
              >
                <Briefcase className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">No applications yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--color-muted-foreground)]">
                Analyse a role to save it here automatically, or add an application manually to start tracking.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Analyze a Job
                </Link>
                <button
                  type="button"
                  onClick={openAdd}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Application
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {APPLICATION_STATUSES.map((status) => {
                const items = apps.filter((a) => a.status === status);
                return (
                  <section key={status} aria-label={status} className="min-w-0">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold tracking-wide text-white/80">{status}</h2>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                        {items.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {items.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/35">
                          Nothing here
                        </p>
                      ) : (
                        items.map((a) => (
                          <AppCard
                            key={a.id}
                            app={a}
                            onStatus={changeStatus}
                            onEdit={openEdit}
                            onDelete={remove}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {syncError && (
            <p className="mt-6 text-center text-sm text-[color:var(--color-warning)]">
              {syncError}
            </p>
          )}

          <p className="mt-10 text-center text-xs text-white/40">
            {cloudMode
              ? "Signed in · Applications are synced to your account."
              : "Guest mode · Applications are stored only in this browser."}
            {" "}No CV text is ever saved here.
          </p>
        </div>
      </main>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false);
          }}
        >
          <div className="card-surface max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 id="app-dialog-title" className="text-xl font-semibold">
                {editingId ? "Edit application" : "Add application"}
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submitForm} noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="f-title" label="Job title" required>
                  <input
                    id="f-title"
                    className="jl-input"
                    value={form.jobTitle}
                    onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                    placeholder="e.g. Product Intern"
                    autoFocus
                  />
                </FormField>
                <FormField id="f-company" label="Company" required>
                  <input
                    id="f-company"
                    className="jl-input"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="e.g. Acme"
                  />
                </FormField>
              </div>

              <FormField id="f-url" label="Job URL" hint="Optional">
                <input
                  id="f-url"
                  className="jl-input"
                  value={form.jobUrl}
                  onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
                  placeholder="https://…"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField id="f-status" label="Status">
                  <select
                    id="f-status"
                    className="jl-input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ApplicationStatus })}
                  >
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField id="f-date" label="Applied date" hint="Optional">
                  <input
                    id="f-date"
                    type="date"
                    className="jl-input"
                    value={form.appliedAt}
                    onChange={(e) => setForm({ ...form, appliedAt: e.target.value })}
                  />
                </FormField>
              </div>

              <FormField id="f-notes" label="Notes" hint="Optional">
                <textarea
                  id="f-notes"
                  rows={3}
                  className="jl-input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Referral, deadline, next step…"
                />
              </FormField>

              {formError && (
                <p role="alert" className="text-sm text-[color:var(--color-danger)]">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-surface-foreground)] hover:bg-[color:var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {editingId ? "Save changes" : "Add application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .jl-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: white;
          color: var(--color-surface-foreground);
          padding: 0.6rem 0.8rem;
          font-size: 0.925rem;
        }
        .jl-input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 25%, transparent);
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function AppCard({
  app,
  onStatus,
  onEdit,
  onDelete,
}: {
  app: Application;
  onStatus: (id: string, s: ApplicationStatus) => void;
  onEdit: (a: Application) => void;
  onDelete: (a: Application) => void;
}) {
  const date = app.appliedAt ? formatDate(app.appliedAt) : formatDate(app.createdAt);
  return (
    <article className="card-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{app.companyName || "—"}</p>
          <p className="mt-0.5 break-words text-sm text-[color:var(--color-muted-foreground)]">
            {app.jobTitle}
          </p>
        </div>
        {typeof app.matchScore === "number" && (
          <span className="shrink-0 rounded-lg bg-[color:var(--color-primary)]/12 px-2 py-1 text-xs font-semibold text-[color:var(--color-primary)]">
            {app.matchScore}%
          </span>
        )}
      </div>

      {app.verdict && (
        <span
          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[app.status]}`}
        >
          {app.verdict}
        </span>
      )}

      {app.notes && (
        <p className="mt-2 line-clamp-2 text-xs text-[color:var(--color-muted-foreground)]">{app.notes}</p>
      )}

      <p className="mt-2 text-[11px] text-[color:var(--color-muted-foreground)]">
        {app.appliedAt ? "Applied" : "Saved"} {date}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <label className="sr-only" htmlFor={`status-${app.id}`}>
          Status for {app.jobTitle}
        </label>
        <select
          id={`status-${app.id}`}
          value={app.status}
          onChange={(e) => onStatus(app.id, e.target.value as ApplicationStatus)}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[color:var(--color-surface-foreground)]"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {app.jobUrl && (
          <a
            href={app.jobUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open job posting for ${app.jobTitle}`}
            className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
        <button
          type="button"
          onClick={() => onEdit(app)}
          aria-label={`View or edit ${app.jobTitle}`}
          className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onDelete(app)}
          aria-label={`Delete ${app.jobTitle}`}
          className="rounded-lg border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-danger)] hover:bg-[color:var(--color-danger)]/10"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </article>
  );
}

function FormField({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-[color:var(--color-danger)]"> *</span>}
        {hint && (
          <span className="ml-1 text-xs font-normal text-[color:var(--color-muted-foreground)]">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}
