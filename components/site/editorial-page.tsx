import type { ReactNode } from "react";

import { Rule } from "./rule";

type Props = {
  eyebrow: string;
  eyebrowZh: string;
  heroTitle: string;
  bodyHtml: string;
  emptyText?: string;
  children?: ReactNode;
};

export function EditorialPage({
  eyebrow,
  eyebrowZh,
  heroTitle,
  bodyHtml,
  emptyText = "Nothing to share at the moment.",
  children,
}: Props) {
  return (
    <div className="mx-auto max-w-[48rem] px-6 md:px-10">
      <header className="pt-16 md:pt-28">
        <div className="reveal">
          <div className="caps mb-6 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            {eyebrow}
            <span className="opacity-60" aria-hidden>
              · {eyebrowZh}
            </span>
          </div>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.025em]">
            {heroTitle}
          </h1>
        </div>
      </header>

      <div className="my-12 md:my-16">
        <Rule variant="line" />
      </div>

      {bodyHtml ? (
        <article
          className="reveal prose-editorial"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : (
        <p className="font-reading italic text-muted-foreground">
          {emptyText}
        </p>
      )}

      {children}
    </div>
  );
}
