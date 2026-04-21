"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CornerDownRight, X } from "lucide-react";

import { api } from "@/lib/api";
import type { Comment } from "@/lib/types";
import { MagneticButton } from "@/components/site/magnetic-button";

function formatLetterDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type CommentNode = Comment & { children: CommentNode[] };

function buildTree(items: Comment[]): CommentNode[] {
  const byId = new Map<number, CommentNode>();
  items.forEach((c) => byId.set(c.id, { ...c, children: [] }));
  const roots: CommentNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // sort roots newest first; children oldest first for conversation flow
  roots.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const sortChildrenAsc = (n: CommentNode) => {
    n.children.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    n.children.forEach(sortChildrenAsc);
  };
  roots.forEach(sortChildrenAsc);
  return roots;
}

export function CommentsSection({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(
    null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["comments", slug],
    queryFn: () => api.listCommentsBySlug(slug),
  });

  const submit = useMutation({
    mutationFn: () =>
      api.submitComment(slug, {
        authorName: name.trim(),
        authorEmail: email.trim() || undefined,
        content: content.trim(),
        parentId: replyTo?.id,
      }),
    onSuccess: () => {
      setContent("");
      setReplyTo(null);
      toast.success(
        replyTo
          ? "Reply sent — awaiting review."
          : "Thanks — your letter will appear once reviewed.",
      );
      qc.invalidateQueries({ queryKey: ["comments", slug] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    },
  });

  const tree = data?.items ? buildTree(data.items) : [];
  const count = data?.items.length ?? 0;

  return (
    <section className="mt-14 md:mt-16">
      <header className="mb-10 flex items-baseline justify-between">
        <h2 className="font-display text-3xl font-medium tracking-[-0.015em] md:text-4xl">
          Correspondence
          <span className="font-reading ml-3 italic font-normal text-muted-foreground">
            · 来信
          </span>
        </h2>
        <span className="caps tabular text-muted-foreground">
          {String(count).padStart(2, "0")}{" "}
          <span className="opacity-50">
            {count === 1 ? "letter" : "letters"}
          </span>
        </span>
      </header>

      <div className="space-y-10">
        {isLoading && (
          <p className="caps text-muted-foreground">loading&hellip;</p>
        )}

        {!isLoading && count === 0 && (
          <div className="py-6">
            <p className="font-display text-xl italic text-muted-foreground">
              No letters yet. Yours could be the first.
            </p>
            <p className="caps mt-2 text-xs text-muted-foreground/70">
              尚无来信
            </p>
          </div>
        )}

        {tree.map((node) => (
          <CommentItem
            key={node.id}
            node={node}
            onReply={(id, name) => {
              setReplyTo({ id, name });
              document
                .getElementById("letter-form")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        ))}
      </div>

      <form
        id="letter-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !content.trim()) {
            toast.error("A name and a letter are required.");
            return;
          }
          submit.mutate();
        }}
        className="mt-16 md:mt-20"
      >
        <h3 className="caps mb-6 flex items-center gap-3 text-muted-foreground">
          <span className="h-px w-10 bg-site-accent" aria-hidden />
          {replyTo ? "Reply to" : "Write a letter"}
          {replyTo ? (
            <span className="normal-case tracking-normal text-foreground">
              &nbsp;{replyTo.name}
            </span>
          ) : (
            <span className="opacity-60" aria-hidden>
              · 留言
            </span>
          )}
          {replyTo && (
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="ml-2 inline-flex items-center gap-1 normal-case tracking-normal text-muted-foreground hover:text-site-accent"
              aria-label="Cancel reply"
            >
              <X className="size-3" strokeWidth={1.6} />
              cancel
            </button>
          )}
        </h3>

        <div className="space-y-8">
          <div className="grid gap-8 md:grid-cols-2">
            <FieldLine label="Name" subLabel="署名" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
                placeholder="your name"
                className="w-full border-0 bg-transparent pb-2 pt-1 font-reading text-base text-foreground placeholder:text-muted-foreground/35 outline-none focus:border-0"
              />
            </FieldLine>
            <FieldLine label="Email" subLabel="邮箱 (private)">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={100}
                placeholder="you@example.com"
                className="w-full border-0 bg-transparent pb-2 pt-1 font-reading text-base text-foreground placeholder:text-muted-foreground/35 outline-none focus:border-0"
              />
            </FieldLine>
          </div>

          <FieldLine label={replyTo ? "Reply" : "Letter"} subLabel="内容" required>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              maxLength={5000}
              required
              placeholder={replyTo ? `To ${replyTo.name},` : "Dear Kiri,"}
              className="w-full resize-y border-0 bg-transparent py-3 font-reading text-base leading-[1.78] text-foreground placeholder:text-muted-foreground/35 outline-none focus:border-0"
            />
          </FieldLine>

          <div className="flex flex-col items-start gap-4 border-t border-site-rule pt-5 md:flex-row md:items-center md:justify-between">
            <p className="caps text-muted-foreground">
              Reviewed before published
              <span className="ml-2 opacity-60" aria-hidden>
                · 先审后发
              </span>
            </p>

            <MagneticButton
              type="submit"
              disabled={submit.isPending}
              className="caps group inline-flex items-center gap-2 bg-foreground px-5 py-3 text-background hover:bg-site-accent disabled:opacity-40"
            >
              {submit.isPending ? (
                <span>sending&hellip;</span>
              ) : (
                <>
                  <span>{replyTo ? "send reply" : "send letter"}</span>
                  <span
                    aria-hidden
                    className="transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1.5"
                  >
                    →
                  </span>
                </>
              )}
            </MagneticButton>
          </div>
        </div>
      </form>
    </section>
  );
}

function CommentItem({
  node,
  onReply,
  depth = 0,
}: {
  node: CommentNode;
  onReply: (id: number, name: string) => void;
  depth?: number;
}) {
  return (
    <article className="group relative pl-6 md:pl-8">
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-1 w-px bg-site-rule transition-colors duration-500 group-hover:bg-site-accent/70"
      />
      <span
        aria-hidden
        className="absolute left-[-3px] top-[0.55rem] h-1.5 w-1.5 rounded-full bg-site-accent transition-[transform,background-color,box-shadow] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.6] group-hover:bg-transparent group-hover:shadow-[0_0_0_1.5px_var(--site-accent)]"
      />

      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-lg font-medium leading-none text-foreground">
          {node.authorName}
        </span>
        <span className="caps tabular text-muted-foreground">
          {formatLetterDate(node.createdAt)}
        </span>
      </header>

      <p className="font-reading whitespace-pre-wrap text-[1.02rem] leading-[1.78] text-foreground/90">
        {node.content}
      </p>

      {depth < 2 && (
        <button
          type="button"
          onClick={() => onReply(node.id, node.authorName)}
          className="caps group/reply mt-3 inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-site-accent"
        >
          <CornerDownRight
            className="size-3 transition-transform duration-300 group-hover/reply:translate-x-0.5"
            strokeWidth={1.6}
          />
          reply
        </button>
      )}

      {node.children.length > 0 && (
        <div className="mt-8 space-y-8">
          {node.children.map((child) => (
            <CommentItem
              key={child.id}
              node={child}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function FieldLine({
  label,
  subLabel,
  required,
  children,
}: {
  label: string;
  subLabel?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="caps mb-2 flex items-baseline gap-2 text-muted-foreground">
        <span>{label}</span>
        {subLabel && (
          <span className="normal-case tracking-normal opacity-70">
            {subLabel}
          </span>
        )}
        {required && <span className="ml-auto text-site-accent">*</span>}
      </span>
      <div className="field-underline">
        {children}
        <span className="field-underline-static" aria-hidden />
        <span className="field-underline-focus" aria-hidden />
      </div>
    </label>
  );
}
