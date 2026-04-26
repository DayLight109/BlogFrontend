"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  FileEdit,
  Eye,
  MessagesSquare,
  CheckCheck,
  MessageCircle,
  Tag as TagIcon,
  PenLine,
  CheckCircle2,
  Clock,
  Pin,
  Flame,
  CalendarClock,
  TrendingUp,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { buttonVariants } from "@/components/ui/button";

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
  const commentsApproved = useQuery({
    queryKey: ["admin", "comments", "approved"],
    enabled: !!token,
    queryFn: () =>
      api.adminListComments(token!, { status: "approved", size: 100 }),
  });
  const tags = useQuery({
    queryKey: ["tags"],
    enabled: !!token,
    queryFn: () => api.listTags(),
  });

  const posts = postsAll.data?.items ?? [];
  const published = posts.filter((p) => p.status === "published");
  const drafts = posts.filter((p) => p.status === "draft");
  const pinned = posts.filter((p) => p.pinned);
  const totalViews = posts.reduce((n, p) => n + (p.viewCount ?? 0), 0);
  const avgViews = published.length > 0 ? Math.round(totalViews / published.length) : 0;
  const totalComments = commentsAll.data?.total ?? 0;
  const pendingCount = commentsPending.data?.total ?? 0;
  const approvedCount = commentsApproved.data?.total ?? 0;
  const topPost = [...published].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0];
  const lastPublished = [...published]
    .filter((p) => p.publishedAt)
    .sort(
      (a, b) =>
        new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime(),
    )[0];

  const daysSinceLastPub = lastPublished
    ? Math.max(
        0,
        Math.floor(
          (postsAll.dataUpdatedAt - new Date(lastPublished.publishedAt!).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

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

      {/* Stat cards — row 1: writing */}
      <div>
        <p className="caps mb-3 text-muted-foreground">Writing · 写作</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Published"
            value={published.length}
            helper={published.length === 1 ? "essay" : "essays"}
            icon={FileText}
          />
          <StatCard
            label="Drafts"
            value={drafts.length}
            helper={drafts.length > 0 ? "in the drawer" : "nothing cooking"}
            icon={FileEdit}
            href="/admin/posts?status=draft"
          />
          <StatCard
            label="Pinned"
            value={pinned.length}
            helper="featured on home"
            icon={Pin}
          />
          <StatCard
            label="Last published"
            value={daysSinceLastPub ?? "—"}
            helper={
              daysSinceLastPub === null
                ? "never"
                : daysSinceLastPub === 0
                  ? "today"
                  : `day${daysSinceLastPub === 1 ? "" : "s"} ago`
            }
            icon={CalendarClock}
            accent={daysSinceLastPub !== null && daysSinceLastPub > 14}
            isTextValue={daysSinceLastPub === null}
          />
        </div>
      </div>

      {/* Stat cards — row 2: readership & conversation */}
      <div>
        <p className="caps mb-3 text-muted-foreground">Readership · 读者</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total reads"
            value={totalViews}
            helper={`avg ${avgViews} / essay`}
            icon={Eye}
          />
          <StatCard
            label="Top essay"
            value={topPost?.viewCount ?? 0}
            helper={topPost ? truncate(topPost.title, 28) : "—"}
            icon={Flame}
            href={topPost ? `/admin/posts/${topPost.id}` : undefined}
          />
          <StatCard
            label="Pending review"
            value={pendingCount}
            helper={`of ${totalComments} total`}
            icon={MessagesSquare}
            accent={pendingCount > 0}
            href="/admin/comments"
          />
          <StatCard
            label="Approved"
            value={approvedCount}
            helper="visible on site"
            icon={CheckCheck}
          />
        </div>
      </div>

      {/* Stat cards — row 3: catalog */}
      <div>
        <p className="caps mb-3 text-muted-foreground">Catalog · 编目</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Tags"
            value={tags.data?.items.length ?? 0}
            helper="unique across site"
            icon={TagIcon}
            href="/admin/tags"
          />
          <StatCard
            label="Momentum"
            value={publishedThisMonth(published)}
            helper="published this month"
            icon={TrendingUp}
          />
          <StatCard
            label="Untagged"
            value={
              published.filter((p) => !p.tags || p.tags.length === 0).length
            }
            helper="essays missing tags"
            icon={TagIcon}
            accent={
              published.filter((p) => !p.tags || p.tags.length === 0).length > 0
            }
          />
          <StatCard
            label="Spam"
            value={(totalComments - pendingCount - approvedCount)}
            helper="caught in review"
            icon={MessageCircle}
          />
        </div>
      </div>

      {/* Two columns: recent posts & recent comments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent essays" href="/admin/posts">
          {posts.length === 0 ? (
            <Empty text="No essays yet" />
          ) : (
            <ul className="divide-y divide-border">
              {posts.slice(0, 6).map((p) => (
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
                      <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
                        <span className="truncate">{p.title}</span>
                        {p.pinned && (
                          <Pin
                            className="size-3 shrink-0 text-site-accent"
                            strokeWidth={1.8}
                          />
                        )}
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

        <Panel title="Recent letters" href="/admin/comments">
          {(commentsAll.data?.items ?? []).length === 0 ? (
            <Empty text="No letters yet" />
          ) : (
            <ul className="divide-y divide-border">
              {(commentsAll.data?.items ?? []).slice(0, 6).map((c) => (
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

      {/* Top performing essays */}
      {published.length > 0 && (
        <Panel title="Most read">
          <ol className="divide-y divide-border">
            {[...published]
              .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
              .slice(0, 5)
              .map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/posts/${p.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/60"
                  >
                    <span className="caps tabular w-6 shrink-0 text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="min-w-0 flex-1 truncate font-medium">
                      {p.title}
                    </p>
                    <span className="caps tabular shrink-0 text-muted-foreground">
                      <span className="text-foreground">{p.viewCount}</span>{" "}
                      reads
                    </span>
                  </Link>
                </li>
              ))}
          </ol>
        </Panel>
      )}
    </section>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function publishedThisMonth(published: { publishedAt?: string }[]): number {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return published.filter(
    (p) => p.publishedAt && new Date(p.publishedAt).getTime() >= cutoff,
  ).length;
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
  href,
  isTextValue,
}: {
  label: string;
  value: number | string;
  helper: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  accent?: boolean;
  href?: string;
  isTextValue?: boolean;
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
        className={`mt-3 font-display font-medium tracking-tight tabular ${
          isTextValue ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"
        } ${accent ? "text-site-accent" : "text-foreground"}`}
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
