import { api } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SITE_TITLE = "Kiri 的博客";
const SITE_DESC = "一个用 Next.js + Go 搭建的个人博客系统";
const AUTHOR = "Kiri";

export const revalidate = 600;

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string) {
  return s.replaceAll("]]>", "]]]]><![CDATA[>");
}

export async function GET() {
  let items: Awaited<ReturnType<typeof api.listPosts>>["items"] = [];
  try {
    const resp = await api.listPosts({ size: 50 });
    items = resp.items;
  } catch {
    /* empty feed on failure */
  }

  const entries = items
    .map((p) => {
      const url = `${SITE_URL}/posts/${p.slug}`;
      const published = new Date(p.publishedAt ?? p.createdAt).toISOString();
      const updated = new Date(p.updatedAt ?? p.createdAt).toISOString();
      const summary = p.summary ?? "";
      return `  <entry>
    <id>${url}</id>
    <title>${escape(p.title)}</title>
    <link rel="alternate" href="${url}"/>
    <published>${published}</published>
    <updated>${updated}</updated>
    <author><name>${escape(AUTHOR)}</name></author>
    ${p.tags?.map((t) => `<category term="${escape(t)}"/>`).join("\n    ") ?? ""}
    <summary type="html"><![CDATA[${cdata(summary)}]]></summary>
  </entry>`;
    })
    .join("\n");

  const lastUpdated =
    items[0]?.updatedAt ?? items[0]?.createdAt ?? new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <title>${escape(SITE_TITLE)}</title>
  <subtitle>${escape(SITE_DESC)}</subtitle>
  <id>${SITE_URL}/</id>
  <link rel="self" href="${SITE_URL}/feed.xml"/>
  <link rel="alternate" href="${SITE_URL}/"/>
  <updated>${new Date(lastUpdated).toISOString()}</updated>
  <author><name>${escape(AUTHOR)}</name></author>
${entries}
</feed>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "cache-control":
        "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
