"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Tag as TagIcon,
  ExternalLink,
  Hash,
  Pencil,
  Trash2,
  GitMerge,
  X,
  Check,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { revalidateSite } from "@/app/actions/revalidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminTagsPage() {
  const token = useAuth((s) => s.accessToken);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeFrom, setMergeFrom] = useState<string[]>([]);
  const [mergeTo, setMergeTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tags"],
    enabled: !!token,
    queryFn: () => api.listTags(),
  });

  const rename = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api.adminRenameTag(token!, from, to),
    onSuccess: async () => {
      await revalidateSite(["posts"], token!);
      toast.success("Renamed · 前台已更新");
      qc.invalidateQueries({ queryKey: ["tags"] });
      setEditing(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Rename failed"),
  });

  const del = useMutation({
    mutationFn: (name: string) => api.adminDeleteTag(token!, name),
    onSuccess: async () => {
      await revalidateSite(["posts"], token!);
      toast.success("Deleted · 前台已更新");
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const merge = useMutation({
    mutationFn: ({ from, to }: { from: string[]; to: string }) =>
      api.adminMergeTags(token!, from, to),
    onSuccess: async () => {
      await revalidateSite(["posts"], token!);
      toast.success("Merged · 前台已更新");
      qc.invalidateQueries({ queryKey: ["tags"] });
      setMergeOpen(false);
      setMergeFrom([]);
      setMergeTo("");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Merge failed"),
  });

  const items = data?.items ?? [];
  const max = items.reduce((m, t) => Math.max(m, t.count), 1);

  function startEdit(name: string) {
    setEditing(name);
    setDraft(name);
  }
  function commitEdit() {
    if (!editing) return;
    const to = draft.trim();
    if (!to || to === editing) {
      setEditing(null);
      return;
    }
    rename.mutate({ from: editing, to });
  }
  function toggleMergeFrom(name: string) {
    setMergeFrom((cur) =>
      cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name],
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="caps text-muted-foreground">Tags · 标签</p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight md:text-4xl">
            All tags
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            聚合自所有已发布文章。改名 / 合并 / 删除会同步更新每篇文章的 tags。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="caps tabular text-muted-foreground">
            <span className="text-foreground">
              {String(items.length).padStart(2, "0")}
            </span>
            <span className="mx-1.5 opacity-40">/</span>
            <span>unique</span>
          </p>
          <Button
            variant={mergeOpen ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setMergeOpen((v) => !v)}
            disabled={items.length < 2}
          >
            <GitMerge className="size-4" strokeWidth={1.6} />
            {mergeOpen ? "Cancel merge" : "Merge…"}
          </Button>
        </div>
      </header>

      {mergeOpen && (
        <div className="space-y-3 rounded-md border border-site-accent/40 bg-site-accent-ghost/30 p-4">
          <p className="caps text-muted-foreground">
            Merge · 合并
            <span className="ml-2 opacity-60" aria-hidden>
              · 勾选下方要合并的源标签,填目标
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="merge-to" className="shrink-0">
              Target
            </Label>
            <Input
              id="merge-to"
              value={mergeTo}
              onChange={(e) => setMergeTo(e.target.value)}
              placeholder="new-tag-name"
              className="max-w-xs"
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Selected:{" "}
              <span className="text-foreground">{mergeFrom.length}</span>
            </p>
            <Button
              size="sm"
              disabled={
                !mergeTo.trim() || mergeFrom.length === 0 || merge.isPending
              }
              onClick={() =>
                merge.mutate({ from: mergeFrom, to: mergeTo.trim() })
              }
            >
              Merge {mergeFrom.length} → “{mergeTo.trim() || "…"}”
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        {isLoading && (
          <p className="px-5 py-10 text-center text-muted-foreground">
            Loading…
          </p>
        )}

        {!isLoading && items.length === 0 && (
          <div className="px-5 py-16 text-center">
            <TagIcon
              className="mx-auto mb-4 size-8 text-muted-foreground/40"
              strokeWidth={1.4}
            />
            <p className="font-display italic text-muted-foreground">
              No tags yet — add some when writing your next essay.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((t) => {
              const pct = Math.round((t.count / max) * 100);
              const isEditing = editing === t.tag;
              const checked = mergeFrom.includes(t.tag);
              return (
                <li
                  key={t.tag}
                  className="group relative flex items-center gap-4 px-5 py-4"
                >
                  {mergeOpen ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMergeFrom(t.tag)}
                      className="size-4 shrink-0 accent-site-accent"
                      aria-label={`Select ${t.tag} for merge`}
                    />
                  ) : (
                    <Hash
                      className="size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.6}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="h-8 max-w-xs"
                          maxLength={64}
                        />
                        <button
                          type="button"
                          onClick={commitEdit}
                          disabled={rename.isPending}
                          className="inline-flex size-7 items-center justify-center rounded text-site-accent hover:bg-site-accent-ghost disabled:opacity-50"
                          aria-label="Save"
                        >
                          <Check className="size-3.5" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Cancel"
                        >
                          <X className="size-3.5" strokeWidth={1.8} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="truncate font-medium text-foreground">
                          {t.tag}
                        </p>
                        <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-site-accent transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <p className="caps tabular shrink-0 text-muted-foreground">
                    <span className="text-foreground">
                      {String(t.count).padStart(2, "0")}
                    </span>{" "}
                    {t.count === 1 ? "essay" : "essays"}
                  </p>
                  {!isEditing && !mergeOpen && (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Link
                        href={`/tags/${encodeURIComponent(t.tag)}`}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`View tag ${t.tag}`}
                        target="_blank"
                      >
                        <ExternalLink
                          className="size-3.5"
                          strokeWidth={1.6}
                        />
                      </Link>
                      <button
                        type="button"
                        onClick={() => startEdit(t.tag)}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Rename ${t.tag}`}
                      >
                        <Pencil className="size-3.5" strokeWidth={1.6} />
                      </button>
                      <button
                        type="button"
                        disabled={del.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Delete tag “${t.tag}”? It will be removed from ${t.count} essay(s).`,
                            )
                          ) {
                            del.mutate(t.tag);
                          }
                        }}
                        className="inline-flex size-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        aria-label={`Delete ${t.tag}`}
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.6} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
