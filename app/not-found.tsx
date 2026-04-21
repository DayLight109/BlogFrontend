import Link from "next/link";

import { Rule } from "@/components/site/rule";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-24">
      <div className="max-w-xl text-center">
        <p className="caps mb-6 text-muted-foreground">
          404{" "}
          <span className="opacity-60" aria-hidden>
            · 迷路了
          </span>
        </p>

        <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] font-medium leading-[1.04] tracking-[-0.025em]">
          This page has wandered{" "}
          <span className="italic text-site-accent">off.</span>
        </h1>

        <p className="font-reading mx-auto mt-8 max-w-md text-lg leading-[1.78] text-muted-foreground">
          要么链接失效了,要么你正在寻找一篇还没发表的文章。返回首页或去归档里看看。
        </p>

        <div className="my-10">
          <Rule variant="asterism" />
        </div>

        <div className="flex items-center justify-center gap-8">
          <Link
            href="/"
            className="caps group inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:-translate-x-0.5"
            >
              ←
            </span>
            Back to index
          </Link>
          <Link
            href="/archive"
            className="caps group inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            Archive
            <span
              aria-hidden
              className="transition-transform duration-300 group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
