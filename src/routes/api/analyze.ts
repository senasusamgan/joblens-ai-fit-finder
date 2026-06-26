import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const RequestSchema = z.object({
  jobTitle: z.string().min(1),
  companyName: z.string().optional().default(""),
  cv: z.string().min(150),
  jobDescription: z.string().min(150),
  language: z.enum(["English", "Turkish"]),
});

const AnalysisSchema = z.object({
  verdict: z.enum(["Strong Fit", "Worth Applying", "Stretch Opportunity", "Low Fit"]),
  verdictExplanation: z.string(),
  matchScore: z.number().int().min(0).max(100),
  strongMatches: z.array(
    z.object({
      requirement: z.string(),
      cvEvidence: z.string(),
      explanation: z.string(),
    }),
  ),
  partialMatches: z.array(
    z.object({
      requirement: z.string(),
      cvEvidence: z.string(),
      remainingGap: z.string(),
      explanation: z.string(),
    }),
  ),
  learnableGaps: z.array(
    z.object({
      skill: z.string(),
      importance: z.string(),
      suggestion: z.string(),
    }),
  ),
  possibleBlockers: z.array(
    z.object({
      requirement: z.string(),
      reason: z.string(),
      severity: z.enum(["Low", "Medium", "High"]),
    }),
  ),
  cvSuggestions: z.array(
    z.object({
      section: z.string(),
      suggestion: z.string(),
      reason: z.string(),
      example: z.string(),
    }),
  ),
  recruiterMessage: z.string(),
  disclaimer: z.string(),
});

type Analysis = z.infer<typeof AnalysisSchema>;

