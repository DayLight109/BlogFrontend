import type { Metadata } from "next";

import { api } from "@/lib/api";
import type { Post } from "@/lib/types";
import { Rule } from "@/components/site/rule";
import { TransitionLink } from "@/components/site/transition-link";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Archive",
  description: "Every published essay, grouped by year.",
};

function monthDay(iso: string) {
  const d = new Date(iso);
  return {
    m: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
    d: String(d.getDate()).padStart(2, "0"),
  };
}

export default async function ArchivePage() {
  let years: { year: number; posts: Post[] }[] = [];
  try {
    const data = await api.getArchive();
    years = data?.items ?? [];
  } catch {
    years = [];
  }
  const total = years.reduce((n, y) => n + y.posts.length, 0);

  return (
    <div className="mx-auto max-w-[68rem] px-6 md:px-10">
      <header className="pb-10 pt-16 md:pt-28">
        <div className="reveal max-w-[46rem]">
          <div className="caps mb-6 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            Archive
            <span className="opacity-60" aria-hidden>
              · 归档
            </span>
          </div>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.025em]">
            All essays,{" "}
            <span className="italic font-light">
              quietly kept.
            </span>
          </h1>
          <p className="mt-6 font-reading text-lg text-muted-foreground">
            {total} {total === 1 ? "essay" : "essays"} across{" "}
            {years.length} {years.length === 1 ? "year" : "years"}.
          </p>
        </div>
      </header>

      <Rule variant="line" />

      <section className="py-10 md:py-16">
        {years.length === 0 ? (
          <p className="font-display py-20 text-center text-2xl italic text-muted-foreground">
            Nothing archived yet.
          </p>
        ) : (
          <div className="space-y-16 md:space-y-24">
            {years.map((entry) => (
              <section key={entry.year} className="md:grid md:grid-cols-[10rem_1fr] md:gap-10">
                <h2
                  className="font-display text-[clamp(3rem,8vw,5.5rem)] font-light leading-none tracking-tighter text-site-accent md:sticky md:top-8 md:self-start"
                >
                  <span className="tabular">{entry.year}</span>
                </h2>
                <ol className="mt-6 divide-y divide-site-rule/70 md:mt-0">
                  {entry.posts.map((p) => {
                    const md = monthDay(p.publishedAt ?? p.createdAt);
                    return (
                      <li key={p.id} className="group">
                        <TransitionLink
                          href={`/posts/${p.slug}`}
                          className="block py-5 md:grid md:grid-cols-[5rem_1fr] md:items-baseline md:gap-6 md:py-6"
                        >
                          <span className="caps tabular mb-2 block text-muted-foreground md:mb-0">
                            {md.m} {md.d}
                          </span>
                          <div className="space-y-1">
                            <h3 className="title-hover-underline font-display text-xl font-medium leading-tight tracking-[-0.015em] transition-colors duration-300 group-hover:text-site-accent md:text-2xl">
                              {p.title}
                            </h3>
                            {p.tags && p.tags.length > 0 && (
                              <p className="caps text-muted-foreground/80">
                                {p.tags.map((t, i) => (
                                  <span key={t}>
                                    {i > 0 && (
                                      <span className="mx-1.5 opacity-40">
                                        /
                                      </span>
                                    )}
                                    {t}
                                  </span>
                                ))}
                              </p>
                            )}
                          </div>
                        </TransitionLink>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
