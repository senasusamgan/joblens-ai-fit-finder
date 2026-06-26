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

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = RequestSchema.safeParse(body);
          if (!result.success) {
            return Response.json({ error: "Invalid input." }, { status: 400 });
          }
          const { jobTitle, companyName, cv, jobDescription, language } = parsed.data;

          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return Response.json({ error: "AI is not configured." }, { status: 500 });
          }

          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");

          const system = `You are JobLens AI, an honest job-application reviewer for students and entry-level job seekers.

ABSOLUTE RULES:
- NEVER invent, assume, or fabricate any experience, education, skills, certifications, achievements, numbers, metrics, or personal details that are not clearly present in the CV.
- NEVER encourage the user to lie, exaggerate, or add false information.
- Compare the CV ONLY against requirements actually stated in the job description.
- If evidence is missing, say so honestly. Do not fill gaps with assumptions.
- When suggesting measurable results, instruct the user to add them ONLY if accurate and verifiable.
- Output ALL analysis text in ${language}. Keep enum values (verdict, severity) in English.
- The recruiter message must use ONLY facts supported by the CV, mention the job title, mention the company name when supplied, be professional but natural, no exaggerated praise, max 500 characters, written in ${language}.
- The matchScore is an explainable estimate, NOT an official ATS score or hiring guarantee.
- Only include possibleBlockers that are clearly stated as mandatory in the job description (work authorization, location, required degree, mandatory certification, required language level, minimum years of experience). If none, return an empty list.
- Include a short disclaimer explaining the result is an AI-generated estimate, not an official ATS assessment or hiring decision, written in ${language}.`;

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
  "learnableGaps": { "skill": string, "importance": string, "suggestion": string }[],
  "possibleBlockers": { "requirement": string, "reason": string, "severity": "Low" | "Medium" | "High" }[],
  "cvSuggestions": { "section": string, "suggestion": string, "reason": string, "example": string }[],
  "recruiterMessage": string,
  "disclaimer": string
}`;

          const { text } = await generateText({
            model,
            system,
            prompt,
          });

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
          return Response.json(result.data);
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
