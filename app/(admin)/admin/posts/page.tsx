"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { revalidateSite } from "@/app/actions/revalidate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatusFilter = "" | "published" | "draft" | "archived";

export default function AdminPostsPage() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "posts", status],
    enabled: !!token,
    queryFn: () =>
      api.adminListPosts(token!, { size: 100, status: status || undefined }),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.adminDeletePost(token!, id),
    onSuccess: async () => {
      await revalidateSite(["posts"]);
      toast.success("Deleted · 前台已更新");
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const items = (data?.items ?? []).filter((p) =>
    query.trim()
      ? p.title.toLowerCase().includes(query.trim().toLowerCase()) ||
        (p.summary ?? "").toLowerCase().includes(query.trim().toLowerCase()) ||
        p.slug.includes(query.trim().toLowerCase())
      : true,
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-muted-foreground">Posts · 文章</p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
            Essays
          </h1>
        </div>
        <Link
          href="/admin/posts/new"
          className={buttonVariants({ className: "gap-2" })}
        >
          <Plus className="size-4" strokeWidth={1.8} />
          New essay
        </Link>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.6}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, summary or slug…"
            className="h-8 w-full rounded bg-transparent pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              aria-label="Clear"
            >
              <X className="size-3" strokeWidth={1.8} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(
            [
              { v: "", label: "All" },
              { v: "published", label: "Published" },
              { v: "draft", label: "Draft" },
              { v: "archived", label: "Archived" },
            ] as { v: StatusFilter; label: string }[]
          ).map(({ v, label }) => (
            <Button
              key={v || "all"}
              variant={status === v ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(v)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Reads</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-10 text-center">
                    <FileText
                      className="mx-auto mb-3 size-7 text-muted-foreground/40"
                      strokeWidth={1.4}
                    />
                    <p className="font-display italic text-muted-foreground">
                      {query
                        ? `Nothing matches “${query}”`
                        : "No posts yet — click “New essay” to start."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell>
                  <Badge
                    variant={p.status === "published" ? "default" : "secondary"}
                  >
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.tags && p.tags.length > 0 ? p.tags.join(", ") : "—"}
                </TableCell>
                <TableCell className="tabular text-xs text-muted-foreground">
                  {p.viewCount}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.publishedAt
                    ? new Date(p.publishedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                      })
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {p.status === "published" && (
                      <Link
                        href={`/posts/${p.slug}`}
                        target="_blank"
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="View"
                      >
                        <ExternalLink
                          className="size-3.5"
                          strokeWidth={1.6}
                        />
                      </Link>
                    )}
                    <Link
                      href={`/admin/posts/${p.id}`}
                      className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Edit"
                    >
                      <Pencil className="size-3.5" strokeWidth={1.6} />
                    </Link>
                    <button
                      type="button"
                      disabled={del.isPending}
                      onClick={() => {
                        if (confirm(`Delete “${p.title}”?`)) del.mutate(p.id);
                      }}
                      className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.6} />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
