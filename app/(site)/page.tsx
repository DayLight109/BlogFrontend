import { Pin } from "lucide-react";

import { api } from "@/lib/api";
import type { Post } from "@/lib/types";
import { Rule } from "@/components/site/rule";
import { TransitionLink } from "@/components/site/transition-link";

export const revalidate = 60;

function formatMonthDayYear(iso: string) {
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    year: d.getFullYear(),
  };
}

export default async function HomePage() {
  let posts: Post[] = [];
  try {
    const data = await api.listPosts({ size: 30 });
    posts = data?.items ?? [];
  } catch {
    posts = [];
  }

  return (
    <div className="mx-auto max-w-[68rem] px-6 md:px-10">
      {/* Hero / manifesto ------------------------------------------------ */}
      <section className="pb-14 pt-16 md:pb-24 md:pt-28">
        <div className="reveal max-w-[46rem]">
          <div className="caps mb-8 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            <span>A Journal</span>
            <span className="opacity-60" aria-hidden>
              · 志
            </span>
          </div>

          <h1 className="font-display text-[clamp(2.6rem,7vw,5.25rem)] font-normal leading-[1.02] tracking-[-0.025em] text-foreground">
            Writing about{" "}
            <span className="italic font-light">code</span>,{" "}
            <br className="hidden md:inline" />
            <span className="italic font-light">systems</span>, and the small
            ideas <span className="text-site-accent">in between.</span>
          </h1>

          <p className="mt-8 max-w-xl font-reading text-lg leading-[1.78] text-muted-foreground md:text-xl">
            这里是 Kiri 的一隅 ——{" "}
            <span className="italic">关于工程、阅读,和那些值得慢慢写下的东西。</span>
            {" "}Updates arrive when they are ready; nothing is published in a hurry.
          </p>
        </div>
      </section>

      <Rule variant="line" />

      {/* Essay index ----------------------------------------------------- */}
      <section className="py-12 md:py-16">
        <div className="mb-10 flex items-baseline justify-between">
          <h2 className="caps text-foreground">
            Essays{" "}
            <span className="font-display normal-case text-foreground/70 italic tracking-normal">
              · 文稿
            </span>
          </h2>
          <span className="caps tabular text-muted-foreground">
            <span className="text-foreground/80">
              {String(posts.length).padStart(2, "0")}
            </span>
            <span className="mx-1.5 opacity-40" aria-hidden>
              /
            </span>
            <span>{String(posts.length).padStart(2, "0")}</span>
          </span>
        </div>

        {posts.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-display text-3xl italic text-muted-foreground">
              The page is still blank.
            </p>
            <p className="caps mt-4 text-muted-foreground/80">
              — 未有文章
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-site-rule/70">
            {posts.map((post, i) => {
              const d = formatMonthDayYear(post.publishedAt ?? post.createdAt);
              return (
                <li key={post.id} className="group">
                  <TransitionLink
                    href={`/posts/${post.slug}`}
                    className="reveal relative block py-8 md:grid md:grid-cols-[9rem_1fr_auto] md:items-baseline md:gap-10 md:py-10"
                    style={{ animationDelay: `${Math.min(i * 70, 420)}ms` }}
                  >
                    {/* Number + date column */}
                    <div className="caps mb-4 flex items-baseline gap-4 text-muted-foreground md:mb-0 md:flex-col md:items-start md:gap-1">
                      <span className="tabular text-foreground/60 transition-colors duration-300 group-hover:text-site-accent">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="tabular">
                        {d.month}&nbsp;{d.day},&nbsp;{d.year}
                      </span>
                      {post.pinned && (
                        <span
                          className="inline-flex items-center gap-1 text-site-accent"
                          title="Pinned"
                        >
                          <Pin className="size-3" strokeWidth={1.8} />
                          <span className="normal-case tracking-normal italic text-site-accent/90 font-reading text-[0.7rem]">
                            pinned
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Main */}
                    <div className="space-y-3">
                      <h3
                        className="title-hover-underline font-display text-[clamp(1.55rem,2.8vw,2.1rem)] font-medium leading-[1.15] tracking-[-0.018em] text-foreground transition-colors duration-300 group-hover:text-site-accent"
                        style={{ viewTransitionName: `post-title-${post.id}` }}
                      >
                        {post.title}
                      </h3>

                      {post.summary && (
                        <p className="font-reading text-[1.05rem] leading-relaxed text-muted-foreground md:text-[1.1rem]">
                          {post.summary}
                        </p>
                      )}

                      {post.tags && post.tags.length > 0 && (
                        <div className="caps flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-muted-foreground/80">
                          {post.tags.map((t, idx) => (
                            <span
                              key={`${t}-${idx}`}
                              className="inline-flex items-baseline"
                            >
                              {idx > 0 && (
                                <span
                                  className="mr-3 opacity-40"
                                  aria-hidden
                                >
                                  /
                                </span>
                              )}
                              <span className="transition-colors duration-300 group-hover:text-muted-foreground">
                                {t}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Meta column */}
                    <div className="caps mt-4 flex items-baseline gap-2 whitespace-nowrap text-muted-foreground md:mt-0 md:flex-col md:items-end md:gap-1.5">
                      <span className="tabular">
                        {post.viewCount}{" "}
                        {post.viewCount === 1 ? "read" : "reads"}
                      </span>
                      <span
                        className="tabular inline-flex -translate-x-2 items-center gap-1 text-site-accent opacity-0 transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0 group-hover:opacity-100"
                        aria-hidden
                      >
                        <span>read</span>
                        <span>→</span>
                      </span>
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
