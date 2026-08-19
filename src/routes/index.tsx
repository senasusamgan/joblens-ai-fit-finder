import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { extractCvText, CvExtractError, MAX_CV_BYTES } from "@/lib/cv-extract";
import { SiteNav } from "@/components/SiteNav";
import { createApplication } from "@/lib/applications";


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

type Lang = "English" | "Turkish";

const verdictTone: Record<Verdict, { icon: string; bg: string; ring: string }> = {
  "Strong Fit": { icon: "✓", bg: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]", ring: "ring-[color:var(--color-success)]/40" },
  "Worth Applying": { icon: "→", bg: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)]", ring: "ring-[color:var(--color-info)]/40" },
  "Stretch Opportunity": { icon: "↗", bg: "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)]", ring: "ring-[color:var(--color-warning)]/40" },
  "Low Fit": { icon: "✕", bg: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)]", ring: "ring-[color:var(--color-danger)]/40" },
};

const verdictLabel: Record<Lang, Record<Verdict, string>> = {
  English: {
    "Strong Fit": "Strong Fit",
    "Worth Applying": "Worth Applying",
    "Stretch Opportunity": "Stretch Opportunity",
    "Low Fit": "Low Fit",
  },
  Turkish: {
    "Strong Fit": "Güçlü Uyum",
    "Worth Applying": "Başvurmaya Değer",
    "Stretch Opportunity": "Zorlayıcı Fırsat",
    "Low Fit": "Düşük Uyum",
  },
};

const severityLabel: Record<Lang, Record<Severity, string>> = {
  English: { Low: "Low", Medium: "Medium", High: "High" },
  Turkish: { Low: "Düşük", Medium: "Orta", High: "Yüksek" },
};

const severityTone: Record<Severity, string> = {
  Low: "bg-[color:var(--color-info)]/15 text-[color:var(--color-info)] border-[color:var(--color-info)]/30",
  Medium: "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)] border-[color:var(--color-warning)]/40",
  High: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)] border-[color:var(--color-danger)]/30",
};

const T = {
  English: {
    strongMatches: "Strong Matches",
    partialMatches: "Partial Matches",
    learnableGaps: "Learnable Gaps",
    possibleBlockers: "Possible Blockers",
    cvSuggestions: "CV Improvement Suggestions",
    recruiterMessage: "Recruiter Message",
    cvEvidence: "CV evidence",
    remainingGap: "Remaining gap",
    exampleRewrite: "Example rewrite",
    estimatedMatch: "Estimated match",
    estimatedMatchScore: "Estimated match score · explainable, not an official ATS result.",
    copyMessage: "Copy Message",
    copied: "✓ Copied",
    copiedAnnounce: "Message copied to your clipboard.",
    analyseAnother: "Analyse Another Application",
    severitySuffix: "severity",
    noStrong: "No clearly evidenced strong matches were found.",
    noPartial: "No partial matches identified.",
    noGaps: "No notable learnable gaps were identified.",
    noBlockers: "No clear mandatory blockers were identified.",
    noSuggestions: "No specific CV suggestions for this application.",
  },
  Turkish: {
    strongMatches: "Güçlü Eşleşmeler",
    partialMatches: "Kısmi Eşleşmeler",
    learnableGaps: "Geliştirilebilir Eksikler",
    possibleBlockers: "Olası Engeller",
    cvSuggestions: "CV Geliştirme Önerileri",
    recruiterMessage: "İşe Alım Uzmanına Mesaj",
    cvEvidence: "CV kanıtı",
    remainingGap: "Eksik kalan nokta",
    exampleRewrite: "Örnek düzenleme",
    estimatedMatch: "Tahmini uyum",
    estimatedMatchScore: "Tahmini uyum puanı · açıklanabilir bir tahmindir, resmi bir ATS sonucu değildir.",
    copyMessage: "Mesajı Kopyala",
    copied: "✓ Kopyalandı",
    copiedAnnounce: "Mesaj panoya kopyalandı.",
    analyseAnother: "Başka Bir Başvuruyu Analiz Et",
    severitySuffix: "önem",
    noStrong: "CV'de açıkça kanıtlanmış güçlü eşleşme bulunamadı.",
    noPartial: "Kısmi eşleşme bulunamadı.",
    noGaps: "Belirgin bir geliştirilebilir eksiklik bulunmadı.",
    noBlockers: "Net bir zorunlu engel bulunmadı.",
    noSuggestions: "Bu başvuru için özel bir CV önerisi yok.",
  },
} as const;


