import type { Metadata } from "next";

import { Rule } from "@/components/site/rule";
import { SearchInterface } from "./search-interface";

export const metadata: Metadata = {
  title: "Search",
  description: "Full-text search across all essays.",
};

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-[68rem] px-6 md:px-10">
      <header className="pb-10 pt-16 md:pt-28">
        <div className="reveal max-w-[46rem]">
          <div className="caps mb-6 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            Search
            <span className="opacity-60" aria-hidden>
              · 搜索
            </span>
          </div>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.5rem)] font-medium leading-[1.05] tracking-[-0.025em]">
            Looking for{" "}
            <span className="italic font-light">something</span>
            <span className="text-site-accent">?</span>
          </h1>
        </div>
      </header>

      <Rule variant="line" />

      <SearchInterface />
    </div>
  );
}
