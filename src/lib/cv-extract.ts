// Client-only CV text extraction utilities.
// Lazy-imported so heavy parsers (pdfjs, mammoth) never load on initial render
// and never run during SSR.

export type CvFileKind = "pdf" | "docx" | "txt";

export const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

export function detectKind(file: File): CvFileKind | null {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (name.endsWith(".txt") || type === "text/plain") return "txt";
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  return null;
}

function cleanWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractTxt(file: File): Promise<string> {
  return cleanWhitespace(await file.text());
}

async function extractDocx(file: File): Promise<string> {
  // @ts-expect-error - no types for browser build
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return cleanWhitespace(result.value || "");
}

async function extractPdf(file: File): Promise<string> {
  // @ts-expect-error - pdfjs-dist ships its own types differently
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as Array<{ str: string; transform?: number[] }>) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        if (line.trim()) lines.push(line.trim());
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join("\n"));
  }
  return cleanWhitespace(pages.join("\n\n"));
}

export class CvExtractError extends Error {
  code: "type" | "size" | "empty" | "scanned" | "read";
  constructor(code: CvExtractError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function extractCvText(file: File): Promise<string> {
  if (file.size === 0) {
    throw new CvExtractError(
      "empty",
      "We couldn’t read this CV. Please try another file or paste the CV text manually.",
    );
  }
  if (file.size > MAX_CV_BYTES) {
    throw new CvExtractError("size", "Your CV file must be smaller than 5 MB.");
  }
  const kind = detectKind(file);
  if (!kind) {
    throw new CvExtractError("type", "Please upload a PDF, DOCX, or TXT file.");
  }

  let text = "";
  try {
    if (kind === "txt") text = await extractTxt(file);
    else if (kind === "docx") text = await extractDocx(file);
    else text = await extractPdf(file);
  } catch {
    throw new CvExtractError(
      "read",
      "We couldn’t read this CV. Please try another file or paste the CV text manually.",
    );
  }

  if (kind === "pdf" && text.replace(/\s+/g, "").length < 40) {
    throw new CvExtractError(
      "scanned",
      "This PDF may be scanned or image-based. Please upload a text-based CV or paste the CV text manually.",
    );
  }
  if (!text || text.replace(/\s+/g, "").length === 0) {
    throw new CvExtractError(
      "empty",
      "We couldn’t read this CV. Please try another file or paste the CV text manually.",
    );
  }
  return text;
}
