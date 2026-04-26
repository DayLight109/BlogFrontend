import Link from "next/link";
import type { ReactNode } from "react";
import { Search as SearchIcon } from "lucide-react";

import { api } from "@/lib/api";
import type { SiteSettings } from "@/lib/types";
import { NavLink } from "@/components/site/nav-link";
import { ThemeToggle } from "@/components/site/theme-toggle";

const defaults: SiteSettings = {
  brand: { name: "Kiri", tagline: "· notes & essays" },
  footer: { text: "Written in a quiet corner of the internet · 独立写作" },
  contact: { email: "hello@example.com", github: "https://github.com/kiri" },
  seo: { siteTitle: "Kiri · Notes", siteDescription: "" },
  about: { heroTitle: "", bodyHtml: "" },
  now: { heroTitle: "", bodyHtml: "" },
  uses: { heroTitle: "", bodyHtml: "" },
  colophon: { heroTitle: "", bodyHtml: "" },
  theme: { accent: "#9a2e20", accentDark: "#d8715e" },
};

export default async function SiteLayout({ children }: { children: ReactNode }) {
  let settings: SiteSettings = defaults;
  try {
    settings = (await api.getSettings()) ?? defaults;
  } catch {
    settings = defaults;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative">
        <div className="mx-auto flex max-w-[68rem] items-center justify-between gap-6 px-6 py-5 md:px-10 md:py-7">
          <Link
            href="/"
            className="group inline-flex items-baseline gap-2.5"
            aria-label="Home"
          >
            <span className="font-display text-xl font-medium leading-none tracking-tight text-foreground md:text-[1.7rem]">
              {settings.brand.name}
            </span>
            {settings.brand.tagline && (
              <span className="font-display hidden text-sm italic text-muted-foreground transition-[letter-spacing,color] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:tracking-[0.04em] group-hover:text-site-accent sm:inline">
                {settings.brand.tagline}
              </span>
            )}
          </Link>

          <nav className="flex items-center gap-4 md:gap-6">
            <NavLink href="/">Index</NavLink>
            <NavLink href="/archive" className="hidden sm:inline-block">
              Archive
            </NavLink>
            <NavLink href="/tags" className="hidden md:inline-block">
              Tags
            </NavLink>
            <NavLink href="/now" className="hidden md:inline-block">
              Now
            </NavLink>
            <NavLink href="/about" className="hidden sm:inline-block">
              About
            </NavLink>
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              <SearchIcon className="size-[1.05rem]" strokeWidth={1.6} />
            </Link>
            <ThemeToggle />
          </nav>
        </div>
        <div aria-hidden className="hairline" />
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-24 md:mt-32">
        <div aria-hidden className="hairline" />
        <div className="mx-auto grid max-w-[68rem] gap-8 px-6 py-10 md:grid-cols-[1fr_auto] md:items-end md:px-10 md:py-14">
          <div className="space-y-2">
            <p className="font-display text-2xl font-medium leading-none tracking-tight">
              {settings.brand.name}{" "}
              <span className="font-display ml-1 text-base italic font-normal text-site-accent">
                ——
              </span>
            </p>
            <p className="caps text-muted-foreground">{settings.footer.text}</p>
          </div>
          <div className="caps flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground md:justify-end">
            <span className="tabular">© {new Date().getFullYear()}</span>
            <span className="opacity-40" aria-hidden>
              ·
            </span>
            <Link
              href="/uses"
              className="transition-colors hover:text-site-accent"
            >
              Uses
            </Link>
            <span className="opacity-40" aria-hidden>
              ·
            </span>
            <Link
              href="/colophon"
              className="transition-colors hover:text-site-accent"
            >
              Colophon
            </Link>
            <span className="opacity-40" aria-hidden>
              ·
            </span>
            <Link
              href="/feed.xml"
              className="transition-colors hover:text-site-accent"
            >
              RSS
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