function Index() {
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cv, setCv] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [language, setLanguage] = useState<Lang>("English");
  const [analysisLang, setAnalysisLang] = useState<Lang>("English");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);

  // CV input mode
  const [cvMode, setCvMode] = useState<"paste" | "upload">("paste");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvFileText, setCvFileText] = useState<string>("");
  const [cvFileError, setCvFileError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = T[analysisLang];

  const activeCv = cvMode === "upload" ? cvFileText : cv;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!jobTitle.trim()) e.jobTitle = "Please enter the job title.";
    if (cvMode === "paste") {
      if (!cv.trim()) e.cv = "Please paste your CV.";
      else if (cv.trim().length < 150)
        e.cv = "Your CV looks too short. Please paste the full text (at least 150 characters).";
    } else {
      if (!cvFileText.trim())
        e.cv = "Please upload your CV file.";
      else if (cvFileText.trim().length < 150)
        e.cv = "We could only read a small amount of text from this file. Please try another file or paste the CV text manually.";
    }
    if (!jobDescription.trim()) e.jobDescription = "Please paste the job description.";
    else if (jobDescription.trim().length < 150)
      e.jobDescription = "The job description looks too short. Please paste the complete posting (at least 150 characters).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setCvFileError(null);
    setCvFileText("");
    setCvFileName(file.name);
    setPreviewOpen(false);
    setExtracting(true);
    try {
      const text = await extractCvText(file);
      setCvFileText(text);
      setErrors((prev) => {
        const { cv: _omit, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      const msg =
        err instanceof CvExtractError
          ? err.message
          : "We couldn’t read this CV. Please try another file or paste the CV text manually.";
      setCvFileError(msg);
      setCvFileText("");
    } finally {
      setExtracting(false);
    }
  };

  const clearFile = () => {
    setCvFileName(null);
    setCvFileText("");
    setCvFileError(null);
    setPreviewOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        body: JSON.stringify({ jobTitle, companyName, cv: activeCv, jobDescription, language }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as Analysis;
      setAnalysisLang(language);
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
                  <div
                    role="tablist"
                    aria-label="CV input method"
                    className="inline-flex rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-1 mb-3"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cvMode === "paste"}
                      onClick={() => setCvMode("paste")}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                        cvMode === "paste"
                          ? "bg-white text-[color:var(--color-surface-foreground)] shadow-sm"
                          : "text-[color:var(--color-muted-foreground)]"
                      }`}
                    >
                      Paste CV Text
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={cvMode === "upload"}
                      onClick={() => setCvMode("upload")}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                        cvMode === "upload"
                          ? "bg-white text-[color:var(--color-surface-foreground)] shadow-sm"
                          : "text-[color:var(--color-muted-foreground)]"
                      }`}
                    >
                      Upload CV File
                    </button>
                  </div>

                  {cvMode === "paste" ? (
                    <textarea
                      id="cv"
                      value={cv}
                      onChange={(e) => setCv(e.target.value)}
                      rows={10}
                      placeholder="Paste the full plain text of your CV here — education, experience, projects, skills, languages."
                      className="input min-h-[200px] resize-y"
                      aria-invalid={!!errors.cv}
                    />
                  ) : (
                    <div>
                      {!cvFileName ? (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                          }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            handleFile(e.dataTransfer.files?.[0]);
                          }}
                          onClick={() => fileInputRef.current?.click()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              fileInputRef.current?.click();
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label="Upload CV file. Accepted formats: PDF, DOCX, TXT. Maximum 5 megabytes."
                          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
                            dragOver
                              ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/5"
                              : "border-[color:var(--color-border)] bg-white"
                          }`}
                        >
                          <svg className="h-8 w-8 text-[color:var(--color-muted-foreground)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <p className="text-sm font-medium text-[color:var(--color-surface-foreground)]">
                            Drag &amp; drop your CV here, or <span className="text-[color:var(--color-primary)] underline">browse</span>
                          </p>
                          <p className="text-xs text-[color:var(--color-muted-foreground)]">
                            Accepted formats: PDF, DOCX, TXT · Max 5 MB
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[color:var(--color-border)] bg-white p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              {extracting ? (
                                <Spinner />
                              ) : cvFileError ? (
                                <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-danger)]" aria-hidden />
                              ) : (
                                <span
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-success)]/15 text-[color:var(--color-success)] text-xs font-bold"
                                  aria-hidden
                                >
                                  ✓
                                </span>
                              )}
                              <span className="text-sm font-medium truncate text-[color:var(--color-surface-foreground)]">
                                {cvFileName}
                              </span>
                              <span className="sr-only" aria-live="polite">
                                {extracting
                                  ? "Reading your CV"
                                  : cvFileError
                                    ? cvFileError
                                    : `CV extracted successfully, ${cvFileText.length} characters.`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-xs font-medium text-[color:var(--color-primary)] hover:underline"
                                disabled={extracting}
                              >
                                Replace File
                              </button>
                              <button
                                type="button"
                                onClick={clearFile}
                                className="text-xs font-medium text-[color:var(--color-muted-foreground)] hover:underline"
                                disabled={extracting}
                              >
                                Remove File
                              </button>
                            </div>
                          </div>

                          {extracting && (
                            <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                              Reading your CV...
                            </p>
                          )}

                          {cvFileError && (
                            <p role="alert" className="mt-2 text-sm text-[color:var(--color-danger)]">
                              {cvFileError}
                            </p>
                          )}

                          {!extracting && !cvFileError && cvFileText && (
                            <details
                              className="mt-3 rounded-lg bg-[color:var(--color-muted)] p-3"
                              open={previewOpen}
                              onToggle={(e) => setPreviewOpen((e.target as HTMLDetailsElement).open)}
                            >
                              <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-surface-foreground)]">
                                Extracted CV Text ({cvFileText.length.toLocaleString()} chars)
                              </summary>
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-[color:var(--color-surface-foreground)]">
                                {cvFileText}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        className="sr-only"
                        aria-label="CV file"
                        onChange={(e) => {
                          handleFile(e.target.files?.[0]);
                        }}
                      />

                      <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                        Your file is used only to generate this analysis. Avoid uploading unnecessary sensitive personal information. Max file size {Math.round(MAX_CV_BYTES / 1024 / 1024)} MB.
                      </p>
                    </div>
                  )}
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
                    disabled={loading || extracting}
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
                    {verdictTone[analysis.verdict].icon} {verdictLabel[analysisLang][analysis.verdict]}
                  </span>
                  <p className="mt-3 text-base text-[color:var(--color-surface-foreground)]">
                    {analysis.verdictExplanation}
                  </p>
                  <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                    {t.estimatedMatchScore}
                  </p>
                </div>
                <ScoreRing score={analysis.matchScore} label={t.estimatedMatch} />
              </div>
            </div>

            <ResultCard title={t.strongMatches} accent="success" count={analysis.strongMatches.length}>
              {analysis.strongMatches.length === 0 ? (
                <Empty text={t.noStrong} />
              ) : (
                <ul className="space-y-4">
                  {analysis.strongMatches.map((m, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <p className="font-medium">{m.requirement}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.cvEvidence}: </span>
                        {m.cvEvidence}
                      </p>
                      <p className="mt-1 text-sm">{m.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title={t.partialMatches} accent="warning" count={(analysis.partialMatches ?? []).length}>
              {(analysis.partialMatches ?? []).length === 0 ? (
                <Empty text={t.noPartial} />
              ) : (
                <ul className="space-y-4">
                  {analysis.partialMatches.map((p, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <p className="font-medium">{p.requirement}</p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.cvEvidence}: </span>
                        {p.cvEvidence}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.remainingGap}: </span>
                        {p.remainingGap}
                      </p>
                      <p className="mt-1 text-sm">{p.explanation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title={t.learnableGaps} accent="info" count={analysis.learnableGaps.length}>
              {analysis.learnableGaps.length === 0 ? (
                <Empty text={t.noGaps} />
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

            <ResultCard title={t.possibleBlockers} accent="danger" count={analysis.possibleBlockers.length}>
              {analysis.possibleBlockers.length === 0 ? (
                <Empty text={t.noBlockers} />
              ) : (
                <ul className="space-y-4">
                  {analysis.possibleBlockers.map((b, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{b.requirement}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${severityTone[b.severity]}`}
                          aria-label={`${severityLabel[analysisLang][b.severity]} ${t.severitySuffix}`}
                        >
                          {severityLabel[analysisLang][b.severity]} {t.severitySuffix}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{b.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title={t.cvSuggestions} accent="primary" count={analysis.cvSuggestions.length}>
              {analysis.cvSuggestions.length === 0 ? (
                <Empty text={t.noSuggestions} />
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
                            {t.exampleRewrite}
                          </span>
                          {s.example}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title={t.recruiterMessage} accent="accent">
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
                  {copied ? t.copied : t.copyMessage}
                </button>
                <span aria-live="polite" className="text-xs text-[color:var(--color-muted-foreground)]">
                  {copied ? t.copiedAnnounce : ""}
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
                {t.analyseAnother}
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

function ScoreRing({ score, label }: { score: number; label: string }) {
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
      <span className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">{label}</span>
    </div>
  );
}
