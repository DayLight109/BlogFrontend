import type { Metadata } from "next";

import { api } from "@/lib/api";
import { Rule } from "@/components/site/rule";
import { TransitionLink } from "@/components/site/transition-link";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Tags",
  description: "All tags used across essays on this blog.",
};

export default async function TagsIndexPage() {
  let items: { tag: string; count: number }[] = [];
  try {
    const data = await api.listTags();
    items = data?.items ?? [];
  } catch {
    items = [];
  }

  const max = items.reduce((m, t) => Math.max(m, t.count), 1);

  return (
    <div className="mx-auto max-w-[68rem] px-6 md:px-10">
      <header className="pb-10 pt-16 md:pt-28">
        <div className="reveal max-w-[46rem]">
          <div className="caps mb-6 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            Tags
            <span className="opacity-60" aria-hidden>
              · 标签
            </span>
          </div>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.025em]">
            What I{" "}
            <span className="italic font-light">write</span>{" "}
            about.
          </h1>
        </div>
      </header>

      <Rule variant="line" />

      <section className="py-12 md:py-16">
        {items.length === 0 ? (
          <p className="font-display py-20 text-center text-2xl italic text-muted-foreground">
            No tags yet.
          </p>
        ) : (
          <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-5">
            {items.map((t) => {
              // Scale font size by weight of tag (more posts → bigger).
              const weight = 0.35 + (t.count / max) * 0.65; // 0.35 — 1.0
              const size = `clamp(1.1rem, ${1.1 + weight * 1.6}vw, ${1.4 + weight * 1.8}rem)`;
              return (
                <li key={t.tag}>
                  <TransitionLink
                    href={`/tags/${encodeURIComponent(t.tag)}`}
                    className="group inline-flex items-baseline gap-2 text-foreground transition-colors hover:text-site-accent"
                  >
                    <span
                      className="font-display font-medium tracking-[-0.015em] title-hover-underline"
                      style={{ fontSize: size }}
                    >
                      {t.tag}
                    </span>
                    <span className="caps tabular text-muted-foreground">
                      {String(t.count).padStart(2, "0")}
                    </span>
                  </TransitionLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
