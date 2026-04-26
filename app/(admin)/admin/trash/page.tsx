"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  FileText,
  MessageCircle,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Tab = "posts" | "comments";

export default function AdminTrashPage() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("posts");

  const posts = useQuery({
    queryKey: ["admin", "trash", "posts"],
    enabled: !!token && tab === "posts",
    queryFn: () => api.adminListTrashPosts(token!, { size: 100 }),
  });
  const comments = useQuery({
    queryKey: ["admin", "trash", "comments"],
    enabled: !!token && tab === "comments",
    queryFn: () => api.adminListTrashComments(token!, { size: 100 }),
  });

  const restorePost = useMutation({
    mutationFn: (id: number) => api.adminRestorePost(token!, id),
    onSuccess: () => {
      toast.success("Restored");
      qc.invalidateQueries({ queryKey: ["admin", "trash", "posts"] });
      qc.invalidateQueries({ queryKey: ["admin", "posts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Restore failed"),
  });
  const purgePost = useMutation({
    mutationFn: (id: number) => api.adminPurgePost(token!, id),
    onSuccess: () => {
      toast.success("Purged forever");
      qc.invalidateQueries({ queryKey: ["admin", "trash", "posts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Purge failed"),
  });

  const restoreComment = useMutation({
    mutationFn: (id: number) => api.adminRestoreComment(token!, id),
    onSuccess: () => {
      toast.success("Restored");
      qc.invalidateQueries({ queryKey: ["admin", "trash", "comments"] });
      qc.invalidateQueries({ queryKey: ["admin", "comments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Restore failed"),
  });
  const purgeComment = useMutation({
    mutationFn: (id: number) => api.adminPurgeComment(token!, id),
    onSuccess: () => {
      toast.success("Purged forever");
      qc.invalidateQueries({ queryKey: ["admin", "trash", "comments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Purge failed"),
  });

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-muted-foreground">Trash · 回收站</p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
            Recycle bin
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            软删除的文章和评论保留在这里。可恢复,也可彻底清除(无法撤销)。
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant={tab === "posts" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("posts")}
            className="gap-1.5"
          >
            <FileText className="size-3.5" strokeWidth={1.6} /> Posts
          </Button>
          <Button
            variant={tab === "comments" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("comments")}
            className="gap-1.5"
          >
            <MessageCircle className="size-3.5" strokeWidth={1.6} /> Comments
          </Button>
        </div>
      </header>

      {tab === "posts" && (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!posts.isLoading && (posts.data?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="py-10 text-center">
                      <Trash2 className="mx-auto mb-3 size-7 text-muted-foreground/40" strokeWidth={1.4} />
                      <p className="font-display italic text-muted-foreground">
                        Recycle bin is empty.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {(posts.data?.items ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.slug}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.status}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={restorePost.isPending}
                        onClick={() => restorePost.mutate(p.id)}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-site-accent-ghost hover:text-site-accent disabled:opacity-50"
                        aria-label="Restore"
                        title="Restore"
                      >
                        <RotateCcw className="size-3.5" strokeWidth={1.6} />
                      </button>
                      <button
                        type="button"
                        disabled={purgePost.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Permanently delete “${p.title}”? This cannot be undone.`,
                            )
                          ) {
                            purgePost.mutate(p.id);
                          }
                        }}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label="Purge forever"
                        title="Purge forever"
                      >
                        <AlertTriangle className="size-3.5" strokeWidth={1.6} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "comments" && (
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Author</TableHead>
                <TableHead className="w-[50%]">Content</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comments.isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!comments.isLoading && (comments.data?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="py-10 text-center">
                      <Trash2 className="mx-auto mb-3 size-7 text-muted-foreground/40" strokeWidth={1.4} />
                      <p className="font-display italic text-muted-foreground">
                        Recycle bin is empty.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {(comments.data?.items ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.authorName}</TableCell>
                  <TableCell className="max-w-md">
                    <p className="line-clamp-3 text-sm">{c.content}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.status}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={restoreComment.isPending}
                        onClick={() => restoreComment.mutate(c.id)}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-site-accent-ghost hover:text-site-accent disabled:opacity-50"
                        aria-label="Restore"
                        title="Restore"
                      >
                        <RotateCcw className="size-3.5" strokeWidth={1.6} />
                      </button>
                      <button
                        type="button"
                        disabled={purgeComment.isPending}
                        onClick={() => {
                          if (
                            confirm("Permanently delete this comment? This cannot be undone.")
                          ) {
                            purgeComment.mutate(c.id);
                          }
                        }}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label="Purge forever"
                        title="Purge forever"
                      >
                        <AlertTriangle className="size-3.5" strokeWidth={1.6} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
