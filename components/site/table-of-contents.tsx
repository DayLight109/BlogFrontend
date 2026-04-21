"use client";

import { useEffect, useState } from "react";

import type { TocHeading } from "@/lib/toc";

export function TableOfContents({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string | null>(
    headings[0]?.id ?? null,
  );

  useEffect(() => {
    if (headings.length === 0) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the first heading whose top has crossed the threshold line.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Trigger when a heading is roughly in the top third of the viewport.
        rootMargin: "-10% 0px -70% 0px",
        threshold: 0,
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="sticky top-10 hidden max-h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto pl-6 xl:block"
    >
      <p className="caps mb-4 flex items-center gap-2.5 text-muted-foreground">
        <span className="h-px w-5 bg-site-accent" aria-hidden />
        On this page
      </p>
      <ol className="space-y-2 text-sm">
        {headings.map((h) => {
          const isActive = h.id === activeId;
          return (
            <li
              key={h.id}
              className={h.level === 3 ? "pl-4" : ""}
            >
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(h.id);
                  if (!el) return;
                  const top = el.getBoundingClientRect().top + window.scrollY - 24;
                  window.scrollTo({ top, behavior: "smooth" });
                  history.replaceState(null, "", `#${h.id}`);
                  setActiveId(h.id);
                }}
                className={`toc-link group relative flex items-baseline gap-2 py-0.5 font-reading leading-snug transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-active={isActive || undefined}
              >
                <span
                  aria-hidden
                  className={`mt-2 h-px shrink-0 bg-current transition-all duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isActive ? "w-4 bg-site-accent" : "w-2 opacity-60"
                  }`}
                />
                <span className="line-clamp-2">{h.text}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
