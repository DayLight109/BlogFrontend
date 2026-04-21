"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Eye,
  MessagesSquare,
  MessageCircle,
  Tag as TagIcon,
  PenLine,
  CheckCircle2,
  Clock,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, buttonVariants } from "@/components/ui/button";

export default function AdminDashboard() {
  const token = useAuth((s) => s.accessToken);

  const postsAll = useQuery({
    queryKey: ["admin", "posts", "all"],
    enabled: !!token,
    queryFn: () => api.adminListPosts(token!, { size: 100 }),
  });
  const commentsAll = useQuery({
    queryKey: ["admin", "comments", "all"],
    enabled: !!token,
    queryFn: () => api.adminListComments(token!, { size: 100 }),
  });
  const commentsPending = useQuery({
    queryKey: ["admin", "comments", "pending"],
    enabled: !!token,
    queryFn: () =>
      api.adminListComments(token!, { status: "pending", size: 100 }),
  });
  const tags = useQuery({
    queryKey: ["tags"],
    enabled: !!token,
    queryFn: () => api.listTags(),
  });

  const posts = postsAll.data?.items ?? [];
  const published = posts.filter((p) => p.status === "published");
  const drafts = posts.filter((p) => p.status === "draft");
  const totalViews = posts.reduce((n, p) => n + (p.viewCount ?? 0), 0);
  const totalComments = commentsAll.data?.total ?? 0;
  const pendingCount = commentsPending.data?.total ?? 0;

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="caps text-muted-foreground">Dashboard · 概览</p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
            Hello,{" "}
            <span className="italic font-light text-site-accent">Kiri</span>.
          </h1>
        </div>
        <Link
          href="/admin/posts/new"
          className={buttonVariants({ className: "gap-2" })}
        >
          <PenLine className="size-4" strokeWidth={1.6} />
          Write an essay
        </Link>
      </header>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Published"
          value={published.length}
          helper={`${drafts.length} draft${drafts.length === 1 ? "" : "s"}`}
          icon={FileText}
        />
        <StatCard
          label="Total reads"
          value={totalViews}
          helper={`across ${published.length} essays`}
          icon={Eye}
        />
        <StatCard
          label="Pending review"
          value={pendingCount}
          helper={`${totalComments} comments total`}
          icon={MessagesSquare}
          accent={pendingCount > 0}
          href="/admin/comments"
        />
        <StatCard
          label="Tags"
          value={tags.data?.items.length ?? 0}
          helper="unique"
          icon={TagIcon}
          href="/admin/tags"
        />
      </div>

      {/* Two columns: recent posts & recent comments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent essays" href="/admin/posts">
          {posts.length === 0 ? (
            <Empty text="No essays yet" />
          ) : (
            <ul className="divide-y divide-border">
              {posts.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/posts/${p.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60"
                  >
                    {p.status === "published" ? (
                      <CheckCircle2
                        className="mt-1 size-4 shrink-0 text-site-accent"
                        strokeWidth={1.6}
                      />
                    ) : (
                      <Clock
                        className="mt-1 size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.6}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {p.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.status === "published"
                          ? `${p.viewCount} reads · ${new Date(p.publishedAt ?? p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                          : "Draft"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent comments" href="/admin/comments">
          {(commentsAll.data?.items ?? []).length === 0 ? (
            <Empty text="No comments yet" />
          ) : (
            <ul className="divide-y divide-border">
              {(commentsAll.data?.items ?? []).slice(0, 5).map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/60"
                >
                  <MessageCircle
                    className={`mt-1 size-4 shrink-0 ${
                      c.status === "approved"
                        ? "text-site-accent"
                        : c.status === "spam"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                    strokeWidth={1.6}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium text-foreground">
                        {c.authorName}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                      {c.content}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: number;
  helper: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`rounded-md border p-5 transition-colors ${
        accent
          ? "border-site-accent/50 bg-site-accent-ghost"
          : "border-border bg-card hover:border-foreground/20"
      } ${href ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="caps text-muted-foreground">{label}</p>
        <Icon
          className={`size-4 ${accent ? "text-site-accent" : "text-muted-foreground"}`}
          strokeWidth={1.6}
        />
      </div>
      <p
        className={`mt-3 font-display text-3xl font-medium tracking-tight tabular md:text-4xl ${
          accent ? "text-site-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="font-display text-lg font-medium">{title}</h2>
        {href && (
          <Link
            href={href}
            className="caps text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            view all →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-display italic text-muted-foreground">{text}</p>
    </div>
  );
}
