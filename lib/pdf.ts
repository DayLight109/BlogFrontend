// Client-only PDF text extraction. We pull pdfjs-dist's legacy ESM build so
// the same worker entry resolves under Next.js 16's webpack and Turbopack.
//
// Why client-only:
//   1. The plan's PDF decision was "客户端 pdf.js" — server stays free of
//      a Go PDF dependency.
//   2. pdfjs runs an off-main-thread worker via Web Worker so a 50-page PDF
//      doesn't pin the UI thread.
//
// Notes:
//   - We dynamic-import on first use so the (huge) pdfjs bundle isn't pulled
//     into the initial chat page payload.
//   - Worker URL is resolved through `new URL(...)` so the bundler emits a
//     hashed worker file and rewrites the path at build time.
//   - Output is best-effort plaintext: every page's text items joined by
//     spaces, pages joined by newlines.

const PDF_MAX_BYTES = 16 * 1024 * 1024; // 16 MB hard cap before we even open it
const PDF_MAX_CHARS = 50_000; // truncate at this many chars
const PDF_MAX_PAGES = 200;

export class PdfExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractError";
  }
}

let workerInited = false;

async function ensureWorker(pdfjs: typeof import("pdfjs-dist")) {
  if (workerInited) return;
  // Resolve through `new URL` so webpack/Turbopack emits the worker file and
  // rewrites the path. Module-type worker is required by pdfjs >= 5.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  workerInited = true;
}

export async function extractPdfText(file: File): Promise<string> {
  if (typeof window === "undefined") {
    throw new PdfExtractError("PDF extraction must run in the browser");
  }
  if (file.size > PDF_MAX_BYTES) {
    throw new PdfExtractError(
      `PDF is over ${(PDF_MAX_BYTES / 1024 / 1024) | 0} MB; please trim it first.`,
    );
  }
  // Dynamic import keeps the heavy bundle out of first-paint.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  await ensureWorker(pdfjs);

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // Disable the font fetch — we don't render anything, just extract text.
    disableFontFace: true,
  });

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    throw new PdfExtractError(
      err instanceof Error ? err.message : "Failed to open PDF",
    );
  }

  const pages = Math.min(doc.numPages, PDF_MAX_PAGES);
  const out: string[] = [];
  let charCount = 0;
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // tc.items is a heterogeneous array — TextItem has `.str`, TextMarkedContent
    // doesn't. Filter to TextItems only.
    const text = tc.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      out.push(text);
      charCount += text.length + 1;
      if (charCount >= PDF_MAX_CHARS) {
        out.push(`\n[…truncated at ${PDF_MAX_CHARS} chars]`);
        break;
      }
    }
  }
  // Cleanup — pdfjs holds onto a worker; explicitly destroy so memory frees.
  void doc.destroy().catch(() => {});

  return out.join("\n\n");
}

export const PDF_LIMITS = {
  maxBytes: PDF_MAX_BYTES,
  maxChars: PDF_MAX_CHARS,
  maxPages: PDF_MAX_PAGES,
};