function trimRecruiterMessage(msg: string, max = 500): string {
  let m = (msg ?? "").replace(/\s+/g, " ").trim();
  if (m.length <= max) return m;
  // Try sentence-boundary trim
  const sentences = m.match(/[^.!?…]+[.!?…]+/g) ?? [m];
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  out = out.trim();
  if (!out || out.length > max) {
    out = m.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
  }
  return out.length <= max ? out : out.slice(0, max);
}

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = RequestSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: "Invalid input." }, { status: 400 });
          }
          const { jobTitle, companyName, cv, jobDescription, language } = parsed.data;

          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return Response.json({ error: "AI is not configured." }, { status: 500 });
          }

          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");

          const langInstruction =
            language === "Turkish"
              ? `OUTPUT LANGUAGE: Turkish. Write EVERY natural-language string in Turkish: verdictExplanation, strongMatches.*, partialMatches.*, learnableGaps.* (including importance), possibleBlockers.* (including reason), cvSuggestions.* (section, suggestion, reason, example), recruiterMessage, disclaimer. Do NOT mix English sentences into Turkish text. ONLY these enum values stay in English exactly as listed: verdict ("Strong Fit" | "Worth Applying" | "Stretch Opportunity" | "Low Fit") and severity ("Low" | "Medium" | "High").`
              : `OUTPUT LANGUAGE: English. Write every natural-language field in English.`;

          const notStated =
            language === "Turkish" ? `"CV'de belirtilmemiş"` : `"Not stated in the CV"`;

          const system = `You are JobLens AI, an honest job-application reviewer for students and entry-level job seekers.

${langInstruction}

GROUNDING — ABSOLUTE RULES:
- Use ONLY information explicitly stated in the CV. Never invent, assume, or infer facts.
- NEVER infer any of the following unless the CV states them verbatim: current location, city, country, residency, nationality, work authorization / visa status, age, gender, language proficiency, availability, total years of experience, internship duration, current employment status, salary.
- Graduating from a university in a city does NOT prove the candidate currently lives there. Studying in a country does NOT imply work authorization.
- If a piece of information needed to evaluate a requirement is not in the CV, treat it as unverified. Use the exact phrase ${notStated} (in the output language) where appropriate, and add the requirement to possibleBlockers with reason explaining it is unverified (not a confirmed absence).
- Before classifying anything as a learnable gap, search the ENTIRE CV for related evidence (projects, coursework, personal projects, tools, technologies). If related evidence exists but is in a different environment / stack / scale, put it in partialMatches with cvEvidence (quote or paraphrase from CV) and remainingGap (what is still missing). NEVER describe an existing skill as absent.
- Do NOT infer soft activities like "debugging", "code review", "testing", "team leadership", "mentoring", "agile", "scrum" just because the candidate built something complex. They must be explicitly mentioned in the CV. If debugging is requested by the JD but not in the CV, do not claim it as evidence. You may add a partial match noting related development experience and explicitly state that the activity itself is not directly mentioned in the CV.
- Nice-to-have / preferred requirements must influence matchScore LESS than mandatory / required ones.

CATEGORIES:
- strongMatches: requirement is clearly supported by explicit CV evidence.
- partialMatches: related CV evidence exists but does not fully meet the requirement (different stack, smaller scale, academic vs professional, related but not the same activity, etc.).
- learnableGaps: no supporting CV evidence AND the skill is reasonably learnable.
- possibleBlockers: mandatory requirement that is clearly unmet OR cannot be verified from the CV (location, work authorization, mandatory degree/certification, minimum years of experience, required language level). For unverifiable ones, the reason must say it is unverified, not that the candidate fails it.

CV SUGGESTIONS:
- Never invent dates, company names, locations, numbers, achievements, or metrics. When information is missing, use placeholders in the example field: [Company Name] / [Şirket Adı], [Accurate dates] / [Doğru tarihler], [Verified result] / [Doğrulanmış sonuç], [Location] / [Mevcut şehir], [Number] / [Sayı].
- Only suggest adding a city/location to the CV if that location is already present in the CV. If the CV does not state any location, use a placeholder like [Mevcut şehir] / [Current city] in the example — never write a real city such as "Istanbul" / "İstanbul, Türkiye".

RECRUITER MESSAGE:
- Style: short LinkedIn-style direct message or connection note. NOT a cover letter and NOT an email body.
- 500 characters or fewer including spaces. Be concise.
- Written in the selected output language.
- Mention the role (${jobTitle})${companyName ? ` and the company (${companyName})` : ""}.
- Mention only one or two highly relevant facts that are explicitly in the CV.
- Briefly introduce the applicant, mention the role/company, mention one or two supported qualifications, and end by asking to connect or learn more about the role.
- Sound natural and human. Avoid "Dear Hiring Team", "Sayın Yetkili", "Merhaba Sayın..." and long formal openings.
- ABSOLUTELY DO NOT mention or imply any attachment. NEVER write: "CV'mi ekte bulabilirsiniz", "ekte sunulmuştur", "ilişikte", "Please find my CV attached", "attached resume", or any similar attachment phrasing. The product does not attach a CV.
- Never invent information.

TURKISH STYLE (only when output language is Turkish):
- Write natural, professional Turkish. Do NOT use anglicized words when a normal Turkish word exists.
- Forbidden: "Skiller", "skill bölümü", "experience bölümü". Use "Beceriler bölümü" or "Yetenekler bölümü", "Deneyim bölümü".
- Keep product / technical names unchanged: Unreal Engine, C++, Blueprint, Git, DirectX, shader, GPU, API, CV.
- Map importance/severity labels to natural Turkish in the text: Required → Zorunlu, Nice to have → Tercih sebebi, Low → Düşük, Medium → Orta, High → Yüksek. (The schema severity enum still stays in English: "Low" | "Medium" | "High".)
- Every sentence should read as natural professional Turkish.

VERDICT, SCORE, DISCLAIMER:
- matchScore is an explainable estimate, NOT an ATS score or hiring guarantee.
- disclaimer: short, in the output language, explaining this is an AI-generated estimate and not an official ATS assessment or hiring decision.`;

          const prompt = `JOB TITLE: ${jobTitle}
COMPANY: ${companyName || "(not provided)"}
OUTPUT LANGUAGE: ${language}

=== JOB DESCRIPTION ===
${jobDescription}

=== CANDIDATE CV ===
${cv}

Analyze the fit honestly. Respond with ONLY a single valid JSON object matching this TypeScript type, no markdown, no code fences, no commentary:

{
  "verdict": "Strong Fit" | "Worth Applying" | "Stretch Opportunity" | "Low Fit",
  "verdictExplanation": string,
  "matchScore": number,
  "strongMatches": { "requirement": string, "cvEvidence": string, "explanation": string }[],
  "partialMatches": { "requirement": string, "cvEvidence": string, "remainingGap": string, "explanation": string }[],
  "learnableGaps": { "skill": string, "importance": string, "suggestion": string }[],
  "possibleBlockers": { "requirement": string, "reason": string, "severity": "Low" | "Medium" | "High" }[],
  "cvSuggestions": { "section": string, "suggestion": string, "reason": string, "example": string }[],
  "recruiterMessage": string,
  "disclaimer": string
}`;

          const { text } = await generateText({ model, system, prompt });

          const cleaned = text
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();
          const start = cleaned.search(/[\{\[]/);
          const end = cleaned.lastIndexOf("}");
          const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
          const result = AnalysisSchema.safeParse(JSON.parse(jsonStr));
          if (!result.success) {
            console.error("schema parse failed", result.error);
            return Response.json({ error: "analysis_failed" }, { status: 500 });
          }
          const data: Analysis = {
            ...result.data,
            recruiterMessage: trimRecruiterMessage(result.data.recruiterMessage, 500),
          };
          return Response.json(data);
        } catch (err) {
          console.error("analyze error", err);
          const status =
            err && typeof err === "object" && "statusCode" in err
              ? (err as { statusCode: number }).statusCode
              : 500;
          if (status === 429) {
            return Response.json({ error: "rate_limited" }, { status: 429 });
          }
          if (status === 402) {
            return Response.json({ error: "credits_exhausted" }, { status: 402 });
          }
          return Response.json({ error: "analysis_failed" }, { status: 500 });
        }
      },
    },
  },
});
