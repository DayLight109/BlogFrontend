"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import type { Post } from "@/lib/types";
import { revalidateSite } from "@/app/actions/revalidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/admin/markdown-editor";

const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api"
).replace(/\/api\/?$/, "");

function toAbsolute(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

export function PostEditor({ postId }: { postId?: number }) {
  const router = useRouter();
  const token = useAuth((s) => s.accessToken);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(!!postId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    summary: "",
    content: "",
    coverUrl: "",
    tagsStr: "",
    pinned: false,
    status: "draft" as Post["status"],
    publishAt: "", // datetime-local 字段;留空 = 立即发布
  });

  useEffect(() => {
    if (!postId || !token) return;
    api
      .adminGetPost(token, postId)
      .then((p) => {
        // 只有 scheduled 文章需要把 publishedAt 反填回 datetime-local 输入框
        let publishAt = "";
        if (p.status === "scheduled" && p.publishedAt) {
          // datetime-local 需要 "YYYY-MM-DDTHH:mm",且本地时区
          const d = new Date(p.publishedAt);
          const pad = (n: number) => String(n).padStart(2, "0");
          publishAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
            d.getDate(),
          )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        setForm({
          title: p.title,
          slug: p.slug,
          summary: p.summary ?? "",
          content: p.contentMd,
          coverUrl: p.coverUrl ?? "",
          tagsStr: (p.tags ?? []).join(", "),
          pinned: !!p.pinned,
          status: p.status,
          publishAt,
        });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [postId, token]);

  async function save(publish: boolean) {
    if (!token) return;
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("标题和正文不能为空");
      return;
    }
    const tags = form.tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // datetime-local 没时区,直接 new Date 当作本地时间,再转 ISO/UTC 给后端
    let publishAt: string | undefined;
    if (form.publishAt) {
      const d = new Date(form.publishAt);
      if (!isNaN(d.getTime())) publishAt = d.toISOString();
    }
    const body = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      summary: form.summary.trim() || undefined,
      content: form.content,
      coverUrl: form.coverUrl.trim() || undefined,
      tags,
      pinned: form.pinned,
      status: form.status,
      publish,
      publishAt,
    };
    setSaving(true);
    try {
      if (postId) {
        await api.adminUpdatePost(token, postId, body);
        await revalidateSite(["posts"], token);
        toast.success("保存成功 · 前台已更新");
      } else {
        const created = await api.adminCreatePost(token, body);
        await revalidateSite(["posts"], token);
        toast.success("创建成功");
        router.push(`/admin/posts/${created.id}`);
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const res = await api.adminUpload(token, file);
      setForm((f) => ({ ...f, coverUrl: res.url }));
      toast.success("Uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  if (loading) return <p className="text-muted-foreground">加载中...</p>;

  const coverAbs = form.coverUrl ? toAbsolute(form.coverUrl) : "";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {postId ? "编辑文章" : "新建文章"}
        </h1>
        <div className="space-x-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => save(false)}
          >
            保存草稿
          </Button>
          <Button disabled={saving} onClick={() => save(true)}>
            {form.status === "published" ? "更新并发布" : "发布"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">标题</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={255}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug(留空自动生成)</Label>
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            maxLength={255}
            placeholder="my-first-post"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary">摘要</Label>
        <Input
          id="summary"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          maxLength={500}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tags">标签(逗号分隔)</Label>
        <Input
          id="tags"
          value={form.tagsStr}
          onChange={(e) => setForm({ ...form, tagsStr: e.target.value })}
          placeholder="tech, go, nextjs"
        />
      </div>

      {/* Cover + Pinned */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="space-y-1.5">
          <Label htmlFor="coverUrl">封面图 URL</Label>
          <div className="flex gap-2">
            <Input
              id="coverUrl"
              value={form.coverUrl}
              onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
              placeholder="/uploads/2026/04/xxx.jpg"
              className="flex-1"
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.6} />
              ) : (
                <ImagePlus className="size-4" strokeWidth={1.6} />
              )}
              上传
            </Button>
          </div>
          {coverAbs && (
            <div className="relative mt-2 w-fit overflow-hidden rounded border border-border">
              <Image
                src={coverAbs}
                alt="cover preview"
                width={240}
                height={135}
                unoptimized
                className="h-[135px] w-[240px] object-cover"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, coverUrl: "" })}
                className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
                aria-label="Remove cover"
              >
                <X className="size-3" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
        <div className="space-y-2 pt-7 md:pt-6">
          <Label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="size-4 accent-site-accent"
            />
            <span>置顶到首页</span>
          </Label>
        </div>
      </div>

      {/* 计划发布:留空 = 立即发布;填未来时间 + 点"发布"会进入 scheduled 状态 */}
      <div className="space-y-1.5">
        <Label htmlFor="publishAt">计划发布时间(留空 = 立即发布)</Label>
        <Input
          id="publishAt"
          type="datetime-local"
          value={form.publishAt}
          onChange={(e) => setForm({ ...form, publishAt: e.target.value })}
          className="max-w-xs"
        />
        {form.publishAt && (
          <p className="text-xs text-muted-foreground">
            点&ldquo;发布&rdquo;会把状态置为 <code>scheduled</code>,后端每分钟检查一次,到点自动转 <code>published</code>。
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">正文(Markdown)</Label>
        <MarkdownEditor
          value={form.content}
          onChange={(v) => setForm({ ...form, content: v })}
          height={640}
        />
      </div>
    </section>
  );
}
