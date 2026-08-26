import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Briefcase,
  X,
  Sparkles,
  Bell,
  History,
  Mail,
  Download,
  Upload,
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
import { createReminderForCurrentUser } from "@/lib/cloud-reminders";
import {
  loadApplicationEvents,
  recordApplicationEvent,
  type ApplicationEvent,
} from "@/lib/application-events";
import { deleteRemindersForApplication } from "@/lib/reminders";
import {
  getNextBestAction,
  rankApplicationsByNextBestAction,
} from "@/lib/next-best-action";
import {
  getFollowUpGuidance,
  getReminderAssistantGuidance,
} from "@/lib/follow-up-intelligence";
import {
  parsePastedRecruitmentEmail,
  findMatchingApplicationFromEmail,
  type ParsedRecruitmentEmail,
} from "@/lib/email-status-import";
import {
  applicationImportFingerprint,
  applicationsToCsv,
  parseApplicationsCsv,
  type ApplicationCsvParseResult,
} from "@/lib/applications-csv";
import {
  APPLICATION_SOURCES,
  detectApplicationSourceFromUrl,
  type ApplicationSource,
} from "@/lib/application-source";

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
  Assessment: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
  Interview: "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]",
  Case: "bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]",
  Offer: "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]",
  Rejected: "bg-[color:var(--color-danger)]/15 text-[color:var(--color-danger)]",
};

type LifecycleStageState =
  | "complete"
  | "current"
  | "pending";

type LifecycleStage = {
  id: string;
  label: string;
  status?: ApplicationStatus;
  state: LifecycleStageState;
  occurredAt?: string;
};

function buildApplicationLifecycle(
  application: Application,
  events: ApplicationEvent[],
): LifecycleStage[] {
  const occurredAtByStatus =
    new Map<ApplicationStatus, string>();

  const reached =
    new Set<ApplicationStatus>(["Saved"]);

  for (const event of events) {
    if (
      event.eventType === "created" &&
      !occurredAtByStatus.has("Saved")
    ) {
      occurredAtByStatus.set(
        "Saved",
        event.occurredAt,
      );
    }

    if (event.fromStatus) {
      reached.add(event.fromStatus);
    }

    if (event.toStatus) {
      reached.add(event.toStatus);

      if (
        !occurredAtByStatus.has(event.toStatus)
      ) {
        occurredAtByStatus.set(
          event.toStatus,
          event.occurredAt,
        );
      }
    }
  }

  if (!occurredAtByStatus.has("Saved")) {
    occurredAtByStatus.set(
      "Saved",
      application.createdAt,
    );
  }

  if (
    application.appliedAt &&
    !occurredAtByStatus.has("Applied")
  ) {
    occurredAtByStatus.set(
      "Applied",
      application.appliedAt,
    );
    reached.add("Applied");
  }

  const linearProgression: ApplicationStatus[] = [
    "Saved",
    "Applied",
    "Assessment",
    "Interview",
    "Case",
    "Offer",
  ];

  const currentIndex =
    linearProgression.indexOf(application.status);

  if (currentIndex >= 0) {
    linearProgression
      .slice(0, currentIndex + 1)
      .forEach((status) => reached.add(status));
  } else if (application.status === "Rejected") {
    reached.add("Rejected");
  }

  const journeyStatuses: ApplicationStatus[] = [
    "Saved",
    "Applied",
    "Assessment",
    "Interview",
    "Case",
  ];

  const stages: LifecycleStage[] =
    journeyStatuses.map((status) => ({
      id: status,
      label: status,
      status,
      state:
        application.status === status
          ? "current"
          : reached.has(status)
            ? "complete"
            : "pending",
      occurredAt:
        occurredAtByStatus.get(status),
    }));

  const decisionStatus =
    application.status === "Offer" ||
    application.status === "Rejected"
      ? application.status
      : undefined;

  stages.push({
    id: "decision",
    label: decisionStatus ?? "Decision",
    status: decisionStatus,
    state: decisionStatus
      ? "current"
      : "pending",
    occurredAt: decisionStatus
      ? occurredAtByStatus.get(decisionStatus)
      : undefined,
  });

  return stages;
}

type InterviewPrepResult = {
  introStrategy: string;
  likelyQuestions: {
    question: string;
    whyItMayBeAsked: string;
    answerDirection: string;
  }[];
  starPrompts: {
    competency: string;
    prompt: string;
  }[];
  riskAreas: {
    area: string;
    preparation: string;
  }[];
  questionsToAsk: string[];
};

type FormState = {
  jobTitle: string;
  companyName: string;
  jobUrl: string;
  applicationSource: ApplicationSource | "";
  status: ApplicationStatus;
  appliedAt: string;
  notes: string;
};

