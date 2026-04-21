export interface TocHeading {
  id: string;
  level: 2 | 3;
  text: string;
}

/**
 * Extract h2/h3 headings from the server-rendered post HTML.
 * The goldmark AutoHeadingID extension has already added `id="..."`
 * attributes, so we can rely on them.
 */
export function extractToc(html: string): TocHeading[] {
  const out: TocHeading[] = [];
  const re = /<(h2|h3)(?:\s+id="([^"]+)")?[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1] as "h2" | "h3";
    const id = m[2];
    if (!id) continue;
    const text = m[3].replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    out.push({ id, level: tag === "h2" ? 2 : 3, text });
  }
  return out;
}
