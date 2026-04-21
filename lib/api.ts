import type {
  AdminSiteSettings,
  Comment,
  LoginResponse,
  PaginatedResponse,
  Post,
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

  adminCreatePost(token: string, body: Partial<Post> & { publish?: boolean; content: string }) {
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
      }),
    });
  },

  adminUpdatePost(token: string, id: number, body: Partial<Post> & { publish?: boolean; content: string }) {
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
};