const emptyForm: FormState = {
  jobTitle: "",
  companyName: "",
  jobUrl: "",
  applicationSource: "",
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

  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportPreview, setCsvImportPreview] =
    useState<ApplicationCsvParseResult | null>(null);
  const [csvImportFileName, setCsvImportFileName] =
    useState<string | null>(null);
  const [csvImportError, setCsvImportError] =
    useState<string | null>(null);
  const [csvImportSuccess, setCsvImportSuccess] =
    useState<string | null>(null);
  const [csvImportBusy, setCsvImportBusy] =
    useState(false);
  const csvFileInputRef =
    useRef<HTMLInputElement>(null);

  const [emailImportOpen, setEmailImportOpen] = useState(false);
  const [emailImportText, setEmailImportText] = useState("");
  const [emailImportPreview, setEmailImportPreview] =
    useState<ParsedRecruitmentEmail | null>(null);
  const [emailImportError, setEmailImportError] =
    useState<string | null>(null);
  const [emailImportBusy, setEmailImportBusy] =
    useState(false);
  const [emailImportSuccess, setEmailImportSuccess] =
    useState<string | null>(null);
  const [emailImportStatusEdited, setEmailImportStatusEdited] =
    useState(false);

  const [interviewPrepApp, setInterviewPrepApp] = useState<Application | null>(null);
  const [interviewPrepResult, setInterviewPrepResult] =
    useState<InterviewPrepResult | null>(null);
  const [interviewPrepBusy, setInterviewPrepBusy] = useState(false);
  const [interviewPrepError, setInterviewPrepError] =
    useState<string | null>(null);
  const [interviewPrepEvidence, setInterviewPrepEvidence] =
    useState("");

  const [reminderApp, setReminderApp] = useState<Application | null>(null);
  const [reminderTitle, setReminderTitle] = useState("Follow up");
  const [reminderDueAt, setReminderDueAt] = useState("");
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [followUpCopied, setFollowUpCopied] = useState(false);

  const [timelineApp, setTimelineApp] =
    useState<Application | null>(null);
  const [timelineEvents, setTimelineEvents] =
    useState<ApplicationEvent[]>([]);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineError, setTimelineError] =
    useState<string | null>(null);

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

  const emailImportMatch = useMemo(
    () =>
      emailImportPreview
        ? findMatchingApplicationFromEmail(
            emailImportPreview,
            apps,
          )
        : null,
    [emailImportPreview, apps],
  );

  const timelineLifecycle = useMemo(
    () =>
      timelineApp
        ? buildApplicationLifecycle(
            timelineApp,
            timelineEvents,
          )
        : [],
    [timelineApp, timelineEvents],
  );

  const csvImportCandidates = useMemo(() => {
    if (!csvImportPreview) {
      return {
        importable: [],
        duplicateRows: [] as number[],
      };
    }

    const fingerprints = new Set(
      apps.map((application) =>
        applicationImportFingerprint(application),
      ),
    );

    const importable =
      [] as typeof csvImportPreview.rows;
    const duplicateRows: number[] = [];

    for (const row of csvImportPreview.rows) {
      const fingerprint =
        applicationImportFingerprint(row.input);

      if (fingerprints.has(fingerprint)) {
        duplicateRows.push(row.rowNumber);
        continue;
      }

      fingerprints.add(fingerprint);
      importable.push(row);
    }

    return {
      importable,
      duplicateRows,
    };
  }, [apps, csvImportPreview]);

  const stats = useMemo(() => summarise(apps), [apps]);

  const attentionApps = useMemo(
    () =>
      rankApplicationsByNextBestAction(apps).filter(
        (app) => getNextBestAction(app).priority === "high",
      ),
    [apps],
  );

  const topActionApp = attentionApps[0] ?? null;
  const topAction = topActionApp
    ? getNextBestAction(topActionApp)
    : null;

  const reminderAssistantGuidance =
    reminderApp
      ? getReminderAssistantGuidance(reminderApp)
      : null;

  const timelineFollowUpGuidance =
    timelineApp?.status === "Applied"
      ? getFollowUpGuidance(timelineApp)
      : null;

  const exportApplicationsCsv = () => {
    const csv = applicationsToCsv(apps);

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const date = new Date()
      .toISOString()
      .slice(0, 10);

    link.href = url;
    link.download = `joblens-applications-${date}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const resetCsvImport = () => {
    setCsvImportPreview(null);
    setCsvImportFileName(null);
    setCsvImportError(null);
    setCsvImportSuccess(null);

    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = "";
    }
  };

  const handleCsvImportFile = async (
    file: File | null | undefined,
  ) => {
    if (!file) return;

    setCsvImportError(null);
    setCsvImportSuccess(null);
    setCsvImportPreview(null);
    setCsvImportFileName(file.name);

    if (file.size > 2_000_000) {
      setCsvImportError(
        "CSV files must be smaller than 2 MB.",
      );
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseApplicationsCsv(text);

      setCsvImportPreview(parsed);
    } catch (error) {
      setCsvImportError(
        error instanceof Error
          ? error.message
          : "JobLens couldn’t read this CSV file.",
      );
    }
  };

  const confirmCsvImport = async () => {
    if (!csvImportPreview) return;

    if (csvImportCandidates.importable.length === 0) {
      setCsvImportError(
        "There are no new valid applications to import.",
      );
      return;
    }

    setCsvImportBusy(true);
    setCsvImportError(null);
    setCsvImportSuccess(null);

    let importedCount = 0;
    let failedCount = 0;
    const cloudCreated: Application[] = [];

    for (const row of csvImportCandidates.importable) {
      try {
        if (cloudMode) {
          const created =
            await createCloudApplication(row.input);

          cloudCreated.push(created);
          importedCount += 1;

          try {
            await recordApplicationEvent({
              applicationId: created.id,
              eventType: "created",
              source: "manual",
              toStatus: created.status,
              occurredAt: created.createdAt,
            });
          } catch (eventError) {
            console.error(
              "[JobLens CSV Import] Timeline creation failed:",
              eventError,
            );
          }
        } else {
          createApplication(row.input);
          importedCount += 1;
        }
      } catch (error) {
        failedCount += 1;

        console.error(
          `[JobLens CSV Import] Row ${row.rowNumber} failed:`,
          error,
        );
      }
    }

    if (cloudMode && cloudCreated.length > 0) {
      setApps((current) => [
        ...cloudCreated,
        ...current,
      ]);
    } else if (!cloudMode && importedCount > 0) {
      setApps(loadApplications());
    }

    if (importedCount > 0) {
      setCsvImportSuccess(
        `${importedCount} application${
          importedCount === 1 ? "" : "s"
        } imported successfully.${
          failedCount > 0
            ? ` ${failedCount} row${
                failedCount === 1 ? "" : "s"
              } could not be saved.`
            : ""
        }`,
      );
    } else {
      setCsvImportError(
        "JobLens couldn’t import these applications. Nothing was changed.",
      );
    }

    setCsvImportBusy(false);
  };

  const previewEmailImport = () => {
    setEmailImportError(null);
    setEmailImportSuccess(null);
    setEmailImportPreview(null);
    setEmailImportStatusEdited(false);

    const parsed = parsePastedRecruitmentEmail(
      emailImportText,
    );

    if (!parsed) {
      setEmailImportError(
        "JobLens couldn’t confidently detect an application status from this email.",
      );
      return;
    }

    setEmailImportPreview(parsed);
  };

  const resetEmailImport = () => {
    setEmailImportText("");
    setEmailImportPreview(null);
    setEmailImportError(null);
    setEmailImportSuccess(null);
    setEmailImportStatusEdited(false);
  };

  const confirmEmailImport = async () => {
    if (!emailImportPreview) return;

    setEmailImportBusy(true);
    setEmailImportError(null);
    setEmailImportSuccess(null);

    try {
      if (emailImportMatch) {
        const application =
          emailImportMatch.application;

        const statusOrder: Record<
          ApplicationStatus,
          number
        > = {
          Saved: 0,
          Applied: 1,
          Assessment: 2,
          Interview: 3,
          Case: 4,
          Offer: 5,
          Rejected: 6,
        };

        if (
          !emailImportStatusEdited &&
          emailImportPreview.status !==
            "Rejected" &&
          statusOrder[application.status] >
            statusOrder[
              emailImportPreview.status
            ]
        ) {
          setEmailImportError(
            `This application is already further along (${application.status}). JobLens won’t move it backwards to ${emailImportPreview.status}.`,
          );
          return;
        }

        const patch = {
          jobTitle:
            emailImportPreview.jobTitleSuggestion.trim(),
          companyName:
            emailImportPreview.companySuggestion.trim(),
          status: emailImportPreview.status,
          appliedAt:
            emailImportPreview.applicationDateIso ||
            application.appliedAt ||
            undefined,
        };

        if (cloudMode) {
          const updated =
            await updateCloudApplication(
              application.id,
              patch,
            );

          setApps((current) =>
            current.map((app) =>
              app.id === application.id
                ? updated
                : app,
            ),
          );

          if (
            application.status !== updated.status
          ) {
            try {
              await recordApplicationEvent({
                applicationId: application.id,
                eventType: "status_change",
                source: "manual",
                fromStatus: application.status,
                toStatus: updated.status,
              });
            } catch (eventError) {
              console.error(
                "[JobLens Email Import] Timeline event failed:",
                eventError,
              );
            }
          }
        } else {
          setApps(
            updateApplication(
              application.id,
              patch,
            ),
          );
        }

        setEmailImportSuccess(
          `Updated ${emailImportPreview.companySuggestion} — ${emailImportPreview.status}.`,
        );
      } else {
        if (
          !emailImportPreview.companySuggestion ||
          !emailImportPreview.jobTitleSuggestion
        ) {
          setEmailImportError(
            "JobLens needs both a company and position before it can create an application.",
          );
          return;
        }

        const payload = {
          jobTitle:
            emailImportPreview.jobTitleSuggestion,
          companyName:
            emailImportPreview.companySuggestion,
          status: emailImportPreview.status,
          appliedAt:
            emailImportPreview.applicationDateIso ||
            undefined,
        };

        if (cloudMode) {
          const created =
            await createCloudApplication(payload);

          setApps((current) => [
            created,
            ...current,
          ]);

          try {
            await recordApplicationEvent({
              applicationId: created.id,
              eventType: "created",
              source: "manual",
              toStatus: created.status,
              occurredAt: created.createdAt,
            });
          } catch (eventError) {
            console.error(
              "[JobLens Email Import] Timeline creation failed:",
              eventError,
            );
          }
        } else {
          createApplication(payload);
          setApps(loadApplications());
        }

        setEmailImportSuccess(
          `Added ${emailImportPreview.jobTitleSuggestion} at ${emailImportPreview.companySuggestion}.`,
        );
      }
    } catch (error) {
      console.error(
        "[JobLens Email Import] Import failed:",
        error,
      );

      setEmailImportError(
        "JobLens couldn’t save this application. Nothing else was changed.",
      );
    } finally {
      setEmailImportBusy(false);
    }
  };

  const generateInterviewPrep = async () => {
    if (!interviewPrepApp) return;

    setInterviewPrepBusy(true);
    setInterviewPrepError(null);
    setInterviewPrepResult(null);

    try {
      const prepContext = [
        interviewPrepApp.notes?.trim()
          ? `APPLICATION NOTES:\n${interviewPrepApp.notes.trim()}`
          : "",
        typeof interviewPrepApp.matchScore === "number"
          ? `JOBLENS MATCH SCORE: ${interviewPrepApp.matchScore}%`
          : "",
        interviewPrepApp.verdict?.trim()
          ? `JOBLENS ANALYSIS VERDICT:\n${interviewPrepApp.verdict.trim()}`
          : "",
        interviewPrepEvidence.trim()
          ? `CANDIDATE EVIDENCE EXPLICITLY PROVIDED FOR THIS PREP SESSION:\n${interviewPrepEvidence.trim()}\nUse only these candidate facts. Do not invent or expand beyond them.`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await fetch("/api/interview-prep", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jobTitle: interviewPrepApp.jobTitle,
          companyName: interviewPrepApp.companyName,
          jobDescription: interviewPrepApp.jobDescription ?? "",
          notes: prepContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Interview prep failed: ${response.status}`);
      }

      const data = (await response.json()) as InterviewPrepResult;
      setInterviewPrepResult(data);
    } catch (error) {
      console.error("[JobLens Interview Prep] Generation failed:", error);
      setInterviewPrepError(
        "JobLens couldn’t generate your interview prep. Please try again.",
      );
    } finally {
      setInterviewPrepBusy(false);
    }
  };

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
      applicationSource: a.applicationSource ?? "",
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
      applicationSource:
        form.applicationSource ||
        detectApplicationSourceFromUrl(form.jobUrl),
      status: form.status,
      appliedAt: form.appliedAt || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (editingId) {
        const previous = apps.find((app) => app.id === editingId);

        if (cloudMode) {
          const updated = await updateCloudApplication(editingId, payload);

          setApps((current) =>
            current.map((app) =>
              app.id === editingId ? updated : app,
            ),
          );

          if (
            previous &&
            previous.status !== updated.status
          ) {
            try {
              await recordApplicationEvent({
                applicationId: editingId,
                eventType: "status_change",
                source: "manual",
                fromStatus: previous.status,
                toStatus: updated.status,
              });
            } catch (eventError) {
              console.error(
                "[JobLens Timeline] Could not record manual status change:",
                eventError,
              );
              setSyncError(
                "Application updated, but its timeline history could not be saved.",
              );
            }
          }
        } else {
          setApps(updateApplication(editingId, payload));
        }
      } else if (cloudMode) {
        const created = await createCloudApplication(payload);

        setApps((current) => [created, ...current]);

        try {
          await recordApplicationEvent({
            applicationId: created.id,
            eventType: "created",
            source: "manual",
            toStatus: created.status,
            occurredAt: created.createdAt,
          });
        } catch (eventError) {
          console.error(
            "[JobLens Timeline] Could not record application creation:",
            eventError,
          );
          setSyncError(
            "Application saved, but its timeline history could not be created.",
          );
        }
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
      const previous = apps.find((app) => app.id === id);

      if (cloudMode) {
        const updated = await updateCloudApplication(id, { status });

        setApps((current) =>
          current.map((app) =>
            app.id === id ? updated : app,
          ),
        );

        if (
          previous &&
          previous.status !== updated.status
        ) {
          try {
            await recordApplicationEvent({
              applicationId: id,
              eventType: "status_change",
              source: "manual",
              fromStatus: previous.status,
              toStatus: updated.status,
            });
          } catch (eventError) {
            console.error(
              "[JobLens Timeline] Could not record manual status change:",
              eventError,
            );
            setSyncError(
              "Status updated, but its timeline history could not be saved.",
            );
          }
        }
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
        deleteRemindersForApplication(a.id);
        setApps(deleteApplication(a.id));
      }
    } catch (error) {
      console.error("[JobLens] Application delete failed:", error);
      setSyncError("We couldn’t delete this application. Please try again.");
    }
  };

  const openTimeline = async (app: Application) => {
    setTimelineApp(app);
    setTimelineEvents([]);
    setTimelineError(null);

    if (!cloudMode) {
      setTimelineError(
        "Sign in to keep application history synced across devices.",
      );
      return;
    }

    setTimelineBusy(true);

    try {
      const events = await loadApplicationEvents(app.id);
      setTimelineEvents(events);
    } catch (error) {
      console.error(
        "[JobLens Timeline] Could not load application history:",
        error,
      );
      setTimelineError(
        "We couldn’t load this application’s timeline.",
      );
    } finally {
      setTimelineBusy(false);
    }
  };

  const openReminder = (app: Application) => {
    setReminderApp(app);

    const assistantGuidance =
      getReminderAssistantGuidance(app);

    const suggestedTitle =
      assistantGuidance?.actionTitle ??
      (app.status === "Assessment"
        ? "Assessment deadline"
        : "Follow up");

    setReminderTitle(suggestedTitle);
    setReminderDueAt(
      assistantGuidance?.suggestedReminderDate ?? "",
    );
    setReminderError(null);
    setFollowUpCopied(false);
  };

  const copyReminderAssistantMessage = async () => {
    if (!reminderAssistantGuidance) return;

    try {
      await navigator.clipboard.writeText(
        reminderAssistantGuidance.message,
      );
      setFollowUpCopied(true);

      window.setTimeout(() => {
        setFollowUpCopied(false);
      }, 1800);
    } catch (error) {
      console.error(
        "[JobLens Follow-up] Copy failed:",
        error,
      );
    }
  };

  const submitReminder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reminderApp) return;

    if (!reminderTitle.trim()) {
      setReminderError("Please enter a reminder title.");
      return;
    }

    if (!reminderDueAt) {
      setReminderError("Please choose a date and time.");
      return;
    }

    const dueDate = new Date(reminderDueAt);

    if (Number.isNaN(dueDate.getTime())) {
      setReminderError("Please choose a valid date and time.");
      return;
    }

    setReminderBusy(true);
    setReminderError(null);

    try {
      await createReminderForCurrentUser({
        applicationId: reminderApp.id,
        title: reminderTitle.trim(),
        dueAt: dueDate.toISOString(),
      });

      setReminderApp(null);
      setReminderTitle("Follow up");
      setReminderDueAt("");
    } catch (error) {
      console.error("[JobLens] Reminder creation failed:", error);
      setReminderError("We couldn’t save this reminder. Please try again.");
    } finally {
      setReminderBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteNav />

      <main className="px-5 pb-24 pt-10 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Applications</h1>
              <p className="mt-2 text-sm text-white/60 md:text-base">
                Track every opportunity from saved role to final decision.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={exportApplicationsCsv}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                <Download className="h-4 w-4" aria-hidden />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => {
                  setCsvImportOpen((current) => !current);
                  setCsvImportError(null);
                  setCsvImportSuccess(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                <Upload className="h-4 w-4" aria-hidden />
                Import CSV
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmailImportOpen((current) => !current);
                  setEmailImportError(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                <Mail className="h-4 w-4" aria-hidden />
                Import Email
              </button>

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
          </div>

          {/* Summary */}
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Active" value={stats.active} />
            <Stat label="Interviews" value={stats.interviews} />
            <Stat label="Offers" value={stats.offers} />
          </div>

          {csvImportOpen && (
            <section className="mt-5 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 text-[color:var(--color-surface-foreground)] md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                    Applications CSV Import
                  </p>

                  <h2 className="mt-1 text-lg font-semibold">
                    Import applications from a CSV
                  </h2>

                  <p className="mt-1 max-w-2xl text-sm text-[color:var(--color-muted-foreground)]">
                    Preview valid rows before importing. Existing or repeated applications are skipped automatically.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCsvImportOpen(false);
                    resetCsvImport();
                  }}
                  className="rounded-lg p-2 text-[color:var(--color-muted-foreground)] transition hover:bg-[color:var(--color-muted)]"
                  aria-label="Close CSV import"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-muted)]/35 p-5">
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) =>
                    void handleCsvImportFile(
                      event.target.files?.[0],
                    )
                  }
                />

                <button
                  type="button"
                  onClick={() =>
                    csvFileInputRef.current?.click()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  Choose CSV File
                </button>

                <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                  Required columns: job_title and company_name. JobLens also understands aliases such as Title, Role, Position, Company, Stage and Score.
                </p>

                {csvImportFileName && (
                  <p className="mt-3 text-sm font-medium">
                    {csvImportFileName}
                  </p>
                )}
              </div>

              {csvImportError && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/10 px-4 py-3 text-sm text-[color:var(--color-danger)]"
                >
                  {csvImportError}
                </p>
              )}

              {csvImportSuccess && (
                <p className="mt-4 rounded-xl border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/10 px-4 py-3 text-sm font-medium text-[color:var(--color-success)]">
                  ✓ {csvImportSuccess}
                </p>
              )}

              {csvImportPreview && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-[color:var(--color-border)] p-4">
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">
                        CSV rows
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {csvImportPreview.totalRows}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[color:var(--color-border)] p-4">
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">
                        Ready to import
                      </p>
                      <p className="mt-1 text-xl font-semibold text-[color:var(--color-success)]">
                        {csvImportCandidates.importable.length}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[color:var(--color-border)] p-4">
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">
                        Duplicates
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {csvImportCandidates.duplicateRows.length}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[color:var(--color-border)] p-4">
                      <p className="text-xs text-[color:var(--color-muted-foreground)]">
                        Invalid rows
                      </p>
                      <p className="mt-1 text-xl font-semibold text-[color:var(--color-danger)]">
                        {csvImportPreview.errors.length}
                      </p>
                    </div>
                  </div>

                  {csvImportCandidates.importable.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-[color:var(--color-border)]">
                      <div className="border-b border-[color:var(--color-border)] px-4 py-3">
                        <p className="text-sm font-semibold">
                          Import preview
                        </p>
                      </div>

                      <div className="divide-y divide-[color:var(--color-border)]">
                        {csvImportCandidates.importable
                          .slice(0, 6)
                          .map((row) => (
                            <div
                              key={row.rowNumber}
                              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="text-sm font-semibold">
                                  {row.input.jobTitle}
                                </p>
                                <p className="text-xs text-[color:var(--color-muted-foreground)]">
                                  {row.input.companyName}
                                </p>
                              </div>

                              <span className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                                {row.input.status}
                                {typeof row.input.matchScore ===
                                "number"
                                  ? ` · ${row.input.matchScore}%`
                                  : ""}
                              </span>
                            </div>
                          ))}
                      </div>

                      {csvImportCandidates.importable.length >
                        6 && (
                        <p className="border-t border-[color:var(--color-border)] px-4 py-2 text-xs text-[color:var(--color-muted-foreground)]">
                          +{" "}
                          {csvImportCandidates.importable.length -
                            6}{" "}
                          more rows
                        </p>
                      )}
                    </div>
                  )}

                  {(csvImportPreview.errors.length > 0 ||
                    csvImportCandidates.duplicateRows.length >
                      0) && (
                    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 p-4 text-sm">
                      {csvImportCandidates.duplicateRows.length >
                        0 && (
                        <p>
                          <span className="font-semibold">
                            Duplicate rows skipped:
                          </span>{" "}
                          {csvImportCandidates.duplicateRows.join(
                            ", ",
                          )}
                        </p>
                      )}

                      {csvImportPreview.errors
                        .slice(0, 5)
                        .map((error) => (
                          <p
                            key={`${error.rowNumber}-${error.message}`}
                            className="mt-1 text-[color:var(--color-danger)]"
                          >
                            Row {error.rowNumber}:{" "}
                            {error.message}
                          </p>
                        ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmCsvImport()}
                      disabled={
                        csvImportBusy ||
                        csvImportCandidates.importable
                          .length === 0
                      }
                      className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        background: "var(--gradient-hero)",
                      }}
                    >
                      {csvImportBusy
                        ? "Importing..."
                        : `Import ${csvImportCandidates.importable.length} Application${
                            csvImportCandidates.importable
                              .length === 1
                              ? ""
                              : "s"
                          }`}
                    </button>

                    <button
                      type="button"
                      onClick={resetCsvImport}
                      disabled={csvImportBusy}
                      className="inline-flex items-center justify-center rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-semibold transition hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                    >
                      Choose Another File
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {emailImportOpen && (
            <section className="mt-5 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 text-[color:var(--color-surface-foreground)] md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                    Email Status Import
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    Paste a recruitment email
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                    JobLens reads the pasted text locally and previews the likely status before anything changes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEmailImportOpen(false);
                    resetEmailImport();
                  }}
                  className="rounded-lg p-2 text-[color:var(--color-muted-foreground)] transition hover:bg-[color:var(--color-muted)]"
                  aria-label="Close email import"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <textarea
                value={emailImportText}
                onChange={(event) => {
                  setEmailImportText(event.target.value);
                  setEmailImportPreview(null);
                  setEmailImportError(null);
                  setEmailImportSuccess(null);
                  setEmailImportStatusEdited(false);
                }}
                rows={8}
                placeholder={"From: Bayer Careers <careers@bayer.com>\nSubject: Interview invitation\n\nWe would like to invite you to an interview..."}
                className="mt-5 w-full resize-y rounded-xl border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-sm outline-none transition placeholder:text-[color:var(--color-muted-foreground)] focus:border-[color:var(--color-primary)]"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={previewEmailImport}
                  disabled={!emailImportText.trim()}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  Preview Status
                </button>

                {(emailImportText || emailImportPreview) && (
                  <button
                    type="button"
                    onClick={resetEmailImport}
                    className="rounded-xl border border-[color:var(--color-border)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--color-muted)]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {emailImportError && (
                <p className="mt-4 text-sm text-[color:var(--color-danger)]">
                  {emailImportError}
                </p>
              )}

              {emailImportPreview && (
                <div className="mt-5 rounded-xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-primary)]">
                    Preview
                  </p>

                  <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                    JobLens detected these details. Review and edit anything that looks wrong before confirming.
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="block">
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        Company
                      </span>
                      <input
                        value={emailImportPreview.companySuggestion}
                        onChange={(event) => {
                          setEmailImportPreview({
                            ...emailImportPreview,
                            companySuggestion: event.target.value,
                          });
                          setEmailImportSuccess(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm font-medium outline-none transition focus:border-[color:var(--color-primary)]"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        Position
                      </span>
                      <input
                        value={emailImportPreview.jobTitleSuggestion}
                        onChange={(event) => {
                          setEmailImportPreview({
                            ...emailImportPreview,
                            jobTitleSuggestion: event.target.value,
                          });
                          setEmailImportSuccess(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm font-medium outline-none transition focus:border-[color:var(--color-primary)]"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        Status
                      </span>
                      <select
                        value={emailImportPreview.status}
                        onChange={(event) => {
                          setEmailImportPreview({
                            ...emailImportPreview,
                            status: event.target.value as ParsedRecruitmentEmail["status"],
                          });
                          setEmailImportStatusEdited(true);
                          setEmailImportSuccess(null);
                          setEmailImportError(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm font-medium outline-none transition focus:border-[color:var(--color-primary)]"
                      >
                        {APPLICATION_STATUSES
                          .filter((status) => status !== "Saved")
                          .map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        Application Date
                      </span>
                      <input
                        type="date"
                        value={emailImportPreview.applicationDateIso}
                        onChange={(event) => {
                          setEmailImportPreview({
                            ...emailImportPreview,
                            applicationDateIso: event.target.value,
                            applicationDateSuggestion: event.target.value,
                          });
                          setEmailImportSuccess(null);
                        }}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm font-medium outline-none transition focus:border-[color:var(--color-primary)]"
                      />
                    </label>

                    <div>
                      <span className="text-xs text-[color:var(--color-muted-foreground)]">
                        Confidence
                      </span>
                      <div className="mt-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 px-3 py-2 text-sm font-semibold capitalize">
                        {emailImportPreview.confidence}
                      </div>
                      <p className="mt-1 text-[10px] text-[color:var(--color-muted-foreground)]">
                        Parser estimate
                      </p>
                    </div>
                  </div>

                  {emailImportMatch ? (
                    <div className="mt-4 rounded-xl border border-[color:var(--color-success)]/25 bg-[color:var(--color-success)]/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-success)]">
                        Matching application found
                      </p>

                      <p className="mt-2 font-semibold">
                        {emailImportMatch.application.jobTitle}
                      </p>

                      <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                        {emailImportMatch.application.companyName}
                        {" · "}
                        Current status: {emailImportMatch.application.status}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-[color:var(--color-border)] p-4">
                      <p className="text-sm font-medium">
                        No unique tracker match found.
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                        JobLens will not change any application until a unique match is identified and you confirm it.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={confirmEmailImport}
                      disabled={emailImportBusy}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      {emailImportBusy
                        ? "Saving..."
                        : emailImportMatch
                          ? `Update to ${emailImportPreview.status}`
                          : "Create Application"}
                    </button>

                    <p className="text-xs text-[color:var(--color-muted-foreground)]">
                      Nothing changes until you confirm.
                    </p>
                  </div>

                  {emailImportSuccess && (
                    <p className="mt-4 text-sm font-medium text-[color:var(--color-success)]">
                      {emailImportSuccess}
                    </p>
                  )}

                  <p className="mt-4 text-xs text-[color:var(--color-muted-foreground)]">
                    The pasted email itself is not stored.
                  </p>
                </div>
              )}
            </section>
          )}

          {hydrated && topActionApp && topAction && (
            <section className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--color-primary)]/25 bg-[color:var(--color-primary)]/10">
              <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                      <Sparkles className="h-4 w-4" aria-hidden />
                      Action Center
                    </div>

                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/65">
                      {topAction.urgencyLabel}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-white/55">
                    Your highest-priority next move
                  </p>

                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {topAction.title}
                  </h2>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {topActionApp.jobTitle} · {topActionApp.companyName}
                  </p>

                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
                    {topAction.description}
                  </p>

                  {attentionApps.length > 1 && (
                    <p className="mt-3 text-xs text-white/40">
                      +{attentionApps.length - 1} more high-priority action
                      {attentionApps.length - 1 === 1 ? "" : "s"} waiting below
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {topAction.kind === "analyze" && topAction.ctaLabel ? (
                    <Link
                      to="/"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      {topAction.ctaLabel} →
                    </Link>
                  ) : topAction.kind === "interview_prep" && topAction.ctaLabel ? (
                    <button
                      type="button"
                      onClick={() => {
                        setInterviewPrepApp(topActionApp);
                        setInterviewPrepResult(null);
                        setInterviewPrepError(null);
                        setInterviewPrepEvidence("");
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      {topAction.ctaLabel} →
                    </button>
                  ) : topAction.kind === "reminder" && topAction.ctaLabel ? (
                    <button
                      type="button"
                      onClick={() => openReminder(topActionApp)}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      {topAction.ctaLabel} →
                    </button>
                  ) : topAction.kind === "edit" && topAction.ctaLabel ? (
                    <button
                      type="button"
                      onClick={() => openEdit(topActionApp)}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      {topAction.ctaLabel} →
                    </button>
                  ) : (
                    <span className="inline-flex rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/50">
                      No action needed
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

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
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
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
                            onReminder={openReminder}
                            onTimeline={openTimeline}
                            onInterviewPrep={(app) => {
                              setInterviewPrepApp(app);
                              setInterviewPrepResult(null);
                              setInterviewPrepError(null);
                              setInterviewPrepEvidence("");
                            }}
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

      {interviewPrepApp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interview-prep-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setInterviewPrepApp(null);
              setInterviewPrepEvidence("");
            }
          }}
        >
          <div className="card-surface max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--color-primary)]">
                  Interview Prep
                </p>
                <h2 id="interview-prep-title" className="mt-1 text-xl font-semibold">
                  {interviewPrepApp.jobTitle}
                </h2>
                <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                  {interviewPrepApp.companyName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setInterviewPrepApp(null);
                  setInterviewPrepEvidence("");
                }}
                aria-label="Close interview prep"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-6">
              {!interviewPrepResult && (
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        Build your interview preparation pack
                      </p>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                        JobLens uses the role details and your existing analysis context.
                        Add a few real examples below to make the prep more personal.
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-primary)]">
                      Evidence grounded
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {interviewPrepApp.jobDescription && (
                      <span className="rounded-full border border-[color:var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[color:var(--color-muted-foreground)]">
                        Job description
                      </span>
                    )}

                    {typeof interviewPrepApp.matchScore === "number" && (
                      <span className="rounded-full border border-[color:var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[color:var(--color-muted-foreground)]">
                        {interviewPrepApp.matchScore}% match
                      </span>
                    )}

                    {interviewPrepApp.verdict && (
                      <span className="rounded-full border border-[color:var(--color-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-[color:var(--color-muted-foreground)]">
                        Analysis verdict
                      </span>
                    )}

                    {interviewPrepEvidence.trim() && (
                      <span className="rounded-full border border-[color:var(--color-success)]/25 bg-[color:var(--color-success)]/10 px-2.5 py-1 text-[11px] font-medium text-[color:var(--color-success)]">
                        Your evidence
                      </span>
                    )}
                  </div>

                  <label className="mt-5 block">
                    <span className="text-sm font-semibold">
                      Your evidence
                      <span className="ml-1 text-xs font-normal text-[color:var(--color-muted-foreground)]">
                        (optional)
                      </span>
                    </span>

                    <span className="mt-1 block text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
                      Add 3–5 real bullets from your experience, projects or CV that
                      you may want to use in the interview.
                    </span>

                    <textarea
                      rows={5}
                      maxLength={3000}
                      value={interviewPrepEvidence}
                      onChange={(event) =>
                        setInterviewPrepEvidence(event.target.value)
                      }
                      placeholder={"• Built or improved...\n• Led or collaborated on...\n• Used a relevant tool or skill...\n• Solved a difficult problem..."}
                      className="mt-3 w-full resize-y rounded-xl border border-[color:var(--color-border)] bg-white px-3 py-3 text-sm leading-relaxed text-[color:var(--color-surface-foreground)] outline-none transition focus:border-[color:var(--color-primary)]"
                    />
                  </label>

                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[color:var(--color-muted-foreground)]">
                    <span>
                      Used for this prep request · not saved to your application tracker.
                    </span>
                    <span className="shrink-0">
                      {interviewPrepEvidence.length}/3000
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={generateInterviewPrep}
                    disabled={interviewPrepBusy}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                    {interviewPrepBusy
                      ? "Preparing..."
                      : interviewPrepEvidence.trim()
                        ? "Generate Personalized Prep"
                        : "Generate Interview Prep"}
                  </button>
                </div>
              )}

              {interviewPrepError && (
                <p className="mt-4 text-sm text-[color:var(--color-danger)]">
                  {interviewPrepError}
                </p>
              )}

              {interviewPrepResult && (
                <div className="space-y-5">
                  <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/35 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-muted-foreground)]">
                        Grounded in
                      </span>

                      {interviewPrepApp.jobDescription && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium">
                          Role details
                        </span>
                      )}

                      {typeof interviewPrepApp.matchScore === "number" && (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium">
                          JobLens analysis
                        </span>
                      )}

                      {interviewPrepEvidence.trim() && (
                        <span className="rounded-full bg-[color:var(--color-success)]/10 px-2.5 py-1 text-[10px] font-medium text-[color:var(--color-success)]">
                          Your evidence
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
                      Candidate examples should come only from evidence you supplied.
                      JobLens does not need to save CV text in the tracker to personalize this prep.
                    </p>
                  </section>

                  <section className="rounded-xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-primary)]">
                      Your opening
                    </p>
                    <p className="mt-2 text-sm leading-relaxed">
                      {interviewPrepResult.introStrategy}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">
                      Likely interview questions
                    </h3>
                    <div className="mt-3 space-y-3">
                      {interviewPrepResult.likelyQuestions.map(
                        (item, index) => (
                          <div
                            key={`${item.question}-${index}`}
                            className="rounded-xl border border-[color:var(--color-border)] p-4"
                          >
                            <p className="text-sm font-semibold">
                              {index + 1}. {item.question}
                            </p>
                            <p className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">
                              Why: {item.whyItMayBeAsked}
                            </p>
                            <p className="mt-2 text-sm">
                              <span className="font-medium">
                                Answer direction:
                              </span>{" "}
                              {item.answerDirection}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">
                      STAR examples to prepare
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {interviewPrepResult.starPrompts.map(
                        (item, index) => (
                          <div
                            key={`${item.competency}-${index}`}
                            className="rounded-xl border border-[color:var(--color-border)] p-4"
                          >
                            <p className="text-sm font-semibold">
                              {item.competency}
                            </p>
                            <p className="mt-2 text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
                              {item.prompt}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">
                      Risk areas
                    </h3>
                    <div className="mt-3 space-y-3">
                      {interviewPrepResult.riskAreas.map(
                        (item, index) => (
                          <div
                            key={`${item.area}-${index}`}
                            className="rounded-xl border border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/10 p-4"
                          >
                            <p className="text-sm font-semibold">
                              {item.area}
                            </p>
                            <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                              {item.preparation}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold">
                      Smart questions to ask
                    </h3>
                    <ol className="mt-3 space-y-2">
                      {interviewPrepResult.questionsToAsk.map(
                        (question, index) => (
                          <li
                            key={`${question}-${index}`}
                            className="rounded-xl border border-[color:var(--color-border)] px-4 py-3 text-sm"
                          >
                            {index + 1}. {question}
                          </li>
                        ),
                      )}
                    </ol>
                  </section>

                  <button
                    type="button"
                    onClick={generateInterviewPrep}
                    disabled={interviewPrepBusy}
                    className="text-sm font-semibold text-[color:var(--color-primary)] hover:underline disabled:opacity-50"
                  >
                    {interviewPrepBusy
                      ? "Regenerating..."
                      : "Regenerate prep"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {timelineApp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timeline-dialog-title"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget &&
              !timelineBusy
            ) {
              setTimelineApp(null);
            }
          }}
        >
          <div className="card-surface max-h-[85vh] w-full max-w-3xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <History
                    className="h-5 w-5 text-[color:var(--color-primary)]"
                    aria-hidden
                  />
                  <h2
                    id="timeline-dialog-title"
                    className="text-xl font-semibold"
                  >
                    Application progress
                  </h2>
                </div>

                <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                  {timelineApp.jobTitle}
                  {timelineApp.companyName
                    ? ` · ${timelineApp.companyName}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setTimelineApp(null)}
                disabled={timelineBusy}
                aria-label="Close application timeline"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {!timelineBusy && !timelineError && (
              <>
                <section className="mt-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/25 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold">
                      Hiring stages
                    </p>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[timelineApp.status]}`}
                    >
                      {timelineApp.status}
                    </span>
                  </div>

                  <ol className="mt-6 space-y-4 md:grid md:grid-cols-6 md:space-y-0">
                    {timelineLifecycle.map((stage, index) => {
                      const complete =
                        stage.state === "complete";
                      const current =
                        stage.state === "current";
                      const rejected =
                        stage.status === "Rejected";

                      return (
                        <li
                          key={stage.id}
                          className="relative"
                        >
                          {index <
                            timelineLifecycle.length - 1 && (
                            <span
                              aria-hidden
                              className={`absolute left-[calc(50%+1rem)] right-[-50%] top-4 hidden h-px md:block ${
                                complete
                                  ? "bg-[color:var(--color-success)]/45"
                                  : "bg-[color:var(--color-border)]"
                              }`}
                            />
                          )}

                          <div className="relative z-10 flex items-start gap-3 md:flex-col md:items-center md:text-center">
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                rejected
                                  ? "border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)]"
                                  : current
                                    ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white"
                                    : complete
                                      ? "border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]"
                                      : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-muted-foreground)]"
                              }`}
                            >
                              {complete ? "✓" : index + 1}
                            </span>

                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                {stage.label}
                              </p>

                              <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                                {stage.occurredAt
                                  ? formatDate(stage.occurredAt)
                                  : current
                                    ? "Current"
                                    : "Upcoming"}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                {timelineFollowUpGuidance && (
                  <section className="mt-4 rounded-2xl border border-[color:var(--color-primary)]/25 bg-[color:var(--color-primary)]/5 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-primary)]">
                          Recommended next step
                        </p>

                        <p className="mt-1 text-base font-semibold">
                          {timelineFollowUpGuidance.timing === "Wait"
                            ? "No follow-up yet"
                            : timelineFollowUpGuidance.timing === "Plan"
                              ? "Plan your follow-up"
                              : "Follow up now"}
                        </p>

                        <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                          {timelineFollowUpGuidance.daysSinceApplication} days since application
                          {" · "}
                          {new Date(
                            timelineFollowUpGuidance.suggestedReminderDate,
                          ).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const app = timelineApp;
                          setTimelineApp(null);
                          openReminder(app);
                        }}
                        className="shrink-0 rounded-xl bg-[color:var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                      >
                        Set reminder
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}

            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]">
                Activity
              </p>
              {!timelineBusy &&
                !timelineError &&
                timelineEvents.length > 0 && (
                  <span className="text-xs text-[color:var(--color-muted-foreground)]">
                    {timelineEvents.length}{" "}
                    {timelineEvents.length === 1
                      ? "event"
                      : "events"}
                  </span>
                )}
            </div>

            <div className="mt-3">
              {timelineBusy ? (
                <p className="py-8 text-center text-sm text-[color:var(--color-muted-foreground)]">
                  Loading history…
                </p>
              ) : timelineError ? (
                <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/50 p-4">
                  <p className="text-sm text-[color:var(--color-muted-foreground)]">
                    {timelineError}
                  </p>
                </div>
              ) : timelineEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--color-border)] p-5 text-center">
                  <History
                    className="mx-auto h-5 w-5 text-[color:var(--color-muted-foreground)]"
                    aria-hidden
                  />
                  <p className="mt-2 text-sm font-medium">
                    No recorded history yet
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                    Future status changes will appear here automatically.
                  </p>
                </div>
              ) : (
                <ol className="relative ml-2 border-l border-[color:var(--color-border)]">
                  {timelineEvents.map((event) => (
                    <li
                      key={event.id}
                      className="relative ml-6 pb-7 last:pb-0"
                    >
                      <span
                        className="absolute -left-[1.86rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-[color:var(--color-surface)]"
                        style={{
                          background:
                            "var(--color-primary)",
                        }}
                        aria-hidden
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">
                          {event.eventType === "created"
                            ? "Application created"
                            : `${event.fromStatus ?? "Previous"} → ${event.toStatus ?? "Updated"}`}
                        </p>

                        <span className="rounded-full border border-[color:var(--color-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                          {event.source === "gmail"
                            ? "Email import"
                            : event.source === "analysis"
                              ? "Analysis"
                              : "Manual"}
                        </span>
                      </div>

                      {event.eventType === "created" &&
                        event.toStatus && (
                          <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                            Starting stage: {event.toStatus}
                          </p>
                        )}

                      <time className="mt-1 block text-[11px] text-[color:var(--color-muted-foreground)]">
                        {new Date(
                          event.occurredAt,
                        ).toLocaleString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </div>

          </div>
        </div>
      )}

      {reminderApp && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminder-dialog-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !reminderBusy) {
              setReminderApp(null);
            }
          }}
        >
          <div className="card-surface w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="reminder-dialog-title" className="text-xl font-semibold">
                  Add reminder
                </h2>
                <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
                  {reminderApp.jobTitle}
                  {reminderApp.companyName
                    ? ` · ${reminderApp.companyName}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReminderApp(null)}
                disabled={reminderBusy}
                aria-label="Close reminder dialog"
                className="rounded-lg p-1.5 text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {reminderAssistantGuidance && (
              <div className="mt-5 rounded-2xl border border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-primary)]">
                      Suggested next step
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {reminderAssistantGuidance.timing}
                    </p>
                  </div>

                  {reminderAssistantGuidance.daysSinceApplication !==
                    undefined && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[color:var(--color-muted-foreground)]">
                      {reminderAssistantGuidance.daysSinceApplication} days since application
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
                  {reminderAssistantGuidance.recommendation}
                </p>

                <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                      Suggested message
                    </p>

                    <button
                      type="button"
                      onClick={copyReminderAssistantMessage}
                      className="shrink-0 rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-semibold hover:bg-[color:var(--color-muted)]"
                    >
                      {followUpCopied
                        ? "✓ Copied"
                        : "Copy message"}
                    </button>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed">
                    {reminderAssistantGuidance.message}
                  </p>
                </div>
              </div>
            )}

            <form className="mt-5 space-y-4" onSubmit={submitReminder}>
              <FormField id="reminder-title" label="Action">
                <select
                  id="reminder-title"
                  className="jl-input"
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                >
                  <option value="Follow up">Follow up</option>
                  <option value="Interview thank-you">
                    Interview thank-you
                  </option>
                  <option value="Case follow-up">
                    Case follow-up
                  </option>
                  <option value="Offer response">
                    Offer response
                  </option>
                  <option value="Assessment deadline">
                    Assessment deadline
                  </option>
                  <option value="Interview">Interview</option>
                  <option value="Case deadline">Case deadline</option>
                  <option value="Application deadline">
                    Application deadline
                  </option>
                  <option value="Check application status">
                    Check application status
                  </option>
                </select>
              </FormField>

              <FormField id="reminder-due" label="Date & time" required>
                <input
                  id="reminder-due"
                  type="datetime-local"
                  className="jl-input"
                  value={reminderDueAt}
                  onChange={(e) => setReminderDueAt(e.target.value)}
                />
              </FormField>

              {reminderError && (
                <p
                  role="alert"
                  className="text-sm text-[color:var(--color-danger)]"
                >
                  {reminderError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setReminderApp(null)}
                  disabled={reminderBusy}
                  className="rounded-xl border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-surface-foreground)] hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={reminderBusy}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <Bell className="h-4 w-4" aria-hidden />
                  {reminderBusy ? "Saving…" : "Add reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  onChange={(e) => {
                    const nextJobUrl = e.target.value;
                    const previousDetected =
                      detectApplicationSourceFromUrl(form.jobUrl);
                    const nextDetected =
                      detectApplicationSourceFromUrl(nextJobUrl);

                    setForm({
                      ...form,
                      jobUrl: nextJobUrl,
                      applicationSource:
                        !form.applicationSource ||
                        form.applicationSource === previousDetected
                          ? nextDetected ?? ""
                          : form.applicationSource,
                    });
                  }}
                  placeholder="https://…"
                />
              </FormField>

              <FormField
                id="f-source"
                label="Application source"
                hint="Optional"
              >
                <select
                  id="f-source"
                  className="jl-input"
                  value={form.applicationSource}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      applicationSource:
                        e.target.value as ApplicationSource | "",
                    })
                  }
                >
                  <option value="">Not set</option>
                  {APPLICATION_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>

                <p className="mt-1.5 text-[11px] text-[color:var(--color-muted-foreground)]">
                  JobLens can detect some sources from the job URL. You can always override it.
                </p>
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
  onReminder,
  onTimeline,
  onInterviewPrep,
}: {
  app: Application;
  onStatus: (id: string, s: ApplicationStatus) => void;
  onEdit: (a: Application) => void;
  onDelete: (a: Application) => void;
  onReminder: (a: Application) => void;
  onTimeline: (a: Application) => void;
  onInterviewPrep: (a: Application) => void;
}) {
  const date = app.appliedAt ? formatDate(app.appliedAt) : formatDate(app.createdAt);
  const dateLabel = app.appliedAt
    ? "Applied"
    : app.status === "Saved"
      ? "Saved"
      : "Added";
  const nextAction = getNextBestAction(app);

  const nextActionTone =
    nextAction.priority === "high"
      ? "border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/10"
      : nextAction.priority === "medium"
        ? "border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/5"
        : "border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40";

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

      {(app.verdict || app.applicationSource) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {app.verdict && (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[app.status]}`}
            >
              {app.verdict}
            </span>
          )}

          {app.applicationSource && (
            <span className="inline-flex rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-muted-foreground)]">
              {app.applicationSource}
            </span>
          )}
        </div>
      )}

      {app.notes && (
        <p className="mt-2 line-clamp-2 text-xs text-[color:var(--color-muted-foreground)]">{app.notes}</p>
      )}

      <p className="mt-2 text-[11px] text-[color:var(--color-muted-foreground)]">
        {dateLabel} {date}
      </p>

      <div className={`mt-3 rounded-xl border p-3 ${nextActionTone}`}>
        <div className="flex items-center gap-1.5">
          <Sparkles
            className="h-3.5 w-3.5 text-[color:var(--color-primary)]"
            aria-hidden
          />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
            Next best action
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold">
            {nextAction.title}
          </p>

          <span
            className={
              nextAction.urgencyLabel === "Now"
                ? "rounded-full bg-[color:var(--color-danger)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-danger)]"
                : nextAction.urgencyLabel === "Soon"
                  ? "rounded-full bg-[color:var(--color-warning)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-warning)]"
                  : "rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]"
            }
          >
            {nextAction.urgencyLabel}
          </span>
        </div>

        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--color-muted-foreground)]">
          {nextAction.description}
        </p>

        {nextAction.kind === "analyze" && nextAction.ctaLabel ? (
          <Link
            to="/"
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </Link>
        ) : nextAction.kind === "interview_prep" && nextAction.ctaLabel ? (
          <button
            type="button"
            onClick={() => onInterviewPrep(app)}
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </button>
        ) : nextAction.kind === "reminder" && nextAction.ctaLabel ? (
          <button
            type="button"
            onClick={() => onReminder(app)}
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </button>
        ) : nextAction.kind === "edit" && nextAction.ctaLabel ? (
          <button
            type="button"
            onClick={() => onEdit(app)}
            className="mt-2 inline-flex text-[11px] font-semibold text-[color:var(--color-primary)] hover:underline"
          >
            {nextAction.ctaLabel} →
          </button>
        ) : null}
      </div>

      <div className="mt-3">
        <label className="sr-only" htmlFor={`status-${app.id}`}>
          Status for {app.jobTitle}
        </label>

        <select
          id={`status-${app.id}`}
          value={app.status}
          onChange={(e) => onStatus(app.id, e.target.value as ApplicationStatus)}
          className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[color:var(--color-surface-foreground)]"
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="mt-2 flex w-full items-center gap-1.5">
          {app.jobUrl && (
            <a
              href={app.jobUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open job posting for ${app.jobTitle}`}
              title="Open job posting"
              className="inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] transition hover:bg-[color:var(--color-muted)]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}

          <button
            type="button"
            onClick={() => onTimeline(app)}
            aria-label={`View timeline for ${app.jobTitle}`}
            title="View timeline"
            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] transition hover:bg-[color:var(--color-muted)]"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onReminder(app)}
            aria-label={`Add reminder for ${app.jobTitle}`}
            title="Add reminder"
            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-primary)] transition hover:bg-[color:var(--color-primary)]/10"
          >
            <Bell className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onEdit(app)}
            aria-label={`View or edit ${app.jobTitle}`}
            title="Edit application"
            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] transition hover:bg-[color:var(--color-muted)]"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onDelete(app)}
            aria-label={`Delete ${app.jobTitle}`}
            title="Delete application"
            className="inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-danger)] transition hover:bg-[color:var(--color-danger)]/10"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
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
