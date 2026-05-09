import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApiError, api } from "@/lib/api";

import { SharedView, type SharedConversation } from "./shared-view";

type Params = { hash: string };

// Per-share metadata: noindex so search engines don't pull personal threads
// into the index. The title falls back to the conversation title when the
// payload is well-formed.
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { hash } = await params;
  let title = "Shared conversation · Kiri";
  try {
    const r = await api.getChatShare(hash);
    if (r.title) title = `${r.title} · shared on Kiri`;
  } catch {
    /* fall back to default title */
  }
  return {
    title,
    description: "A read-only conversation snapshot shared from Kiri.",
    robots: { index: false, follow: false },
  };
}

export default async function SharedChatPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { hash } = await params;
  let raw: Awaited<ReturnType<typeof api.getChatShare>>;
  try {
    raw = await api.getChatShare(hash);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // The payload comes back as the verbatim Conversation snapshot the client
  // uploaded. We trust its shape to a point — narrow with a runtime guard
  // so a malformed share doesn't crash the page.
  const conv = coerceConversation(raw.payload);
  if (!conv) notFound();

  return (
    <SharedView
      conversation={conv}
      hash={raw.hash}
      title={raw.title}
      viewCount={raw.viewCount}
      createdAt={raw.createdAt}
    />
  );
}

// Defensive coercion — server returns whatever was uploaded, so we narrow
// to the fields the renderer needs and drop the rest.
function coerceConversation(payload: unknown): SharedConversation | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title : "Untitled";
  const createdAt = typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString();
  const messages = Array.isArray(p.messages) ? p.messages : null;
  if (!messages) return null;
  const out: SharedConversation = {
    title,
    createdAt,
    messages: messages
      .map((m) => {
        if (!m || typeof m !== "object") return null;
        const x = m as Record<string, unknown>;
        const role = x.role === "user" ? "user" : x.role === "assistant" ? "assistant" : null;
        if (!role) return null;
        return {
          id: String(x.id ?? Math.random()),
          role,
          content: typeof x.content === "string" ? x.content : "",
          createdAt: typeof x.createdAt === "string" ? x.createdAt : createdAt,
          attachments: Array.isArray(x.attachments) ? (x.attachments as unknown[]) : undefined,
          tools: Array.isArray(x.tools) ? (x.tools.filter((t) => typeof t === "string") as string[]) : undefined,
        };
      })
      .filter(Boolean) as SharedConversation["messages"],
  };
  return out;
}
