"use client";

import { useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MessagesSquare,
  CheckCircle2,
  AlertOctagon,
  Trash2,
  RotateCcw,
  Reply,
  Send,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import type { Comment } from "@/lib/types";
import { revalidateSite } from "@/app/actions/revalidate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatusFilter = "" | Comment["status"];

export default function AdminCommentsPage() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "comments", status],
    enabled: !!token,
    queryFn: () =>
      api.adminListComments(token!, {
        status: status || undefined,
        size: 100,
      }),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Comment["status"] }) =>
      api.adminUpdateCommentStatus(token!, id, status),
    onSuccess: async () => {
      await revalidateSite(["posts"]);
      toast.success("Updated · 前台已更新");
      qc.invalidateQueries({ queryKey: ["admin", "comments"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.adminDeleteComment(token!, id),
    onSuccess: async () => {
      await revalidateSite(["posts"]);
      toast.success("Deleted · 前台已更新");
      qc.invalidateQueries({ queryKey: ["admin", "comments"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const reply = useMutation({
    mutationFn: (args: { postId: number; parentId: number; content: string }) =>
      api.adminReplyComment(token!, args),
    onSuccess: async () => {
      await revalidateSite(["posts"]);
      toast.success("Reply posted · 前台已更新");
      qc.invalidateQueries({ queryKey: ["admin", "comments"] });
      setReplyingTo(null);
      setReplyText("");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Reply failed"),
  });

  const items = data?.items ?? [];

  const filters: { v: StatusFilter; label: string; count?: number }[] = [
    { v: "pending", label: "Pending" },
    { v: "approved", label: "Approved" },
    { v: "spam", label: "Spam" },
    { v: "", label: "All" },
  ];

  function sendReply() {
    if (!replyingTo) return;
    const text = replyText.trim();
    if (!text) {
      toast.error("回复内容不能为空");
      return;
    }
    reply.mutate({
      postId: replyingTo.postId,
      parentId: replyingTo.id,
      content: text,
    });
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-muted-foreground">Comments · 评论</p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
            Moderation
          </h1>
        </div>
        <div className="flex gap-1.5">
          {filters.map(({ v, label }) => (
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
      </header>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Author</TableHead>
              <TableHead className="w-[42%]">Content</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="py-10 text-center">
                    <MessagesSquare
                      className="mx-auto mb-3 size-7 text-muted-foreground/40"
                      strokeWidth={1.4}
                    />
                    <p className="font-display italic text-muted-foreground">
                      No comments match this filter.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {items.map((c) => {
              const replying = replyingTo?.id === c.id;
              return (
                <Fragment key={c.id}>
                  <TableRow>
                    <TableCell>
                      <p className="font-medium">{c.authorName}</p>
                      {c.authorEmail && (
                        <p className="text-xs text-muted-foreground">
                          {c.authorEmail}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-3 text-sm">{c.content}</p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === "approved"
                            ? "default"
                            : c.status === "spam"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (replying) {
                              setReplyingTo(null);
                              setReplyText("");
                            } else {
                              setReplyingTo(c);
                              setReplyText("");
                            }
                          }}
                          className={`inline-flex size-8 items-center justify-center rounded transition-colors ${
                            replying
                              ? "bg-site-accent-ghost text-site-accent"
                              : "text-muted-foreground hover:bg-site-accent-ghost hover:text-site-accent"
                          }`}
                          aria-label="Reply"
                          title="Reply as author"
                        >
                          <Reply className="size-3.5" strokeWidth={1.6} />
                        </button>
                        {c.status !== "approved" && (
                          <button
                            type="button"
                            disabled={update.isPending}
                            onClick={() =>
                              update.mutate({ id: c.id, status: "approved" })
                            }
                            className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-site-accent-ghost hover:text-site-accent disabled:opacity-50"
                            aria-label="Approve"
                            title="Approve"
                          >
                            <CheckCircle2
                              className="size-3.5"
                              strokeWidth={1.6}
                            />
                          </button>
                        )}
                        {c.status === "approved" && (
                          <button
                            type="button"
                            disabled={update.isPending}
                            onClick={() =>
                              update.mutate({ id: c.id, status: "pending" })
                            }
                            className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            aria-label="Unapprove"
                            title="Move back to pending"
                          >
                            <RotateCcw className="size-3.5" strokeWidth={1.6} />
                          </button>
                        )}
                        {c.status !== "spam" && (
                          <button
                            type="button"
                            disabled={update.isPending}
                            onClick={() =>
                              update.mutate({ id: c.id, status: "spam" })
                            }
                            className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            aria-label="Mark spam"
                            title="Mark as spam"
                          >
                            <AlertOctagon
                              className="size-3.5"
                              strokeWidth={1.6}
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={del.isPending}
                          onClick={() => {
                            if (confirm("Delete this comment?"))
                              del.mutate(c.id);
                          }}
                          className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.6} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {replying && (
                    <TableRow key={`reply-${c.id}`}>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <div className="space-y-2 py-2">
                          <p className="caps text-xs text-muted-foreground">
                            Reply to {c.authorName}
                          </p>
                          <Textarea
                            autoFocus
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={3}
                            placeholder="Write a reply as the site author…"
                            className="font-reading text-sm"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyText("");
                              }}
                              className="gap-1.5"
                            >
                              <X className="size-3.5" strokeWidth={1.6} />
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={reply.isPending || !replyText.trim()}
                              onClick={sendReply}
                              className="gap-1.5"
                            >
                              <Send className="size-3.5" strokeWidth={1.6} />
                              {reply.isPending ? "Sending…" : "Send reply"}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
