import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import { Rule } from "@/components/site/rule";
import { TransitionLink } from "@/components/site/transition-link";

export const revalidate = 60;

export async function generateMetadata(
  props: PageProps<"/tags/[tag]">,
): Promise<Metadata> {
  const { tag } = await props.params;
  const decoded = decodeURIComponent(tag);
  return {
    title: `Tagged “${decoded}”`,
    description: `All essays filed under ${decoded}.`,
  };
}

function formatMonthDay(iso: string) {
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    year: d.getFullYear(),
  };
}

export default async function TagPage(props: PageProps<"/tags/[tag]">) {
  const { tag } = await props.params;
  const decoded = decodeURIComponent(tag);

  let posts: Awaited<ReturnType<typeof api.listPosts>>["items"] = [];
  let allTags: { tag: string; count: number }[] = [];
  try {
    const [a, b] = await Promise.all([
      api.listPosts({ tag: decoded, size: 100 }),
      api.listTags(),
    ]);
    posts = a?.items ?? [];
    allTags = b?.items ?? [];
  } catch {
    /* fall through with empty lists */
  }

  const exists = allTags.some((t) => t.tag === decoded);
  if (!exists && posts.length === 0) notFound();

  return (
    <div className="mx-auto max-w-[68rem] px-6 md:px-10">
      <header className="pb-12 pt-16 md:pb-20 md:pt-28">
        <div className="reveal max-w-[46rem]">
          <div className="caps mb-6 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            <TransitionLink href="/" className="hover:text-foreground transition-colors">
              Index
            </TransitionLink>
            <span className="opacity-50" aria-hidden>
              /
            </span>
            <span>Tag</span>
          </div>

          <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.025em] text-foreground">
            “<span className="italic text-site-accent">{decoded}</span>”
          </h1>

          <p className="mt-6 font-reading text-lg leading-[1.78] text-muted-foreground">
            {posts.length} {posts.length === 1 ? "essay" : "essays"} filed under this tag.
          </p>
        </div>
      </header>

      <Rule variant="line" />

      <section className="py-10 md:py-16">
        {posts.length === 0 ? (
          <p className="font-display py-20 text-center text-2xl italic text-muted-foreground">
            Nothing filed here yet.
          </p>
        ) : (
          <ol className="divide-y divide-site-rule/70">
            {posts.map((post, i) => {
              const d = formatMonthDay(post.publishedAt ?? post.createdAt);
              return (
                <li key={post.id} className="group">
                  <TransitionLink
                    href={`/posts/${post.slug}`}
                    className="block py-7 md:grid md:grid-cols-[9rem_1fr] md:items-baseline md:gap-10 md:py-8"
                  >
                    <div className="caps mb-3 flex items-baseline gap-4 text-muted-foreground md:mb-0 md:flex-col md:items-start md:gap-1">
                      <span className="tabular text-foreground/60 transition-colors duration-300 group-hover:text-site-accent">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="tabular">
                        {d.month}&nbsp;{d.day},&nbsp;{d.year}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <h2 className="title-hover-underline font-display text-[clamp(1.35rem,2.4vw,1.8rem)] font-medium leading-[1.2] tracking-[-0.015em] text-foreground transition-colors duration-300 group-hover:text-site-accent">
                        {post.title}
                      </h2>
                      {post.summary && (
                        <p className="font-reading text-muted-foreground">
                          {post.summary}
                        </p>
                      )}
                    </div>
                  </TransitionLink>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
