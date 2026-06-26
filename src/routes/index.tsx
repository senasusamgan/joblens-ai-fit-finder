import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobLens AI — Know your fit. Improve your application." },
      {
        name: "description",
        content:
          "Honest, explainable AI feedback on your CV against any job description. Built for students and recent graduates.",
      },
      { property: "og:title", content: "JobLens AI" },
      {
        property: "og:description",
        content: "Honest, explainable application feedback for students and recent graduates.",
      },
    ],
  }),
  component: Index,
});

type Severity = "Low" | "Medium" | "High";
type Verdict = "Strong Fit" | "Worth Applying" | "Stretch Opportunity" | "Low Fit";

interface Analysis {
  verdict: Verdict;
  verdictExplanation: string;
  matchScore: number;
  strongMatches: { requirement: string; cvEvidence: string; explanation: string }[];
  partialMatches: { requirement: string; cvEvidence: string; remainingGap: string; explanation: string }[];
  learnableGaps: { skill: string; importance: string; suggestion: string }[];
  possibleBlockers: { requirement: string; reason: string; severity: Severity }[];
  cvSuggestions: { section: string; suggestion: string; reason: string; example: string }[];
  recruiterMessage: string;
  disclaimer: string;
}

const verdictTone: Record<Verdict, { label: string; bg: string; ring: string }> = {
  "Strong Fit": { label: "✓ Strong Fit", bg: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]", ring: "ring-[color:var(--color-success)]/40" },
  "Worth Applying": { label: "→ Worth Applying", bg: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)]", ring: "ring-[color:var(--color-info)]/40" },
  "Stretch Opportunity": { label: "↗ Stretch Opportunity", bg: "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)]", ring: "ring-[color:var(--color-warning)]/40" },
  "Low Fit": { label: "✕ Low Fit", bg: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)]", ring: "ring-[color:var(--color-danger)]/40" },
};

const severityTone: Record<Severity, string> = {
  Low: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)] border-[color:var(--color-info)]/30",
  Medium: "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)] border-[color:var(--color-warning)]/40",
  High: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)] border-[color:var(--color-danger)]/30",
};

