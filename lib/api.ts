import type {
  AdminSiteSettings,
  AuditLogEntry,
  ChatMemory,
  Comment,
  LoginResponse,
  PaginatedResponse,
  Post,
  ServerChatMessage,
  ServerChatSession,
  SiteSettings,
  UploadResponse,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";

type FetchOptions = RequestInit & {
  token?: string;
  /** for server-side fetch with Next.js caching */
  revalidate?: number | false;
  tags?: string[];
};

async function request<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, revalidate, tags, headers, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
    credentials: "include",
    next: tags || revalidate !== undefined ? { revalidate, tags } : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "auto" | "low" | "high" };
    };

export type ChatAPIMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

// Client-side attachment shape kept beside Message in localStorage.
//
// kind: "image"  — `url` is a data:image/* URL (pasted/uploaded local file)
//                  or an https:// URL (link pasted into the input box).
//                  Forwarded to the model as an image_url part.
// kind: "text"   — `text` holds the extracted plaintext from a PDF or code
//                  file (parsed client-side via pdfjs / FileReader). `url`
//                  is unused here — the chip is rendered from `name` and
//                  `size`. Inlined into the user-message text part as a
//                  fenced block so the model can read it.
export type ChatAttachment = {
  id: string;
  kind: "image" | "text";
  url: string;
  text?: string;
  name?: string;
  size?: number;
  mime?: string;
};

// Merge text + attachments into the OpenAI-compatible content shape.
// Returns a plain string when there are no image attachments so the wire
// payload stays small for text-only messages. Text-kind attachments are
// inlined into the text part as a fenced block — they're not separate
// content parts on the wire.
export function toApiContent(
  text: string,
  attachments?: ChatAttachment[],
): string | ChatContentPart[] {
  if (!attachments || attachments.length === 0) return text;

  // Build the assembled text body: original text, then each text-kind
  // attachment as a fenced block. The model treats this as one user turn.
  const textBlocks: string[] = [];
  if (text.trim()) textBlocks.push(text);
  const images = attachments.filter((a) => a.kind === "image");
  const texts = attachments.filter((a) => a.kind === "text" && a.text);
  for (const a of texts) {
    const label = a.name ?? "attached file";
    textBlocks.push(
      `\n\n--- file: ${label} ---\n${a.text}\n--- end file: ${label} ---`,
    );
  }
  const body = textBlocks.join("");

  if (images.length === 0) {
    // Pure text + text attachments → keep wire payload as a string.
    return body;
  }

  // Has images → must use multimodal parts array.
  const parts: ChatContentPart[] = [];
  if (body.trim()) parts.push({ type: "text", text: body });
  for (const a of images) {
    parts.push({ type: "image_url", image_url: { url: a.url } });
  }
  return parts;
}

export interface ChatStreamOptions {
  webSearch?: boolean;
  deepThinking?: boolean;
  /** Model id to override the server default. Should match a value from
   * `getChatConfig().models` — unknown ids are silently dropped server-side. */
  model?: string;
  /** Fired once per unique tool name detected in the response stream — used
   * to badge the assistant message ("· web search used"). Many upstream
   * providers (notably OpenAI's Responses-style web_search_preview) digest
   * tool calls server-side and only stream final text, in which case this
   * never fires. That's an acceptable degradation. */
  onTool?: (name: string) => void;
}

/** Capability descriptor returned by the backend so the UI can render the
 * model picker (or hide it when only one model is configured). */
export type ChatConfig = {
  models: string[];
  default: string;
  configured: boolean;
};

export async function streamChatCompletion(
  messages: ChatAPIMessage[],
  onDelta: (content: string) => void,
  signal?: AbortSignal,
  options?: ChatStreamOptions,
) {
  const body: Record<string, unknown> = { messages, stream: true };
  if (options?.webSearch) body.web_search = true;
  if (options?.deepThinking) body.deep_thinking = true;
  if (options?.model) body.model = options.model;

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      if (!raw) continue;
      const lines = raw.split(/\r?\n/);
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice("event:".length)
        .trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");

      if (event === "done") return;
      if (!data) continue;

      const parsed = JSON.parse(data) as { content?: string; error?: string; name?: string };
      if (event === "error" || parsed.error) {
        throw new ApiError(502, parsed.error ?? "AI provider request failed");
      }
      if (event === "tool") {
        if (options?.onTool && parsed.name) options.onTool(parsed.name);
        continue;
      }
      if (parsed.content) onDelta(parsed.content);
    }
  }
}

