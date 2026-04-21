import { codeToHtml } from "shiki";

const FENCE_RE =
  /<pre><code(?:\s+class="language-([a-zA-Z0-9_+-]+)")?>([\s\S]*?)<\/code><\/pre>/g;

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

const SUPPORTED = new Set([
  "typescript",
  "ts",
  "tsx",
  "javascript",
  "js",
  "jsx",
  "go",
  "rust",
  "python",
  "py",
  "bash",
  "sh",
  "shell",
  "zsh",
  "json",
  "yaml",
  "yml",
  "toml",
  "html",
  "css",
  "scss",
  "sql",
  "md",
  "markdown",
  "mdx",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "cs",
  "php",
  "ruby",
  "rb",
  "dockerfile",
  "diff",
  "text",
  "plaintext",
  "txt",
]);

/**
 * Replace each <pre><code class="language-xxx">…</code></pre> block in the
 * post HTML with a Shiki-highlighted version that carries both light & dark
 * theme tokens via CSS variables. The surrounding host CSS switches between
 * them based on `.dark` class on <html>.
 *
 * Runs at SSR / ISR time. No client-side JS, no extra bundle.
 */
export async function highlightCodeBlocks(html: string): Promise<string> {
  if (!html || !/<pre><code/.test(html)) return html;

  const matches: {
    full: string;
    lang: string;
    code: string;
  }[] = [];

  html.replace(FENCE_RE, (full, lang: string | undefined, code: string) => {
    const normalized = (lang ?? "text").toLowerCase();
    matches.push({
      full,
      lang: SUPPORTED.has(normalized) ? normalized : "text",
      code: decodeHtml(code),
    });
    return full;
  });

  if (!matches.length) return html;

  const highlighted = await Promise.all(
    matches.map(({ lang, code }) =>
      codeToHtml(code, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: false,
      }),
    ),
  );

  let i = 0;
  return html.replace(FENCE_RE, () => {
    const h = highlighted[i] ?? matches[i].full;
    const langTag = matches[i].lang;
    i++;
    // Wrap with a figure so we can add a language badge + (future) copy button.
    return `<figure data-lang="${langTag}" class="code-block">${h}</figure>`;
  });
}
