import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { extractCvText, CvExtractError, MAX_CV_BYTES } from "@/lib/cv-extract";
import { SiteNav } from "@/components/SiteNav";
import { saveApplicationForCurrentUser } from "@/lib/cloud-applications";
import { buildMatchDecisionBrief } from "@/lib/match-decision-brief";
import { supabase } from "@/integrations/supabase/client";
import {
  loadSearchGoalsForCurrentUser,
} from "@/lib/cloud-search-goals";
import {
  DEFAULT_SEARCH_GOALS,
  type SearchGoals,
} from "@/lib/search-goals";
import {
  buildTargetRoleFit,
} from "@/lib/target-role-fit";
import { isLinkedInJobUrl } from "@/lib/job-url-import";
import {
  detectApplicationSourceFromUrl,
} from "@/lib/application-source";
import {
  buildAnalysisExportFilename,
  buildAnalysisExportText,
  buildAnalysisShareSummary,
  type AnalysisExportInput,
} from "@/lib/analysis-export";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobLens AI" },
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
  strongMatches: { requirement: string; jobEvidence: string; cvEvidence: string; explanation: string }[];
  partialMatches: { requirement: string; jobEvidence: string; cvEvidence: string; remainingGap: string; explanation: string }[];
  learnableGaps: { skill: string; jobEvidence: string; cvEvidence: string; importance: string; suggestion: string }[];
  possibleBlockers: { requirement: string; jobEvidence: string; cvEvidence: string; reason: string; severity: Severity }[];
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
    jobEvidence: "Job evidence",
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
    cvTailor: "CV Tailor",
    tailorIntro: "Turn the analysis into concrete CV edits for this application.",
    whatToImprove: "What to improve",
    whyItMatters: "Why it matters",
    suggestedRewrite: "Suggested rewrite",
    copyRewrite: "Copy rewrite",
    copiedRewrite: "✓ Copied",
  },
  Turkish: {
    strongMatches: "Güçlü Eşleşmeler",
    partialMatches: "Kısmi Eşleşmeler",
    learnableGaps: "Geliştirilebilir Eksikler",
    possibleBlockers: "Olası Engeller",
    cvSuggestions: "CV Geliştirme Önerileri",
    recruiterMessage: "İşe Alım Uzmanına Mesaj",
    jobEvidence: "İlan kanıtı",
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
    cvTailor: "CV Tailor",
    tailorIntro: "Analizi bu başvuruya özel somut CV düzenlemelerine dönüştür.",
    whatToImprove: "Neyi geliştirmelisin",
    whyItMatters: "Neden önemli",
    suggestedRewrite: "Önerilen düzenleme",
    copyRewrite: "Düzenlemeyi kopyala",
    copiedRewrite: "✓ Kopyalandı",
  },
} as const;


