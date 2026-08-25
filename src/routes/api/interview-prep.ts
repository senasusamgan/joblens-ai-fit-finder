import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const RequestSchema = z.object({
  jobTitle: z.string().min(1),
  companyName: z.string().min(1),
  jobDescription: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

const InterviewPrepSchema = z.object({
  introStrategy: z.string(),
  likelyQuestions: z.array(
    z.object({
      question: z.string(),
      whyItMayBeAsked: z.string(),
      answerDirection: z.string(),
    }),
  ),
  starPrompts: z.array(
    z.object({
      competency: z.string(),
      prompt: z.string(),
    }),
  ),
  riskAreas: z.array(
    z.object({
      area: z.string(),
      preparation: z.string(),
    }),
  ),
  questionsToAsk: z.array(z.string()),
});

function buildFallbackPrep(
  jobTitle: string,
  companyName: string,
) {
  return {
    introStrategy: `Prepare a 30–45 second introduction that connects your real background to the ${jobTitle} role at ${companyName}. Focus on why this role interests you, one or two relevant strengths you can genuinely support with examples, and what you hope to contribute or learn.`,
    likelyQuestions: [
      {
        question: `Why are you interested in the ${jobTitle} role at ${companyName}?`,
        whyItMayBeAsked:
          "The interviewer wants to understand your motivation and interest in the opportunity.",
        answerDirection:
          "Connect the role to your genuine interests, relevant experience, and what you want to learn or contribute.",
      },
      {
        question: "Tell me about yourself.",
        whyItMayBeAsked:
          "This helps the interviewer understand how you position your background for the role.",
        answerDirection:
          "Use a present → relevant past → why this opportunity structure and keep it under one minute.",
      },
      {
        question: "Tell me about a challenging problem you worked through.",
        whyItMayBeAsked:
          "This can reveal problem solving, ownership, and communication.",
        answerDirection:
          "Use a real example and explain the situation, your responsibility, your actions, and the result.",
      },
      {
        question: "Tell me about a time you worked with others to achieve a goal.",
        whyItMayBeAsked:
          "The interviewer may want evidence of collaboration.",
        answerDirection:
          "Choose a real example where your individual contribution is clear.",
      },
      {
        question: "What would you like to learn in this role?",
        whyItMayBeAsked:
          "Learning motivation matters especially for internship and early-career roles.",
        answerDirection:
          "Name concrete capabilities related to the role instead of giving a generic answer.",
      },
    ],
    starPrompts: [
      {
        competency: "Problem solving",
        prompt:
          "Prepare one real example where you identified a problem, evaluated options, and took action.",
      },
      {
        competency: "Collaboration",
        prompt:
          "Prepare one real example where you worked with others and can clearly explain your own contribution.",
      },
      {
        competency: "Learning agility",
        prompt:
          "Prepare one example of learning a new tool, process, or subject quickly.",
      },
      {
        competency: "Ownership",
        prompt:
          "Prepare one example where you took responsibility for moving a task or project forward.",
      },
    ],
    riskAreas: [
      {
        area: "Answers becoming too generic",
        preparation:
          "Anchor important answers in specific real examples rather than only describing your personality.",
      },
      {
        area: "Weak role motivation",
        preparation:
          `Be ready to explain why this specific ${jobTitle} opportunity and ${companyName} interest you.`,
      },
      {
        area: "Unstructured behavioural answers",
        preparation:
          "Use Situation, Task, Action, and Result to keep examples concise and easy to follow.",
      },
    ],
    questionsToAsk: [
      `What would success look like for someone in this ${jobTitle} role during the first few months?`,
      "What kinds of projects or responsibilities would I likely work on?",
      "What distinguishes people who perform especially well on this team?",
      "How does the team usually give feedback and support development?",
      "What are the next steps in the interview process?",
    ],
  };
}

export const Route = createFileRoute("/api/interview-prep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = RequestSchema.safeParse(await request.json());

          if (!parsed.success) {
            return Response.json(
              { error: "Invalid input." },
              { status: 400 },
            );
          }

          const key = process.env.LOVABLE_API_KEY;

          if (!key) {
            const upstream = await fetch(
              "https://joblens-ai-fit-finder.lovable.app/api/interview-prep",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify(parsed.data),
              },
            );

            if (!upstream.ok) {
              return Response.json(
                buildFallbackPrep(
                  parsed.data.jobTitle,
                  parsed.data.companyName,
                ),
                {
                  headers: {
                    "cache-control": "no-store",
                    "x-joblens-interview-prep": "fallback",
                  },
                },
              );
            }

            return new Response(await upstream.text(), {
              status: upstream.status,
              headers: {
                "content-type":
                  upstream.headers.get("content-type") ??
                  "application/json",
                "cache-control": "no-store",
                "x-joblens-interview-prep":
                  upstream.headers.get(
                    "x-joblens-interview-prep",
                  ) ?? "ai",
              },
            });
          }

          const gateway = createLovableAiGatewayProvider(key);
          const model = gateway("google/gemini-3-flash-preview");

          const { jobTitle, companyName, jobDescription, notes } =
            parsed.data;

          const system = `You are JobLens AI Interview Coach.

Prepare practical interview guidance for a job candidate.

STRICT GROUNDING RULES:
- Never invent candidate experience, skills, education, achievements, employers, projects or metrics.
- The candidate CV is NOT available in this request.
- STAR items must therefore be prompts that help the candidate choose a real example from their own experience, not fabricated answers.
- Use ONLY the supplied job title, company name, job description and application notes as factual sources.
- The company name is an identifier, NOT permission to use outside or prior knowledge about that company.
- Never infer or assert company values, culture, business units, products, industries, strategy, sustainability commitments, reputation, interview process or hiring preferences unless that information is explicitly present in the supplied job description or notes.
- If job description or notes are missing, keep company-specific guidance generic. You may suggest questions the candidate can ask to learn unknown information, but do not present unknown information as fact.
- Do not use phrases such as "the company values", "the company is known for", "their commitment to", or equivalent unless the supplied text directly supports the claim.
- Be concise, specific and useful while staying within the supplied evidence.
- Output valid JSON only.`;

          const prompt = `JOB TITLE: ${jobTitle}
COMPANY: ${companyName}

JOB DESCRIPTION:
${jobDescription || "(not available)"}

APPLICATION NOTES:
${notes || "(none)"}

Create an interview preparation pack matching exactly:

{
  "introStrategy": string,
  "likelyQuestions": [
    {
      "question": string,
      "whyItMayBeAsked": string,
      "answerDirection": string
    }
  ],
  "starPrompts": [
    {
      "competency": string,
      "prompt": string
    }
  ],
  "riskAreas": [
    {
      "area": string,
      "preparation": string
    }
  ],
  "questionsToAsk": string[]
}

Requirements:
- introStrategy: guidance for a strong 30-45 second introduction without inventing candidate facts.
- likelyQuestions: 5-7 role-relevant questions.
- starPrompts: 4-5 prompts.
- riskAreas: 2-4 preparation risks.
- questionsToAsk: 4-5 intelligent questions for the interviewer.`;

          const { text } = await generateText({
            model,
            system,
            prompt,
          });

          const cleaned = text
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/i, "")
            .trim();

          const start = cleaned.indexOf("{");
          const end = cleaned.lastIndexOf("}");

          const jsonText =
            start >= 0 && end >= start
              ? cleaned.slice(start, end + 1)
              : cleaned;

          const result = InterviewPrepSchema.safeParse(
            JSON.parse(jsonText),
          );

          if (!result.success) {
            console.error(
              "[JobLens Interview Prep] Schema validation failed:",
              result.error,
            );

            return Response.json(
              { error: "generation_failed" },
              { status: 500 },
            );
          }

          return Response.json(result.data, {
            headers: {
              "cache-control": "no-store",
              "x-joblens-interview-prep": "ai",
            },
          });
        } catch (error) {
          console.error("[JobLens Interview Prep] Error:", error);

          return Response.json(
            { error: "generation_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
