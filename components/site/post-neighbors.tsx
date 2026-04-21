import { ArrowLeft, ArrowRight } from "lucide-react";

import { api } from "@/lib/api";
import { TransitionLink } from "@/components/site/transition-link";

export async function PostNeighbors({ slug }: { slug: string }) {
  const { prev, next } = await api.getNeighbors(slug);
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Post navigation"
      className="grid gap-6 md:grid-cols-2"
    >
      {prev ? (
        <TransitionLink
          href={`/posts/${prev.slug}`}
          className="group block rounded-sm border border-site-rule/70 bg-card/60 p-5 transition-[border-color,background-color,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-site-accent/60 hover:bg-card"
        >
          <p className="caps mb-3 flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-site-accent">
            <ArrowLeft
              className="size-3.5 transition-transform group-hover:-translate-x-0.5"
              strokeWidth={1.6}
            />
            Previous
          </p>
          <p className="font-display text-lg font-medium leading-snug tracking-[-0.015em] text-foreground group-hover:text-site-accent transition-colors">
            {prev.title}
          </p>
        </TransitionLink>
      ) : (
        <div className="hidden md:block" aria-hidden />
      )}

      {next ? (
        <TransitionLink
          href={`/posts/${next.slug}`}
          className="group block rounded-sm border border-site-rule/70 bg-card/60 p-5 text-right transition-[border-color,background-color,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-site-accent/60 hover:bg-card"
        >
          <p className="caps mb-3 flex items-center justify-end gap-2 text-muted-foreground transition-colors group-hover:text-site-accent">
            Next
            <ArrowRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.6}
            />
          </p>
          <p className="font-display text-lg font-medium leading-snug tracking-[-0.015em] text-foreground group-hover:text-site-accent transition-colors">
            {next.title}
          </p>
        </TransitionLink>
      ) : (
        <div className="hidden md:block" aria-hidden />
      )}
    </nav>
  );
}