function Index() {
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobImportBusy, setJobImportBusy] = useState(false);
  const [jobImportError, setJobImportError] =
    useState<string | null>(null);
  const [jobImportSuccess, setJobImportSuccess] =
    useState<string | null>(null);
  const [cv, setCv] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [language, setLanguage] = useState<Lang>("English");
  const [analysisLang, setAnalysisLang] = useState<Lang>("English");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCvSuggestion, setCopiedCvSuggestion] = useState<number | null>(null);
  const [savedApplicationId, setSavedApplicationId] = useState<string | null>(null);
  const [analysisExportStatus, setAnalysisExportStatus] =
    useState<"shared" | "copied" | "downloaded" | null>(null);
  const [searchGoals, setSearchGoals] =
    useState<SearchGoals>({
      ...DEFAULT_SEARCH_GOALS,
    });

  useEffect(() => {
    let active = true;

    const hydrateGoals = async () => {
      try {
        const loaded =
          await loadSearchGoalsForCurrentUser();

        if (active) {
          setSearchGoals(loaded);
        }
      } catch (error) {
        console.error(
          "[JobLens Target Fit] Could not load search goals:",
          error,
        );
      }
    };

    void hydrateGoals();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT"
        ) {
          void hydrateGoals();
        }
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const decisionBrief = analysis
    ? buildMatchDecisionBrief(analysis, analysisLang)
    : null;

  const targetRoleFit =
    buildTargetRoleFit(
      jobTitle,
      searchGoals.targetRoles,
    );

  const targetRoleFitLabel =
    targetRoleFit.level === "strong"
      ? analysisLang === "Turkish"
        ? "Hedefinle Güçlü Uyum"
        : "Strong Direction Fit"
      : targetRoleFit.level === "adjacent"
        ? analysisLang === "Turkish"
          ? "Hedefine Yakın"
          : "Adjacent to Your Target"
        : targetRoleFit.level === "outside"
          ? analysisLang === "Turkish"
            ? "Ana Hedefinin Dışında"
            : "Outside Your Main Target"
          : analysisLang === "Turkish"
            ? "Henüz Hedef Belirlenmedi"
            : "No Career Target Yet";

  const targetRoleFitTone =
    targetRoleFit.level === "strong"
      ? "border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/10"
      : targetRoleFit.level === "adjacent"
        ? "border-[color:var(--color-warning)]/35 bg-[color:var(--color-warning)]/10"
        : targetRoleFit.level === "outside"
          ? "border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40"
          : "border-dashed border-[color:var(--color-border)]";

  const targetRoleFitDescription =
    targetRoleFit.level === "strong"
      ? analysisLang === "Turkish"
        ? "Bu rol, belirlediğin kariyer yönlerinden biriyle güçlü biçimde örtüşüyor."
        : "This role strongly aligns with one of the career directions you chose."
      : targetRoleFit.level === "adjacent"
        ? analysisLang === "Turkish"
          ? "Bu rol ana hedefinle birebir aynı değil, ancak yakın ve aktarılabilir bir kariyer yönü olabilir."
          : "This role is not an exact target, but it sits close to your chosen direction."
        : targetRoleFit.level === "outside"
          ? analysisLang === "Turkish"
            ? "Bu rol mevcut hedef rollerinden belirgin biçimde farklı. Bu kötü olduğu anlamına gelmez; sadece stratejik hedefinin dışında."
            : "This role differs from your current target roles. That does not make it a bad opportunity — it is simply outside your stated strategy."
          : analysisLang === "Turkish"
            ? "JobLens'ın ilanları kariyer yönünle karşılaştırabilmesi için hedef rollerini belirle."
            : "Set target roles so JobLens can compare opportunities with your intended career direction.";

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

  const importJobFromUrl = async () => {
    if (!jobUrl.trim()) {
      setJobImportError("Paste a public job URL first.");
      setJobImportSuccess(null);
      return;
    }

    if (isLinkedInJobUrl(jobUrl)) {
      setJobImportError(
        "LinkedIn job pages can’t be imported automatically. Copy the job description from LinkedIn and paste it below. You can still keep the LinkedIn URL with your application.",
      );
      setJobImportSuccess(null);
      return;
    }

    setJobImportBusy(true);
    setJobImportError(null);
    setJobImportSuccess(null);

    try {
      const response = await fetch("/api/job-import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          url: jobUrl.trim(),
        }),
      });

      const data = (await response.json()) as {
        url?: string;
        jobTitle?: string;
        companyName?: string;
        jobDescription?: string;
        extractionMethod?: "structured_data" | "page_text";
        message?: string;
      };

      if (!response.ok || !data.jobDescription) {
        throw new Error(
          data.message ??
            "JobLens could not import this job page.",
        );
      }

      setJobUrl(data.url ?? jobUrl.trim());
      setJobDescription(data.jobDescription);

      if (data.jobTitle?.trim()) {
        setJobTitle(data.jobTitle.trim());
      }

      if (data.companyName?.trim()) {
        setCompanyName(data.companyName.trim());
      }

      setErrors((previous) => {
        const {
          jobTitle: _jobTitle,
          jobDescription: _jobDescription,
          ...rest
        } = previous;

        return rest;
      });

      setJobImportSuccess(
        data.extractionMethod === "structured_data"
          ? "Job details imported. Review them before analysing."
          : "Readable page text imported. Review it before analysing.",
      );
    } catch (error) {
      setJobImportError(
        error instanceof Error
          ? error.message
          : "JobLens could not import this page. Paste the description manually instead.",
      );
    } finally {
      setJobImportBusy(false);
    }
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
    setSavedApplicationId(null);
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

  const saveToApplications = async () => {
    if (!analysis || savedApplicationId) return;

    try {
      const saved = await saveApplicationForCurrentUser({
        jobTitle: jobTitle.trim(),
        companyName: companyName.trim(),
        jobUrl: jobUrl.trim() || undefined,
        applicationSource:
          detectApplicationSourceFromUrl(jobUrl),
        jobDescription: jobDescription.trim() || undefined,
        status: "Saved",
        matchScore: analysis.matchScore,
        verdict: analysis.verdict,
      });

      setSavedApplicationId(saved.id);
    } catch (error) {
      console.error("[JobLens] Could not save analysis to applications:", error);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setSubmitError(null);
    setSavedApplicationId(null);
    setAnalysisExportStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyCvSuggestion = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCvSuggestion(index);
      setTimeout(() => setCopiedCvSuggestion(null), 1800);
    } catch {
      /* ignore */
    }
  };

  const getAnalysisExportInput = (): AnalysisExportInput | null => {
    if (!analysis) return null;

    return {
      jobTitle: jobTitle.trim(),
      companyName: companyName.trim(),
      jobUrl: jobUrl.trim() || undefined,
      language: analysisLang,
      analysis,
      decisionBrief,
      careerDirection: {
        label: targetRoleFitLabel,
        score: targetRoleFit.score,
      },
    };
  };

  const showAnalysisExportStatus = (
    status: "shared" | "copied" | "downloaded",
  ) => {
    setAnalysisExportStatus(status);
    window.setTimeout(() => setAnalysisExportStatus(null), 2200);
  };

  const copyAnalysisSummary = async () => {
    const input = getAnalysisExportInput();
    if (!input) return;

    try {
      await navigator.clipboard.writeText(
        buildAnalysisShareSummary(input),
      );
      showAnalysisExportStatus("copied");
    } catch {
      console.error("[JobLens] Could not copy analysis summary.");
    }
  };

  const shareAnalysisSummary = async () => {
    const input = getAnalysisExportInput();
    if (!input) return;

    const text = buildAnalysisShareSummary(input);

    if (typeof navigator.share !== "function") {
      await copyAnalysisSummary();
      return;
    }

    try {
      await navigator.share({
        title: `${input.jobTitle} — JobLens AI`,
        text,
      });

      showAnalysisExportStatus("shared");
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      console.error("[JobLens] Could not share analysis.", error);
    }
  };

  const downloadAnalysisReport = () => {
    const input = getAnalysisExportInput();
    if (!input) return;

    const blob = new Blob(
      [buildAnalysisExportText(input)],
      { type: "text/plain;charset=utf-8" },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = buildAnalysisExportFilename(input);

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    showAnalysisExportStatus("downloaded");
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
      <SiteNav />

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
            JobLens AI is an AI-powered job application analysis and tracking tool for students and recent graduates.
            It compares your CV with a job description, helps you track applications, and surfaces clear next steps throughout your job search.
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
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/35 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="jobUrl"
                        className="mb-1.5 block text-sm font-medium"
                      >
                        Job URL
                        <span className="ml-1 text-xs font-normal text-[color:var(--color-muted-foreground)]">
                          (optional)
                        </span>
                      </label>

                      <input
                        id="jobUrl"
                        type="url"
                        value={jobUrl}
                        onChange={(event) => {
                          setJobUrl(event.target.value);
                          setJobImportError(null);
                          setJobImportSuccess(null);
                        }}
                        placeholder="https://careers.company.com/jobs/..."
                        className="input"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={importJobFromUrl}
                      disabled={jobImportBusy || !jobUrl.trim()}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-primary)]/25 bg-[color:var(--color-primary)]/10 px-4 py-2.5 text-sm font-semibold text-[color:var(--color-primary)] transition hover:bg-[color:var(--color-primary)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {jobImportBusy ? "Importing..." : "Import Job"}
                    </button>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
                    Works with many public job pages. Pages requiring login or blocking automated access may still need a manual paste.
                  </p>

                  {jobImportSuccess && (
                    <p className="mt-2 text-xs font-medium text-[color:var(--color-success)]">
                      ✓ {jobImportSuccess}
                    </p>
                  )}

                  {jobImportError && (
                    <p
                      role="alert"
                      className="mt-2 text-xs font-medium text-[color:var(--color-danger)]"
                    >
                      {jobImportError}
                    </p>
                  )}
                </div>

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

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[color:var(--color-border)] pt-5">
                <button
                  type="button"
                  onClick={saveToApplications}
                  disabled={!!savedApplicationId}
                  className={`inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${
                    savedApplicationId
                      ? "bg-[color:var(--color-success)] cursor-default"
                      : "hover:opacity-90"
                  }`}
                  style={savedApplicationId ? undefined : { background: "var(--gradient-hero)" }}
                >
                  {savedApplicationId
                    ? analysisLang === "Turkish"
                      ? "✓ Başvurulara Kaydedildi"
                      : "✓ Saved to Applications"
                    : analysisLang === "Turkish"
                      ? "Başvurulara Kaydet"
                      : "Save to Applications"}
                </button>

                {savedApplicationId && (
                  <Link
                    to="/applications"
                    className="inline-flex items-center rounded-xl border border-[color:var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)]"
                  >
                    {analysisLang === "Turkish" ? "Başvuruları Gör →" : "View Applications →"}
                  </Link>
                )}
              </div>
            </div>

            <div className="card-surface p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                    {analysisLang === "Turkish"
                      ? "Paylaş & Dışa Aktar"
                      : "Share & Export"}
                  </p>

                  <h2 className="mt-1 text-lg font-semibold">
                    {analysisLang === "Turkish"
                      ? "Analizini yanında götür"
                      : "Take your analysis with you"}
                  </h2>

                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                    {analysisLang === "Turkish"
                      ? "Kısa özeti paylaşabilir veya ayrıntılı analiz raporunu cihazına indirebilirsin."
                      : "Share a concise summary or download your detailed analysis report."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <button
                    type="button"
                    onClick={shareAnalysisSummary}
                    className="inline-flex items-center justify-center rounded-xl border border-[color:var(--color-primary)]/25 bg-[color:var(--color-primary)]/10 px-4 py-2.5 text-sm font-semibold text-[color:var(--color-primary)] transition hover:bg-[color:var(--color-primary)]/15"
                  >
                    {analysisLang === "Turkish"
                      ? "Özeti Paylaş"
                      : "Share Summary"}
                  </button>

                  <button
                    type="button"
                    onClick={copyAnalysisSummary}
                    className="inline-flex items-center justify-center rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                  >
                    {analysisLang === "Turkish"
                      ? "Özeti Kopyala"
                      : "Copy Summary"}
                  </button>

                  <button
                    type="button"
                    onClick={downloadAnalysisReport}
                    className="inline-flex items-center justify-center rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                  >
                    {analysisLang === "Turkish"
                      ? "Raporu İndir"
                      : "Download Report"}
                  </button>
                </div>
              </div>

              <div
                aria-live="polite"
                className="mt-3 min-h-4 text-xs font-medium text-[color:var(--color-success)]"
              >
                {analysisExportStatus === "shared"
                  ? analysisLang === "Turkish"
                    ? "✓ Paylaşım ekranı açıldı."
                    : "✓ Share sheet opened."
                  : analysisExportStatus === "copied"
                    ? analysisLang === "Turkish"
                      ? "✓ Özet panoya kopyalandı."
                      : "✓ Summary copied."
                    : analysisExportStatus === "downloaded"
                      ? analysisLang === "Turkish"
                        ? "✓ Rapor indirildi."
                        : "✓ Report downloaded."
                      : ""}
              </div>
            </div>

            <div
              className={`rounded-2xl border p-6 md:p-7 ${targetRoleFitTone}`}
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                    {analysisLang === "Turkish"
                      ? "Kariyer Yönü Uyumu"
                      : "Career Direction Fit"}
                  </p>

                  <h2 className="mt-1 text-lg font-semibold">
                    {targetRoleFitLabel}
                  </h2>

                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
                    {targetRoleFitDescription}
                  </p>

                  {targetRoleFit.matchedTargetRole &&
                    targetRoleFit.level !== "not_set" && (
                      <p className="mt-3 text-xs text-white/60">
                        {analysisLang === "Turkish"
                          ? "En yakın hedef rol:"
                          : "Closest target role:"}{" "}
                        <span className="font-semibold text-white/90">
                          {targetRoleFit.matchedTargetRole}
                        </span>
                      </p>
                    )}
                </div>

                {targetRoleFit.score !== null ? (
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-3xl font-semibold">
                      {targetRoleFit.score}%
                    </p>

                    <p className="mt-1 text-xs text-white/55">
                      {analysisLang === "Turkish"
                        ? "hedef rol benzerliği"
                        : "target-role similarity"}
                    </p>
                  </div>
                ) : (
                  <Link
                    to="/goals"
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                  >
                    {analysisLang === "Turkish"
                      ? "Hedeflerini Belirle →"
                      : "Set Your Goals →"}
                  </Link>
                )}
              </div>

              <div className="mt-4 border-t border-white/15 pt-3">
                <p className="text-[11px] leading-relaxed text-white/50">
                  {analysisLang === "Turkish"
                    ? "Bu skor AI Match skorundan ayrıdır. Yalnızca ilan başlığını, My Goals bölümünde belirlediğin hedef rollerle karşılaştırır."
                    : "This is separate from your AI Match score. It only compares the job title with the target roles defined in My Goals."}
                </p>
              </div>
            </div>

            {decisionBrief && (
              <div className="card-surface p-6 md:p-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                    {analysisLang === "Turkish"
                      ? "Karar Özeti"
                      : "Decision Brief"}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {analysisLang === "Turkish"
                      ? "Bu başvuruda neye odaklanmalısın?"
                      : "What matters most for this application?"}
                  </h2>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 p-4">
                    <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                      {analysisLang === "Turkish"
                        ? "Kanıt gücü"
                        : "Evidence strength"}
                    </p>
                    <p className="mt-1 text-base font-semibold">
                      {decisionBrief.evidenceStrengthLabel}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 p-4 md:col-span-2">
                    <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                      {analysisLang === "Turkish"
                        ? "Ana risk"
                        : "Main risk"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">
                      {decisionBrief.mainRisk}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5 p-4">
                  <p className="text-xs font-medium text-[color:var(--color-primary)]">
                    {analysisLang === "Turkish"
                      ? "En iyi sonraki adım"
                      : "Best next move"}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-relaxed">
                    {decisionBrief.bestNextMove}
                  </p>
                </div>

                <div className="mt-3 rounded-xl border border-[color:var(--color-border)] p-4">
                  <p className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                    {analysisLang === "Turkish"
                      ? "İşe alım perspektifi"
                      : "Recruiter perspective"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--color-surface-foreground)]">
                    {decisionBrief.recruiterPerspective}
                  </p>
                </div>
              </div>
            )}

            <ResultCard title={t.strongMatches} accent="success" count={analysis.strongMatches.length}>
              {analysis.strongMatches.length === 0 ? (
                <Empty text={t.noStrong} />
              ) : (
                <ul className="space-y-4">
                  {analysis.strongMatches.map((m, i) => (
                    <li key={i} className="rounded-lg border border-[color:var(--color-border)] p-4">
                      <p className="font-medium">{m.requirement}</p>
                      <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.jobEvidence}: </span>
                        {m.jobEvidence}
                      </p>
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
                      <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.jobEvidence}: </span>
                        {p.jobEvidence}
                      </p>
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
                      <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.jobEvidence}: </span>
                        {g.jobEvidence}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.cvEvidence}: </span>
                        {g.cvEvidence}
                      </p>
                      <p className="mt-2 text-sm">{g.suggestion}</p>
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
                      <p className="mt-2 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.jobEvidence}: </span>
                        {b.jobEvidence}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        <span className="font-semibold text-[color:var(--color-surface-foreground)]">{t.cvEvidence}: </span>
                        {b.cvEvidence}
                      </p>
                      <p className="mt-2 text-sm">{b.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ResultCard>

            <ResultCard title={t.cvTailor} accent="primary" count={analysis.cvSuggestions.length}>
              <p className="mb-5 text-sm text-[color:var(--color-muted-foreground)]">
                {t.tailorIntro}
              </p>

              {analysis.cvSuggestions.length === 0 ? (
                <Empty text={t.noSuggestions} />
              ) : (
                <ul className="space-y-4">
                  {analysis.cvSuggestions.map((s, i) => (
                    <li
                      key={i}
                      className="rounded-xl border border-[color:var(--color-border)] p-4 md:p-5"
                    >
                      <div className="inline-flex rounded-full bg-[color:var(--color-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--color-primary)]">
                        {s.section}
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                          {t.whatToImprove}
                        </p>
                        <p className="mt-1 font-medium leading-relaxed">
                          {s.suggestion}
                        </p>
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                          {t.whyItMatters}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                          {s.reason}
                        </p>
                      </div>

                      {s.example && (
                        <div className="mt-4 rounded-xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-primary)]">
                              {t.suggestedRewrite}
                            </p>

                            <button
                              type="button"
                              onClick={() => copyCvSuggestion(i, s.example)}
                              className="shrink-0 rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--color-surface-foreground)] transition hover:bg-[color:var(--color-muted)]"
                            >
                              {copiedCvSuggestion === i
                                ? t.copiedRewrite
                                : t.copyRewrite}
                            </button>
                          </div>

                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                            {s.example}
                          </p>

                          <span className="sr-only" aria-live="polite">
                            {copiedCvSuggestion === i
                              ? t.copiedRewrite
                              : ""}
                          </span>
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
        <p>JobLens AI · Estimates only — not an official ATS assessment or hiring decision.</p>
        <div className="mt-3 flex justify-center gap-4">
          <Link to="/privacy" className="underline underline-offset-4 hover:text-white/70">
            Privacy Policy
          </Link>
          <Link to="/terms" className="underline underline-offset-4 hover:text-white/70">
            Terms of Service
          </Link>
        </div>
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
