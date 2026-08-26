import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  extractJobFromHtml,
  parsePublicJobUrl,
} from "@/lib/job-url-import";

const RequestSchema = z.object({
  url: z.string().min(1).max(2048),
});

const MAX_PAGE_SIZE = 2_000_000;
const MAX_REDIRECTS = 4;

async function fetchPublicJobPage(
  initialUrl: URL,
): Promise<{
  html: string;
  finalUrl: string;
}> {
  let currentUrl = initialUrl;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const response = await fetch(currentUrl.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept:
          "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "user-agent":
          "Mozilla/5.0 (compatible; JobLensAI/1.0; +https://www.getjoblensai.com)",
      },
    });

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      const location = response.headers.get("location");

      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("redirect_failed");
      }

      currentUrl = parsePublicJobUrl(
        new URL(location, currentUrl).toString(),
      );

      continue;
    }

    if (!response.ok) {
      throw new Error(`upstream_${response.status}`);
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";

    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      throw new Error("not_html");
    }

    const declaredLength = Number(
      response.headers.get("content-length") ?? "0",
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_PAGE_SIZE
    ) {
      throw new Error("page_too_large");
    }

    const html = await response.text();

    if (html.length > MAX_PAGE_SIZE) {
      throw new Error("page_too_large");
    }

    return {
      html,
      finalUrl: currentUrl.toString(),
    };
  }

  throw new Error("redirect_failed");
}

export const Route = createFileRoute("/api/job-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = RequestSchema.safeParse(
            await request.json(),
          );

          if (!parsed.success) {
            return Response.json(
              {
                error: "invalid_url",
                message: "Enter a valid public job URL.",
              },
              { status: 400 },
            );
          }

          let url: URL;

          try {
            url = parsePublicJobUrl(parsed.data.url);
          } catch {
            return Response.json(
              {
                error: "invalid_url",
                message: "Enter a valid public job URL.",
              },
              { status: 400 },
            );
          }

          const page = await fetchPublicJobPage(url);
          const extracted = extractJobFromHtml(page.html);

          if (!extracted) {
            return Response.json(
              {
                error: "could_not_extract",
                message:
                  "JobLens could not find enough readable job information on this page. Paste the job description manually instead.",
              },
              { status: 422 },
            );
          }

          return Response.json(
            {
              url: page.finalUrl,
              ...extracted,
            },
            {
              headers: {
                "cache-control": "no-store",
              },
            },
          );
        } catch (error) {
          console.error(
            "[JobLens Job Import] Could not import job page:",
            error,
          );

          return Response.json(
            {
              error: "could_not_access",
              message:
                "JobLens could not access this job page. Some sites require login or block automated access. Paste the job description manually instead.",
            },
            { status: 422 },
          );
        }
      },
    },
  },
});
