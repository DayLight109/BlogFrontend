"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

// Load MDEditor lazily; it pulls in codemirror + markdown parser and is only
// needed on admin pages.
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

import "@uiw/react-md-editor/markdown-editor.css";
import "./markdown-editor.css";

type Props = {
  value: string;
  onChange: (v: string) => void;
  height?: number;
};

export function MarkdownEditor({ value, onChange, height = 640 }: Props) {
  const token = useAuth((s) => s.accessToken);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");

  // Sync data-color-mode with the site's `.dark` class so MDEditor's built-in
  // theme matches the rest of the page.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setMode(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  async function uploadAndInsert(file: File, textarea: HTMLTextAreaElement) {
    if (!token) {
      toast.error("未登录");
      return;
    }
    if (!file.type.startsWith("image/")) return;
    const placeholder = `![uploading ${file.name}…]()`;
    const { selectionStart: start, selectionEnd: end } = textarea;
    const next = value.slice(0, start) + placeholder + value.slice(end);
    onChange(next);

    try {
      const res = await api.adminUpload(token, file);
      const name = file.name.replace(/\.[^.]+$/, "") || "image";
      const md = `![${name}](${res.url})`;
      onChange(next.replace(placeholder, md));
    } catch (e) {
      onChange(next.replace(placeholder, ""));
      toast.error(e instanceof Error ? e.message : "图片上传失败");
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const ta = target.closest(".w-md-editor")?.querySelector("textarea") as
      | HTMLTextAreaElement
      | null;
    if (!ta) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    const image = files.find((f) => f.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    uploadAndInsert(image, ta);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const ta = target.closest(".w-md-editor")?.querySelector("textarea") as
      | HTMLTextAreaElement
      | null;
    if (!ta) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    const image = files.find((f) => f.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    uploadAndInsert(image, ta);
  }

  return (
    <div
      ref={wrapperRef}
      data-color-mode={mode}
      onPaste={onPaste}
      onDrop={onDrop}
      className="kiri-md-editor"
    >
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        height={height}
        preview="live"
        visibleDragbar={false}
        textareaProps={{
          placeholder:
            "# 标题\n\n写点什么...\n\n> 粘贴或拖拽图片会自动上传。Cmd/Ctrl+B 加粗,Cmd/Ctrl+I 斜体,Cmd/Ctrl+K 插链接。",
          spellCheck: false,
        }}
      />
    </div>
  );
}
