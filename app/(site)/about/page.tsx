import type { Metadata } from "next";
import { Mail, Rss } from "lucide-react";

import { api } from "@/lib/api";
import type { SiteSettings } from "@/lib/types";
import { Rule } from "@/components/site/rule";
import { TransitionLink } from "@/components/site/transition-link";

function GithubIcon({
  className = "",
  strokeWidth = 1.6,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: "About",
  description: "A short note about the writer.",
};

const defaults: SiteSettings = {
  brand: { name: "Kiri", tagline: "" },
  footer: { text: "" },
  contact: { email: "hello@example.com", github: "https://github.com/kiri" },
  seo: { siteTitle: "", siteDescription: "" },
  about: {
    heroTitle: "Hello, I'm Kiri.",
    bodyHtml: "",
  },
  theme: { accent: "#9a2e20", accentDark: "#d8715e" },
};

function displayGithubHandle(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

export default async function AboutPage() {
  let settings: SiteSettings = defaults;
  try {
    settings = (await api.getSettings()) ?? defaults;
  } catch {
    settings = defaults;
  }

  const heroTitle = settings.about.heroTitle || defaults.about.heroTitle;
  const bodyHtml = settings.about.bodyHtml;
  const email = settings.contact.email;
  const github = settings.contact.github;

  return (
    <div className="mx-auto max-w-[48rem] px-6 md:px-10">
      <header className="pt-16 md:pt-28">
        <div className="reveal">
          <div className="caps mb-6 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-10 bg-site-accent" aria-hidden />
            About
            <span className="opacity-60" aria-hidden>
              · 关于
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
          Nothing to say yet.
        </p>
      )}

      <div className="my-16">
        <Rule variant="tilde" />
      </div>

      <section>
        <p className="caps mb-6 text-muted-foreground">
          Reach out
          <span className="ml-2 opacity-60" aria-hidden>
            · 联系
          </span>
        </p>
        <ul className="space-y-4">
          {email && (
            <li>
              <a
                href={`mailto:${email}`}
                className="group inline-flex items-center gap-3 font-display text-lg text-foreground transition-colors hover:text-site-accent"
              >
                <Mail
                  className="size-4 text-muted-foreground transition-colors group-hover:text-site-accent"
                  strokeWidth={1.6}
                />
                <span className="title-hover-underline">{email}</span>
              </a>
            </li>
          )}
          {github && (
            <li>
              <a
                href={github}
                className="group inline-flex items-center gap-3 font-display text-lg text-foreground transition-colors hover:text-site-accent"
              >
                <GithubIcon
                  className="size-4 text-muted-foreground transition-colors group-hover:text-site-accent"
                  strokeWidth={1.6}
                />
                <span className="title-hover-underline">
                  {displayGithubHandle(github)}
                </span>
              </a>
            </li>
          )}
          <li>
            <TransitionLink
              href="/feed.xml"
              className="group inline-flex items-center gap-3 font-display text-lg text-foreground transition-colors hover:text-site-accent"
            >
              <Rss
                className="size-4 text-muted-foreground transition-colors group-hover:text-site-accent"
                strokeWidth={1.6}
              />
              <span className="title-hover-underline">RSS feed</span>
            </TransitionLink>
          </li>
        </ul>
      </section>
    </div>
  );
}