/** Fetch the chat capability descriptor. Returns a normalized fallback when
 * the endpoint is unreachable so the UI can still render with a sensible
 * default rather than crashing. */
export async function getChatConfig(): Promise<ChatConfig> {
  const res = await fetch(`${BASE}/chat/config`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return (await res.json()) as ChatConfig;
}

export const api = {
  // --- Public ---
  listPosts(params: { page?: number; size?: number; tag?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.size) q.set("size", String(params.size));
    if (params.tag) q.set("tag", params.tag);
    return request<PaginatedResponse<Post>>(
      `/posts${q.toString() ? `?${q}` : ""}`,
      { revalidate: 60, tags: ["posts"] },
    );
  },

  getPostBySlug(slug: string) {
    return request<Post>(`/posts/${encodeURIComponent(slug)}`, {
      revalidate: 60,
      tags: ["posts", `post:${slug}`],
    });
  },

  listCommentsBySlug(slug: string) {
    return request<{ items: Comment[]; total: number }>(
      `/posts/${encodeURIComponent(slug)}/comments`,
      { cache: "no-store" },
    );
  },

  submitComment(
    slug: string,
    body: {
      authorName: string;
      authorEmail?: string;
      authorWebsite?: string;
      content: string;
      parentId?: number;
      /** honeypot — must be empty */
      url?: string;
      /** form mount epoch ms — used by anti-bot timing check */
      ts?: number;
    },
  ) {
    return request<Comment>(`/posts/${encodeURIComponent(slug)}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  getNeighbors(slug: string) {
    return request<{ prev: Post | null; next: Post | null }>(
      `/posts/${encodeURIComponent(slug)}/neighbors`,
      { revalidate: 60, tags: ["posts", `neighbors:${slug}`] },
    );
  },

  getRelated(slug: string, limit = 3) {
    return request<{ items: Post[] }>(
      `/posts/${encodeURIComponent(slug)}/related?limit=${limit}`,
      { revalidate: 60, tags: ["posts", `related:${slug}`] },
    );
  },

  listTags() {
    return request<{ items: { tag: string; count: number }[] }>(`/tags`, {
      revalidate: 60,
      tags: ["posts", "tags"],
    });
  },

  getArchive() {
    return request<{ items: { year: number; posts: Post[] }[] }>(`/archive`, {
      revalidate: 60,
      tags: ["posts", "archive"],
    });
  },

  searchPosts(q: string, page = 1, size = 20) {
    const qs = new URLSearchParams({ q, page: String(page), size: String(size) });
    return request<PaginatedResponse<Post> & { q: string }>(
      `/search?${qs}`,
      { cache: "no-store" },
    );
  },

  getSettings() {
    return request<SiteSettings>(`/settings`, {
      revalidate: 60,
      tags: ["settings"],
    });
  },

  // --- Auth ---
  login(username: string, password: string) {
    return request<LoginResponse>(`/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  logout() {
    return request<{ ok: boolean }>(`/auth/logout`, { method: "POST" });
  },

  me(token: string) {
    return request<{ userId: number; username: string; role: string }>(
      `/auth/me`,
      { token },
    );
  },

  refresh() {
    return request<LoginResponse>(`/auth/refresh`, { method: "POST" });
  },

  // --- Admin Posts ---
  adminListPosts(token: string, params: { page?: number; size?: number; status?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.size) q.set("size", String(params.size));
    if (params.status) q.set("status", params.status);
    return request<PaginatedResponse<Post>>(
      `/admin/posts${q.toString() ? `?${q}` : ""}`,
      { token, cache: "no-store" },
    );
  },

  adminGetPost(token: string, id: number) {
    return request<Post>(`/admin/posts/${id}`, { token, cache: "no-store" });
  },

  adminCreatePost(token: string, body: Partial<Post> & { publish?: boolean; content: string; publishAt?: string }) {
    return request<Post>(`/admin/posts`, {
      token,
      method: "POST",
      body: JSON.stringify({
        title: body.title,
        slug: body.slug ?? "",
        summary: body.summary,
        content: body.content,
        coverUrl: body.coverUrl,
        status: body.status,
        tags: body.tags ?? [],
        pinned: body.pinned,
        publish: body.publish ?? false,
        publishAt: body.publishAt,
      }),
    });
  },

  adminUpdatePost(token: string, id: number, body: Partial<Post> & { publish?: boolean; content: string; publishAt?: string }) {
    return request<Post>(`/admin/posts/${id}`, {
      token,
      method: "PUT",
      body: JSON.stringify({
        title: body.title,
        slug: body.slug ?? "",
        summary: body.summary,
        content: body.content,
        coverUrl: body.coverUrl,
        status: body.status,
        tags: body.tags ?? [],
        pinned: body.pinned,
        publish: body.publish ?? false,
        publishAt: body.publishAt,
      }),
    });
  },

  adminDeletePost(token: string, id: number) {
    return request<{ ok: boolean }>(`/admin/posts/${id}`, {
      token,
      method: "DELETE",
    });
  },

  // --- Admin Comments ---
  adminListComments(token: string, params: { status?: string; page?: number; size?: number } = {}) {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.page) q.set("page", String(params.page));
    if (params.size) q.set("size", String(params.size));
    return request<PaginatedResponse<Comment>>(
      `/admin/comments${q.toString() ? `?${q}` : ""}`,
      { token, cache: "no-store" },
    );
  },

  adminUpdateCommentStatus(token: string, id: number, status: Comment["status"]) {
    return request<{ ok: boolean }>(`/admin/comments/${id}`, {
      token,
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  adminDeleteComment(token: string, id: number) {
    return request<{ ok: boolean }>(`/admin/comments/${id}`, {
      token,
      method: "DELETE",
    });
  },

  adminReplyComment(
    token: string,
    body: { postId: number; parentId?: number; content: string },
  ) {
    return request<Comment>(`/admin/comments`, {
      token,
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  // --- Admin Settings ---
  adminGetSettings(token: string) {
    return request<AdminSiteSettings>(`/admin/settings`, {
      token,
      cache: "no-store",
    });
  },

  adminUpdateSettings(token: string, updates: Record<string, string>) {
    return request<{ ok: boolean }>(`/admin/settings`, {
      token,
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },

  // --- Admin Tags ---
  adminRenameTag(token: string, from: string, to: string) {
    return request<{ ok: boolean }>(
      `/admin/tags/${encodeURIComponent(from)}/rename`,
      {
        token,
        method: "PATCH",
        body: JSON.stringify({ to }),
      },
    );
  },

  adminMergeTags(token: string, from: string[], to: string) {
    return request<{ ok: boolean }>(`/admin/tags/merge`, {
      token,
      method: "POST",
      body: JSON.stringify({ from, to }),
    });
  },

  adminDeleteTag(token: string, name: string) {
    return request<{ ok: boolean }>(
      `/admin/tags/${encodeURIComponent(name)}`,
      {
        token,
        method: "DELETE",
      },
    );
  },

  // --- Admin Upload ---
  async adminUpload(token: string, file: File): Promise<UploadResponse> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/admin/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, body || res.statusText);
    }
    return res.json();
  },

  // --- Admin Trash (soft-delete recycle bin) ---
  adminListTrashPosts(token: string, params: { page?: number; size?: number } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.size) q.set("size", String(params.size));
    return request<PaginatedResponse<Post>>(
      `/admin/trash/posts${q.toString() ? `?${q}` : ""}`,
      { token, cache: "no-store" },
    );
  },

  adminRestorePost(token: string, id: number) {
    return request<{ ok: boolean }>(`/admin/trash/posts/${id}/restore`, {
      token,
      method: "POST",
    });
  },

  adminPurgePost(token: string, id: number) {
    return request<{ ok: boolean }>(`/admin/trash/posts/${id}`, {
      token,
      method: "DELETE",
    });
  },

  adminListTrashComments(token: string, params: { page?: number; size?: number } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.size) q.set("size", String(params.size));
    return request<PaginatedResponse<Comment>>(
      `/admin/trash/comments${q.toString() ? `?${q}` : ""}`,
      { token, cache: "no-store" },
    );
  },

  adminRestoreComment(token: string, id: number) {
    return request<{ ok: boolean }>(`/admin/trash/comments/${id}/restore`, {
      token,
      method: "POST",
    });
  },

  adminPurgeComment(token: string, id: number) {
    return request<{ ok: boolean }>(`/admin/trash/comments/${id}`, {
      token,
      method: "DELETE",
    });
  },

  // --- Admin Audit ---
  adminListAudit(token: string, params: { page?: number; size?: number } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.size) q.set("size", String(params.size));
    return request<PaginatedResponse<AuditLogEntry>>(
      `/admin/audit${q.toString() ? `?${q}` : ""}`,
      { token, cache: "no-store" },
    );
  },

  // --- Admin Chat Memories ---
  adminListMemories(token: string) {
    return request<{ items: ChatMemory[]; total: number }>(
      `/admin/chat/memories`,
      { token, cache: "no-store" },
    );
  },

  adminDeleteMemory(token: string, id: number) {
    return request<void>(`/admin/chat/memories/${id}`, {
      token,
      method: "DELETE",
    });
  },

  // --- Admin Chat Session Sync (server-side persistence for admin) ---
  adminListChatSessions(token: string) {
    return request<{ items: ServerChatSession[]; total: number }>(
      `/admin/chat/sessions`,
      { token, cache: "no-store" },
    );
  },

  adminUpsertChatSession(
    token: string,
    body: { clientId: string; title: string; pinned?: boolean },
  ) {
    return request<ServerChatSession>(`/admin/chat/sessions`, {
      token,
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  adminPatchChatSession(
    token: string,
    clientId: string,
    body: { title?: string; pinned?: boolean },
  ) {
    return request<ServerChatSession>(
      `/admin/chat/sessions/${encodeURIComponent(clientId)}`,
      {
        token,
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  },

  adminDeleteChatSession(token: string, clientId: string) {
    return request<void>(`/admin/chat/sessions/${encodeURIComponent(clientId)}`, {
      token,
      method: "DELETE",
    });
  },

  adminListSessionMessages(token: string, clientId: string) {
    return request<{ items: ServerChatMessage[]; total: number }>(
      `/admin/chat/sessions/${encodeURIComponent(clientId)}/messages`,
      { token, cache: "no-store" },
    );
  },

  adminUpsertSessionMessage(
    token: string,
    clientId: string,
    body: {
      clientId: string;
      role: "user" | "assistant" | "system";
      content: string;
      attachments?: unknown;
      tools?: unknown;
    },
  ) {
    return request<ServerChatMessage>(
      `/admin/chat/sessions/${encodeURIComponent(clientId)}/messages`,
      {
        token,
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  adminDeleteSessionMessage(
    token: string,
    clientId: string,
    msgClientId: string,
  ) {
    return request<void>(
      `/admin/chat/sessions/${encodeURIComponent(clientId)}/messages/${encodeURIComponent(msgClientId)}`,
      {
        token,
        method: "DELETE",
      },
    );
  },

  // --- Admin Chat Shares ---
  adminCreateShare(token: string, body: { title: string; payload: unknown }) {
    return request<{ hash: string; title: string }>(`/admin/chat/shares`, {
      token,
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  // --- Public Chat Share read ---
  getChatShare(hash: string) {
    return request<{
      hash: string;
      title: string;
      payload: unknown;
      viewCount: number;
      createdAt: string;
    }>(`/chat/shares/${encodeURIComponent(hash)}`, {
      // Server fire-and-forgets a view bump on each read; we still want
      // fresh title/viewCount for the page's heading.
      cache: "no-store",
    });
  },
};