function Index() {
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cv, setCv] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [language, setLanguage] = useState<"English" | "Turkish">("English");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!jobTitle.trim()) e.jobTitle = "Please enter the job title.";
    if (!cv.trim()) e.cv = "Please paste your CV.";
    else if (cv.trim().length < 150) e.cv = "Your CV looks too short. Please paste the full text (at least 150 characters).";
    if (!jobDescription.trim()) e.jobDescription = "Please paste the job description.";
    else if (jobDescription.trim().length < 150)
      e.jobDescription = "The job description looks too short. Please paste the complete posting (at least 150 characters).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true);
    setSubmitError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, companyName, cv, jobDescription, language }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as Analysis;
      setAnalysis(data);
      setTimeout(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch {
      setSubmitError("We couldn’t complete the analysis. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyMessage = async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis.recruiterMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="px-6 pt-12 pb-8 md:pt-20 md:pb-12">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-white/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-accent)]" aria-hidden />
            AI-powered · Honest by design
          </div>
          <h1 className="mt-6 text-4xl md:text-6xl font-semibold tracking-tight">
            JobLens <span className="gradient-text">AI</span>
          </h1>
          <p className="mt-4 text-lg md:text-xl text-white/80">Know your fit. Improve your application.</p>
          <p className="mt-2 text-sm md:text-base text-white/55 max-w-2xl mx-auto">
            Honest, explainable application feedback for students and recent graduates.
          </p>
        </div>
      </header>

      <main className="px-6 pb-24">
        {!analysis ? (
          <section className="mx-auto max-w-3xl">
            <div className="card-surface p-6 md:p-10">
              <h2 className="text-2xl font-semibold">Analyse a job application</h2>
              <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                Paste your CV and the job description. We’ll tell you where you stand — without inventing anything.
              </p>

              <form
                className="mt-8 space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                noValidate
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field
                    id="jobTitle"
                    label="Job Title"
                    required
                    error={errors.jobTitle}
                  >
                    <input
                      id="jobTitle"
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Marketing Intern"
                      className="input"
                      aria-invalid={!!errors.jobTitle}
                    />
                  </Field>
                  <Field id="companyName" label="Company Name" hint="Optional">
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Inc."
                      className="input"
                    />
                  </Field>
                </div>

                <Field id="cv" label="CV" required error={errors.cv}>
                  <textarea
                    id="cv"
                    value={cv}
                    onChange={(e) => setCv(e.target.value)}
                    rows={10}
                    placeholder="Paste the full plain text of your CV here — education, experience, projects, skills, languages."
                    className="input min-h-[200px] resize-y"
                    aria-invalid={!!errors.cv}
                  />
                </Field>

                <Field id="jd" label="Job Description" required error={errors.jobDescription}>
                  <textarea
                    id="jd"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={10}
                    placeholder="Paste the complete job or internship description here — responsibilities, requirements, qualifications."
                    className="input min-h-[200px] resize-y"
                    aria-invalid={!!errors.jobDescription}
                  />
                </Field>

                <Field id="language" label="Output Language">
                  <select
                    id="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "English" | "Turkish")}
                    className="input"
                  >
                    <option value="English">English</option>
                    <option value="Turkish">Turkish</option>
                  </select>
                </Field>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 font-medium text-[color:var(--color-primary-foreground)] shadow-[var(--shadow-soft)] transition disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    {loading ? (
                      <>
                        <Spinner />
                        <span>Reviewing your experience and the job requirements...</span>
                      </>
                    ) : (
                      <>Analyse My Application</>
                    )}
                  </button>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/10 px-4 py-3 text-sm text-[color:var(--color-danger)] flex items-start justify-between gap-4"
                  >
                    <span>{submitError}</span>
                    <button
                      type="button"
                      onClick={submit}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                <p className="text-xs text-[color:var(--color-muted-foreground)] leading-relaxed">
                  Your CV is used only to generate this analysis. Avoid including unnecessary sensitive personal
                  information.
                </p>
              </form>
            </div>
          </section>
        ) : (
          <section id="results" className="mx-auto max-w-3xl space-y-6">
            {/* Verdict card */}
            <div className="card-surface p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ${verdictTone[analysis.verdict].bg} ${verdictTone[analysis.verdict].ring}`}
                  >
                    {verdictTone[analysis.verdict].label}
                  </span>
                  <p className="mt-3 text-base text-[color:var(--color-surface-foreground)]">
                    {analysis.verdictExplanation}
                  </p>
                  <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                    Estimated match score · explainable, not an official ATS result.
                  </p>
                </div>
                <ScoreRing score={analysis.matchScore} />
              </div>
            </div>

            <ResultCard title="Strong Matches" accent="success" count={analysis.strongMatches.length}>
              {analysis.strongMatches.length === 0 ? (
                <Empty text="No clearly evidenced strong matches were found." />
              ) : (
                <ul className="space-y-4">
                  {analysis.strongMatches.map((m, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <p className="font-medium">{m.requirement}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">CV evidence: </span>
                        {m.cvEvidence}
                      </p>
                      <p className="mt-1 text-sm">{m.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title="Partial Matches" accent="warning" count={(analysis.partialMatches ?? []).length}>
              {(analysis.partialMatches ?? []).length === 0 ? (
                <Empty text="No partial matches identified." />
              ) : (
                <ul className="space-y-4">
                  {analysis.partialMatches.map((p, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <p className="font-medium">{p.requirement}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">CV evidence: </span>
                        {p.cvEvidence}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">Remaining gap: </span>
                        {p.remainingGap}
                      </p>
                      <p className="mt-1 text-sm">{p.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title="Learnable Gaps" accent="info" count={analysis.learnableGaps.length}>
              {analysis.learnableGaps.length === 0 ? (
                <Empty text="No notable learnable gaps were identified." />
              ) : (
                <ul className="space-y-4">
                  {analysis.learnableGaps.map((g, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{g.skill}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]">
                          {g.importance}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{g.suggestion}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title="Possible Blockers" accent="danger" count={analysis.possibleBlockers.length}>
              {analysis.possibleBlockers.length === 0 ? (
                <Empty text="No clear mandatory blockers were identified." />
              ) : (
                <ul className="space-y-4">
                  {analysis.possibleBlockers.map((b, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{b.requirement}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${severityTone[b.severity]}`}
                          aria-label={`Severity ${b.severity}`}
                        >
                          {b.severity} severity
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{b.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title="CV Improvement Suggestions" accent="primary" count={analysis.cvSuggestions.length}>
              {analysis.cvSuggestions.length === 0 ? (
                <Empty text="No specific CV suggestions for this application." />
              ) : (
                <ul className="space-y-4">
                  {analysis.cvSuggestions.map((s, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                        {s.section}
                      </p>
                      <p className="mt-1 font-medium">{s.suggestion}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">{s.reason}</p>
                      {s.example && (
                        <div className="mt-3 rounded-md bg-[color:var(--color-muted)] p-3 text-sm">
                          <span className="block text-xs font-semibold text-[color:var(--color-muted-foreground)] mb-1">
                            Example rewrite
                          </span>
                          {s.example}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title="Recruiter Message" accent="accent">
              <div className="rounded-lg bg-[color:var(--color-muted)] p-4 text-sm whitespace-pre-wrap">
                {analysis.recruiterMessage}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={copyMessage}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[color:var(--color-primary-foreground)]"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {copied ? "✓ Copied" : "Copy Message"}
                </button>
                <span aria-live="polite" className="text-xs text-[color:var(--color-muted-foreground)]">
                  {copied ? "Message copied to your clipboard." : ""}
                </span>
              </div>
            </ResultCard>

            <p className="text-xs text-white/55 text-center px-4">{analysis.disclaimer}</p>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition"
              >
                Analyse Another Application
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="px-6 pb-10 text-center text-xs text-white/40">
        JobLens AI · Estimates only — not an official ATS assessment or hiring decision.
      </footer>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: white;
          color: var(--color-surface-foreground);
          padding: 0.7rem 0.9rem;
          font-size: 0.95rem;
          transition: border-color .15s, box-shadow .15s;
        }
        .input:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 25%, transparent);
        }
        .input[aria-invalid="true"] {
          border-color: var(--color-danger);
        }
      `}</style>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center justify-between text-sm font-medium text-[color:var(--color-surface-foreground)]">
        <span>
          {label}
          {required && <span className="text-[color:var(--color-danger)]" aria-hidden> *</span>}
          {required && <span className="sr-only"> (required)</span>}
        </span>
        {hint && <span className="text-xs text-[color:var(--color-muted-foreground)]">{hint}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-[color:var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

function ResultCard({
  title,
  accent,
  count,
  children,
}: {
  title: string;
  accent: "success" | "info" | "danger" | "primary" | "accent" | "warning";
  count?: number;
  children: React.ReactNode;
}) {
  const dot: Record<typeof accent, string> = {
    success: "bg-[color:var(--color-success)]",
    info: "bg-[color:var(--color-info)]",
    danger: "bg-[color:var(--color-danger)]",
    primary: "bg-[color:var(--color-primary)]",
    accent: "bg-[color:var(--color-accent)]",
    warning: "bg-[color:var(--color-warning)]",
  } as const;
  return (
    <div className="card-surface p-6 md:p-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <span className={`h-2 w-2 rounded-full ${dot[accent]}`} aria-hidden />
          {title}
        </h3>
        {typeof count === "number" && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-sm text-[color:var(--color-muted-foreground)] italic">{text}</p>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const color =
    clamped >= 75
      ? "var(--color-success)"
      : clamped >= 50
        ? "var(--color-info)"
        : clamped >= 30
          ? "var(--color-warning)"
          : "var(--color-danger)";
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`Estimated match score ${clamped} out of 100`}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} stroke="var(--color-muted)" strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fontSize="26"
          fontWeight="700"
          fill="var(--color-surface-foreground)"
          fontFamily="var(--font-display)"
        >
          {clamped}
        </text>
        <text
          x="60"
          y="78"
          textAnchor="middle"
          fontSize="11"
          fill="var(--color-muted-foreground)"
        >
          / 100
        </text>
      </svg>
      <span className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">Estimated match</span>
    </div>
  );
}
