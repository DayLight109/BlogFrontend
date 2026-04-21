"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import type { AdminSiteSettings } from "@/lib/types";
import { revalidateSite } from "@/app/actions/revalidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/components/admin/markdown-editor";

type FormState = {
  "brand.name": string;
  "brand.tagline": string;
  "footer.text": string;
  "contact.email": string;
  "contact.github": string;
  "seo.site_title": string;
  "seo.site_description": string;
  "about.hero_title": string;
  "about.body_md": string;
  "theme.accent": string;
  "theme.accent_dark": string;
};

const empty: FormState = {
  "brand.name": "",
  "brand.tagline": "",
  "footer.text": "",
  "contact.email": "",
  "contact.github": "",
  "seo.site_title": "",
  "seo.site_description": "",
  "about.hero_title": "",
  "about.body_md": "",
  "theme.accent": "#9a2e20",
  "theme.accent_dark": "#d8715e",
};

function fromAdmin(s: AdminSiteSettings): FormState {
  return {
    "brand.name": s.brand.name,
    "brand.tagline": s.brand.tagline,
    "footer.text": s.footer.text,
    "contact.email": s.contact.email,
    "contact.github": s.contact.github,
    "seo.site_title": s.seo.siteTitle,
    "seo.site_description": s.seo.siteDescription,
    "about.hero_title": s.about.heroTitle,
    "about.body_md": s.aboutBodyMd,
    "theme.accent": s.theme?.accent || "#9a2e20",
    "theme.accent_dark": s.theme?.accentDark || "#d8715e",
  };
}

const ACCENT_PRESETS = [
  { name: "Spine red", light: "#9a2e20", dark: "#d8715e" },
  { name: "Ink blue", light: "#2f4b73", dark: "#7ea7d8" },
  { name: "Forest", light: "#2d6046", dark: "#7ec29b" },
  { name: "Amber", light: "#a0651e", dark: "#e0a968" },
  { name: "Plum", light: "#6b3168", dark: "#c48dc0" },
  { name: "Graphite", light: "#3a3a3a", dark: "#b8b8b8" },
];

export default function AdminSettingsPage() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    enabled: !!token,
    queryFn: () => api.adminGetSettings(token!),
  });

  useEffect(() => {
    if (data) setForm(fromAdmin(data));
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: Partial<FormState>) =>
      api.adminUpdateSettings(token!, payload as Record<string, string>),
    onSuccess: async () => {
      await revalidateSite(["settings", "posts"]);
      toast.success("Saved · 前台已更新");
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  function saveAll() {
    save.mutate(form);
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const set = <K extends keyof FormState>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-muted-foreground">Settings · 站点设置</p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
            Site
          </h1>
        </div>
        <Button onClick={saveAll} disabled={save.isPending} className="gap-2">
          <Save className="size-4" strokeWidth={1.6} />
          {save.isPending ? "Saving…" : "Save all"}
        </Button>
      </header>

      {/* Brand */}
      <Section title="Brand" caption="品牌与标题">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Site name" id="brand.name">
            <Input
              id="brand.name"
              value={form["brand.name"]}
              onChange={(e) => set("brand.name", e.target.value)}
              maxLength={64}
            />
          </Field>
          <Field label="Tagline" id="brand.tagline">
            <Input
              id="brand.tagline"
              value={form["brand.tagline"]}
              onChange={(e) => set("brand.tagline", e.target.value)}
              maxLength={128}
              placeholder="· notes & essays"
            />
          </Field>
        </div>
        <Field label="Footer text" id="footer.text">
          <Input
            id="footer.text"
            value={form["footer.text"]}
            onChange={(e) => set("footer.text", e.target.value)}
            maxLength={200}
          />
        </Field>
      </Section>

      {/* Contact */}
      <Section title="Contact" caption="联系方式">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Email" id="contact.email">
            <Input
              id="contact.email"
              type="email"
              value={form["contact.email"]}
              onChange={(e) => set("contact.email", e.target.value)}
              maxLength={128}
            />
          </Field>
          <Field label="GitHub URL" id="contact.github">
            <Input
              id="contact.github"
              type="url"
              value={form["contact.github"]}
              onChange={(e) => set("contact.github", e.target.value)}
              maxLength={200}
              placeholder="https://github.com/…"
            />
          </Field>
        </div>
      </Section>

      {/* SEO */}
      <Section title="SEO" caption="搜索引擎可见">
        <Field label="Site title" id="seo.site_title">
          <Input
            id="seo.site_title"
            value={form["seo.site_title"]}
            onChange={(e) => set("seo.site_title", e.target.value)}
            maxLength={128}
          />
        </Field>
        <Field label="Site description" id="seo.site_description">
          <Textarea
            id="seo.site_description"
            value={form["seo.site_description"]}
            onChange={(e) => set("seo.site_description", e.target.value)}
            maxLength={320}
            rows={2}
          />
        </Field>
      </Section>

      {/* About */}
      <Section title="About" caption="关于页内容">
        <Field label="Hero title" id="about.hero_title">
          <Input
            id="about.hero_title"
            value={form["about.hero_title"]}
            onChange={(e) => set("about.hero_title", e.target.value)}
            maxLength={128}
          />
        </Field>
        <Field label="Body (Markdown)" id="about.body_md">
          <MarkdownEditor
            value={form["about.body_md"]}
            onChange={(v) => set("about.body_md", v)}
            height={520}
          />
        </Field>
      </Section>

      {/* Theme */}
      <Section title="Theme" caption="配色">
        <p className="text-xs text-muted-foreground">
          Accent 色会出现在链接、active 导航、"in between" 这类强调文字上。换一下就能立刻看到效果。
        </p>

        <div className="grid gap-5 md:grid-cols-2">
          <ColorField
            label="Accent (Light mode)"
            value={form["theme.accent"]}
            onChange={(v) => set("theme.accent", v)}
          />
          <ColorField
            label="Accent (Dark mode)"
            value={form["theme.accent_dark"]}
            onChange={(v) => set("theme.accent_dark", v)}
          />
        </div>

        <div>
          <p className="caps mb-2 text-xs text-muted-foreground">Presets</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  set("theme.accent", p.light);
                  set("theme.accent_dark", p.dark);
                }}
                className="group inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-site-accent"
              >
                <span
                  className="inline-block size-3.5 rounded-full"
                  style={{ backgroundColor: p.light }}
                  aria-hidden
                />
                <span
                  className="inline-block size-3.5 rounded-full"
                  style={{ backgroundColor: p.dark }}
                  aria-hidden
                />
                <span className="text-foreground">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4">
          <p className="caps mb-3 text-xs text-muted-foreground">Preview</p>
          <p
            className="font-display text-2xl leading-tight tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            Writing about <em className="font-light">code</em>, and the small
            ideas{" "}
            <span
              style={{
                color:
                  typeof document !== "undefined" &&
                  document.documentElement.classList.contains("dark")
                    ? form["theme.accent_dark"]
                    : form["theme.accent"],
              }}
            >
              in between.
            </span>
          </p>
        </div>
      </Section>
    </section>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-md border border-border bg-card p-5 md:p-6">
      <header>
        <p className="caps text-muted-foreground">
          {title}
          {caption && (
            <span className="ml-2 opacity-60" aria-hidden>
              · {caption}
            </span>
          )}
        </p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-border bg-background p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#9a2e20"
          maxLength={24}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}
