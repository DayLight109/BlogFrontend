"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import {
  ApiError,
  api,
  getChatConfig,
  streamChatCompletion,
  toApiContent,
  type ChatAPIMessage,
  type ChatAttachment,
  type ChatConfig,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

import {
  deleteSession as syncDeleteSession,
  mergeSessions,
  pullAllSessions,
  pushMessage as syncPushMessage,
  pushSessionMeta,
  type SyncConversation,
} from "./sync";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Kiri AI · Correspondence
 *
 *  This is a chat UI, but on purpose it doesn't look like one. The page is
 *  staged as a literary correspondence: a dialogue from a transcript, set in
 *  Fraunces / Source Serif on the same cream paper as the rest of the site.
 *  No bubbles. No sidebars-with-icons. Just speakers, lines, and ornaments.
 *
 *  v2 store key — old `kiri-chat-conversations:v1` had UTF-8 encoding
 *  damage from a previous save (Chinese chars → mojibake). Bumping cleared.
 *  Attachments and per-conversation drafts were added later but reuse the
 *  v2 key — old payloads stay forward-compatible since both fields are
 *  optional on read.
 * ────────────────────────────────────────────────────────────────────────── */

type Role = "user" | "assistant";
interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: ChatAttachment[];
  // Names of tools the upstream model used while generating this message.
  // Populated from the `event: tool` SSE event during streaming. Surfaced
  // as a small badge next to the speaker label.
  tools?: string[];
  createdAt: string;
}
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  draft?: { text: string; attachments: ChatAttachment[] };
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "kiri-chat:v2";
const ACTIVE_KEY = "kiri-chat-active:v2";
const TOOLS_KEY = "kiri-chat-tools:v1";

const MAX_ATTACHMENTS = 10;
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024; // ~8MB ceiling on the data URL string
const IMAGE_URL_RE = /^https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?\S*)?$/i;

// Persistent toggles for the input dock toolbar.
// `model: null` means "use whatever the server reports as default" — so the
// stored preference doesn't go stale when ops swap the default model.
type ToolPrefs = {
  webSearch: boolean;
  deepThinking: boolean;
  model: string | null;
};

const DEFAULT_TOOL_PREFS: ToolPrefs = {
  webSearch: false,
  deepThinking: false,
  model: null,
};

// One row in the @-reference popover. Posts come from the public search
// endpoint; "msg" rows are matches against the current conversation only —
// we don't cross conversations on purpose, since a quote drifts in meaning
// once you remove it from its surrounding thread.
type RefResult =
  | { kind: "post"; slug: string; title: string; summary?: string | null }
  | {
      kind: "msg";
      messageId: string;
      role: Role;
      snippet: string;
      createdAt: string;
    };

const PROMPT_FRAGMENTS = [
  "Help me draft a piece on quiet ambition",
  "Polish this paragraph for rhythm and clarity",
  "Plan a research outline for an essay",
  "Rewrite this microcopy in a calmer voice",
];

const OPENERS = [
  "How shall we begin?",
  "What are you thinking about today?",
  "Where would you like to start?",
];

/* helpers ─────────────────────────────────────────────────────────────────── */

const nowISO = () => new Date().toISOString();
const mid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function emptyConversation(): Conversation {
  const t = nowISO();
  return {
    id: mid(),
    title: "Untitled",
    messages: [],
    createdAt: t,
    updatedAt: t,
  };
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"],
  [100, "c"], [90, "xc"], [50, "l"], [40, "xl"],
  [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];
function toRoman(n: number): string {
  if (n <= 0) return "";
  let out = "";
  for (const [v, s] of ROMAN) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

function titleFrom(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "Untitled";
  return t.length > 48 ? `${t.slice(0, 47).trimEnd()}…` : t;
}

function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503)
      return "Kiri AI hasn't been configured yet (missing OPENAI_API_KEY).";
    if (e.status === 429)
      return "Too many words too quickly. Try again in a moment.";
    if (e.status >= 500) return "The AI provider couldn't be reached.";
    try {
      const parsed = JSON.parse(e.message) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      /* fall through */
    }
    return e.message || "Something didn't go through.";
  }
  return e instanceof Error ? e.message : "The line went quiet.";
}

/* export helpers ──────────────────────────────────────────────────────────── */

// Stage a Blob as a one-shot download. Anchor is appended/clicked/removed
// synchronously; revoking the URL on the next tick is enough — Chrome/Firefox
// have already started the download by then.
function downloadBlob(name: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// "Untitled — anything weird" → "Untitled-anything-weird" — for filenames.
function slugifyTitle(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "conversation"
  );
}

function exportMarkdown(c: Conversation): string {
  const head = `# ${c.title}\n\n_${fmtDay(c.createdAt)} · ${c.messages.length} ${
    c.messages.length === 1 ? "line" : "lines"
  }_\n\n`;
  const body = c.messages
    .map((m) => {
      const who = m.role === "user" ? "## You" : "## Kiri AI";
      const time = fmtTime(m.createdAt);
      const atts = (m.attachments ?? [])
        .map((a) =>
          a.kind === "image"
            ? `![${a.name ?? "image"}](${a.url})`
            : `_(file: ${a.name ?? "untitled"})_`,
        )
        .join("\n");
      const trailer = atts ? `\n\n${atts}` : "";
      return `${who} _(${time})_\n\n${m.content || "_(empty)_"}${trailer}`;
    })
    .join("\n\n---\n\n");
  return head + body + "\n";
}

function exportJSON(c: Conversation): string {
  return JSON.stringify(c, null, 2);
}

// Friendly label for the tool badge. Upstream tool names are snake_cased
// and version-suffixed (e.g. "web_search_preview", "web_search_20250305");
// we just want the user to see the gist.
function prettyToolName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("web_search") || n === "web") return "web search used";
  if (n.includes("code_interpreter")) return "code interpreter used";
  if (n.includes("file_search")) return "file search used";
  if (n.includes("retrieval")) return "retrieval used";
  return `${name.replace(/_/g, " ")} used`;
}

/* @-reference helpers ─────────────────────────────────────────────────────── */

// Look at the value-up-to-cursor for a fresh @-token. Returns the start
// index of the literal '@' so callers can compute the replacement window.
// Token cap of 40 chars means @-mentions won't keep "matching" if the user
// pastes a huge URL after one — they expect typing to act normally then.
function scanForRefToken(
  value: string,
  caret: number,
): { start: number; q: string } | null {
  if (caret <= 0 || caret > value.length) return null;
  const slice = value.slice(0, caret);
  // Anchor: start-of-string OR the @-token starts after whitespace, so we
  // don't misfire on email addresses or URLs containing '@'.
  const m = slice.match(/(?:^|[\s\n])@([^\s@]{0,40})$/);
  if (!m) return null;
  return { start: caret - m[1].length - 1, q: m[1] };
}

// Make a one-line snippet from a message body. Used for "msg" ref previews
// in the popover and for the inserted quote body.
function snippetOf(s: string, max = 120): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

// Render a chosen reference into a markdown blockquote that travels well
// both in the chat transcript and in the prompt sent to the model.
function formatRef(r: RefResult): string {
  if (r.kind === "post") {
    const lines = [
      `> ref · post "${r.title}"`,
      `> /posts/${r.slug}`,
    ];
    const sm = (r.summary ?? "").trim();
    if (sm) lines.push(`> Summary: ${snippetOf(sm, 240)}`);
    return lines.join("\n") + "\n\n";
  }
  const who = r.role === "user" ? "you" : "Kiri";
  return `> ref · earlier (${who}, ${fmtTime(r.createdAt)})\n> ${snippetOf(
    r.snippet,
    240,
  )}\n\n`;
}

/* attachments ─────────────────────────────────────────────────────────────── */

// Recognized text-source filenames we'll read with FileReader.readAsText.
// We don't trust file.type alone — Windows often returns "" for .ts / .py /
// .toml etc. — so the extension list backs it up.
const TEXT_FILE_EXT_RE =
  /\.(?:txt|md|markdown|js|jsx|mjs|cjs|ts|tsx|py|go|rs|java|kt|swift|c|h|cpp|cc|hpp|cs|rb|php|sh|bash|zsh|sql|yaml|yml|toml|ini|env|conf|json|css|scss|html|xml|tex)$/i;
const TEXT_MAX_CHARS = 50_000; // hard cap on per-file text body
const TEXT_MAX_BYTES = 4 * 1024 * 1024; // 4 MB raw

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json") return true;
  if (file.type === "application/xml") return true;
  return TEXT_FILE_EXT_RE.test(file.name);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<ChatAttachment | null> {
  // PDF: extract text via pdfjs (client-only). Heavy import is dynamic so the
  // bundle isn't loaded until the user actually attaches a PDF.
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    try {
      const { extractPdfText } = await import("@/lib/pdf");
      const text = (await extractPdfText(file)).slice(0, TEXT_MAX_CHARS);
      if (!text.trim()) {
        toast.error(`${file.name || "PDF"} contained no extractable text.`);
        return null;
      }
      return {
        id: mid(),
        kind: "text",
        url: "",
        text,
        name: file.name || "document.pdf",
        size: file.size,
        mime: "application/pdf",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to read PDF";
      toast.error(msg);
      return null;
    }
  }

  // Plain text / source code: FileReader.readAsText (UTF-8 default).
  if (isTextLikeFile(file)) {
    if (file.size > TEXT_MAX_BYTES) {
      toast.error(`${file.name || "file"} is over 4MB; please trim it.`);
      return null;
    }
    let text: string;
    try {
      text = (await file.text()).slice(0, TEXT_MAX_CHARS);
    } catch {
      toast.error(`Failed to read ${file.name || "file"}.`);
      return null;
    }
    if (!text.trim()) {
      toast.error(`${file.name || "file"} is empty.`);
      return null;
    }
    return {
      id: mid(),
      kind: "text",
      url: "",
      text,
      name: file.name || "snippet.txt",
      size: file.size,
      mime: file.type || "text/plain",
    };
  }

  // Image: keep the existing data-URL path. Anything not pdf/text/image is
  // rejected with a hint — we don't silently accept unknown types because
  // the wire payload is opinionated.
  if (!file.type.startsWith("image/")) {
    toast.error(`Skipped: ${file.name || "file"} isn't an image, PDF, or text file.`);
    return null;
  }
  if (file.size > 6 * 1024 * 1024) {
    toast.error(`${file.name || "image"} is over 6MB, please use a smaller file.`);
    return null;
  }
  let url: string;
  try {
    url = await fileToDataUrl(file);
  } catch {
    toast.error(`Failed to read ${file.name || "image"}.`);
    return null;
  }
  if (url.length > MAX_DATA_URL_BYTES) {
    toast.error(`${file.name || "image"} is too large after encoding.`);
    return null;
  }
  return {
    id: mid(),
    kind: "image",
    url,
    name: file.name || undefined,
    size: file.size,
    mime: file.type || undefined,
  };
}

/* component ───────────────────────────────────────────────────────────────── */

export function ChatInterface() {
  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<ChatAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toolPrefs, setToolPrefs] = useState<ToolPrefs>(DEFAULT_TOOL_PREFS);
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);
  // @-reference popover state. `refQuery` open ↔ popover visible. `start` is
  // the index of the literal '@' in the textarea so we can replace [start..caret]
  // on selection. `refIdx` is the keyboard-cursor row in the result list.
  const [refQuery, setRefQuery] = useState<{ start: number; q: string } | null>(null);
  const [refResults, setRefResults] = useState<RefResult[]>([]);
  const [refIdx, setRefIdx] = useState(0);

  // Auth state — populated by the silent refresh below. Drives admin-only
  // affordances (memory link in the header, server-side session sync in §7).
  const authUser = useAuth((s) => s.user);
  const accessToken = useAuth((s) => s.accessToken);
  const setAuth = useAuth((s) => s.setAuth);
  const isAdmin = authUser?.role === "admin";
  const [opener] = useState(
    () => OPENERS[Math.floor(Math.random() * OPENERS.length)],
  );

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLDetailsElement>(null);
  const exportRef = useRef<HTMLDetailsElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLLIElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stuckBottom = useRef(true);

  /* hydrate from localStorage once */
  useEffect(() => {
    let items: Conversation[] = [];
    let id = "";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Conversation[];
        if (Array.isArray(parsed)) items = parsed;
      }
    } catch {
      /* corrupt → reset */
    }
    if (items.length === 0) items = [emptyConversation()];
    try {
      const a = localStorage.getItem(ACTIVE_KEY);
      if (a && items.some((c) => c.id === a)) id = a;
    } catch {
      /* ignore */
    }
    if (!id) id = items[0].id;
    // Hydration must read external state (localStorage) and seed React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(items);
    setActiveId(id);
    setHydrated(true);
  }, []);

  /* persist */
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      /* quota / private mode */
    }
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    try {
      localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      /* ignore */
    }
  }, [activeId, hydrated]);

  /* tool prefs — restore on mount and pull capability descriptor */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOOLS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ToolPrefs>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setToolPrefs((p) => ({ ...p, ...parsed }));
      }
    } catch {
      /* corrupt → keep defaults */
    }
    getChatConfig()
      .then(setChatConfig)
      .catch(() => {
        /* unreachable backend → stay with default model picker hidden */
      });
  }, []);

  /* Best-effort auth refresh on mount. Anonymous users get a 401 here
     which we silently ignore; logged-in admins (with a valid refresh
     cookie) light up the admin-only affordances — memory link in the
     header, server-side session sync, share publicly button. */
  useEffect(() => {
    let cancelled = false;
    api
      .refresh()
      .then((r) => {
        if (cancelled) return;
        setAuth(r.accessToken, r.expiresAt, r.user);
      })
      .catch(() => {
        /* anonymous — no admin features */
      });
    return () => {
      cancelled = true;
    };
  }, [setAuth]);

  /* Hydrate sessions from server once we know we're authed admin. Server
     is the source of truth on overlap (matched by client_id); local-only
     threads are preserved and pushed up after merge so the next pull is
     consistent. Anonymous users skip this entirely. */
  const [serverHydrated, setServerHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!isAdmin || !accessToken) return;
    if (serverHydrated) return;
    let cancelled = false;
    pullAllSessions(accessToken)
      .then((server) => {
        if (cancelled) return;
        const local: SyncConversation[] = conversations.map((c) => ({
          id: c.id,
          title: c.title,
          messages: c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachments: m.attachments,
            tools: m.tools,
            createdAt: m.createdAt,
          })),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));
        const merged = mergeSessions(local, server);
        if (merged.length === 0) return; // nothing to do
        // Convert back to local Conversation shape, preserving drafts that
        // existed on local rows (server doesn't store drafts).
        const draftsByID = new Map(conversations.map((c) => [c.id, c.draft]));
        const next: Conversation[] = merged.map((c) => ({
          id: c.id,
          title: c.title,
          messages: c.messages.map<Message>((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachments: m.attachments,
            tools: m.tools,
            createdAt: m.createdAt,
          })),
          draft: draftsByID.get(c.id),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));
        setConversations(next);
        // If server didn't have some local rows, push them. Done after
        // setState so the order is server-aware.
        const serverIDs = new Set(server.map((s) => s.id));
        const localOnly = local.filter((c) => !serverIDs.has(c.id));
        for (const c of localOnly) {
          // Best-effort fan-out — failures get logged in sync.ts.
          void pushSessionMeta(accessToken, c);
          for (const m of c.messages) {
            void syncPushMessage(accessToken, c.id, m);
          }
        }
      })
      .catch(() => {
        /* sync down → just keep using local */
      })
      .finally(() => {
        if (!cancelled) setServerHydrated(true);
      });
    return () => {
      cancelled = true;
    };
    // We deliberately don't include `conversations` in deps — this runs
    // once after auth hydrates. Subsequent writes go through the
    // write-through helper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isAdmin, accessToken, serverHydrated]);

  // Push the current conversation's metadata + a single message to server.
  // Called from the streaming completion finally-blocks so we sync once per
  // assistant turn rather than once per delta.
  const writeThroughMessage = useCallback(
    (sessionClientId: string, sessionTitle: string, message: Message) => {
      if (!isAdmin || !accessToken) return;
      void pushSessionMeta(accessToken, {
        id: sessionClientId,
        title: sessionTitle,
        messages: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      void syncPushMessage(accessToken, sessionClientId, {
        id: message.id,
        role: message.role,
        content: message.content,
        attachments: message.attachments,
        tools: message.tools,
        createdAt: message.createdAt,
      });
    },
    [isAdmin, accessToken],
  );

  /* tool prefs — persist on change. Frequency is low (a few clicks per
     session) so writing without debounce is fine. */
  useEffect(() => {
    try {
      localStorage.setItem(TOOLS_KEY, JSON.stringify(toolPrefs));
    } catch {
      /* ignore */
    }
  }, [toolPrefs]);

  /* @-reference search. Combines: top-3 posts from the server-side search
     endpoint (debounced 250ms) + up-to-3 local message matches from the
     active conversation. Empty token (`@` alone) shows nothing — the user
     hasn't told us what to search for yet. */
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      if (!refQuery) {
        setRefResults([]);
        return;
      }
      const q = refQuery.q.trim();
      if (!q) {
        setRefResults([]);
        return;
      }
      // Local message matches first — they're cheap. We look up `active`
      // inside the timer (rather than via a useMemo dep) because the memo
      // is declared further down the component body and pulling it forward
      // would tangle the dependency order.
      const lq = q.toLowerCase();
      const activeConv = conversations.find((c) => c.id === activeId);
      const msgs = (activeConv?.messages ?? [])
        .filter((m) => m.content && m.content.toLowerCase().includes(lq))
        .slice(-3)
        .reverse()
        .map<RefResult>((m) => ({
          kind: "msg",
          messageId: m.id,
          role: m.role,
          snippet: m.content,
          createdAt: m.createdAt,
        }));
      // Then ask the server for posts.
      let posts: RefResult[] = [];
      try {
        const r = await api.searchPosts(q, 1, 5);
        posts = r.items.slice(0, 3).map<RefResult>((p) => ({
          kind: "post",
          slug: p.slug,
          title: p.title,
          summary: p.summary,
        }));
      } catch {
        /* search down → just show local msgs */
      }
      if (cancelled) return;
      setRefResults([...posts, ...msgs]);
      setRefIdx(0);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // We intentionally exclude `conversations` — refQuery already reruns
    // when the user keeps typing, and re-running on every conversation
    // mutation would thrash the popover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refQuery, activeId]);

  function closeRefPopover() {
    setRefQuery(null);
    setRefResults([]);
    setRefIdx(0);
  }

  function selectRef(r: RefResult) {
    if (!refQuery) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? input.length;
    // Replace [start..caret] (the literal `@<query>`) with the formatted
    // reference. Keeps anything after the caret intact.
    const before = input.slice(0, refQuery.start);
    const after = input.slice(caret);
    const insertion = formatRef(r);
    const next = before + insertion + after;
    const newCaret = before.length + insertion.length;
    setInput(next);
    closeRefPopover();
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(newCaret, newCaret);
    });
  }

  /* close the model popover when clicking outside it. <details> only
     toggles on summary clicks by default, so without this the popover
     stays open after picking somewhere else on the page. */
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target;
      // Same outside-click handling for both popovers — kept in one listener
      // so click events don't double-fire.
      for (const ref of [modelRef, exportRef]) {
        const el = ref.current;
        if (!el || !el.open) continue;
        if (t instanceof Node && el.contains(t)) continue;
        el.removeAttribute("open");
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  /* textarea autogrow */
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  /* track whether user is anchored to bottom of scroll area;
     only auto-scroll if so — otherwise reading older messages stays put */
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onScroll = () => {
      const dist = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
      stuckBottom.current = dist < 80;
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => sc.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stuckBottom.current) return;
    tailRef.current?.scrollIntoView({ block: "end" });
  });

  /* abort any in-flight request on unmount */
  useEffect(() => () => abortRef.current?.abort(), []);

  /* derived ---------------------------------------------------------------- */

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? conversations[0],
    [conversations, activeId],
  );
  const messages = active?.messages ?? [];
  const userMsgCount = messages.filter((m) => m.role === "user").length;

  const filtered = useMemo(() => {
    const list = [...conversations].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [conversations, search]);

  /* mutators --------------------------------------------------------------- */

  function patch(id: string, fn: (c: Conversation) => Conversation) {
    setConversations((items) => items.map((c) => (c.id === id ? fn(c) : c)));
  }

  function newChat() {
    if (active && active.messages.length === 0 && !input && pending.length === 0) {
      taRef.current?.focus();
      setDrawerOpen(false);
      return;
    }
    abortRef.current?.abort();
    const c = emptyConversation();
    setConversations((items) => [c, ...items]);
    setActiveId(c.id);
    setInput("");
    setPending([]);
    setEditingId(null);
    setError(null);
    setStreaming(false);
    setDrawerOpen(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function discard(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    const next = conversations.filter((c) => c.id !== id);
    if (next.length === 0) {
      const c = emptyConversation();
      setConversations([c]);
      setActiveId(c.id);
    } else {
      setConversations(next);
      if (id === activeId) setActiveId(next[0].id);
    }
    // Mirror the deletion to server when admin. CASCADE on the foreign key
    // takes the messages with it, so we only need the session-level call.
    if (isAdmin && accessToken) {
      void syncDeleteSession(accessToken, id);
    }
  }

  // Clone the active thread up to and including a given message into a fresh
  // conversation, then jump into it. Both the source and the branch are kept
  // — that's the point: the original thread stays so you can revisit a
  // different fork later. New IDs everywhere so the cloned messages don't
  // collide with the originals on (eventual) server sync.
  function branchFromMessage(messageId: string) {
    if (!active) return;
    const idx = active.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    abortRef.current?.abort();
    const slice = active.messages.slice(0, idx + 1).map((m) => ({
      ...m,
      id: mid(),
      attachments: m.attachments?.map((a) => ({ ...a, id: mid() })),
    }));
    const branchedTitle = active.title.endsWith("· branch")
      ? active.title
      : `${active.title} · branch`;
    const t = nowISO();
    const cloned: Conversation = {
      id: mid(),
      title: titleFrom(branchedTitle),
      messages: slice,
      createdAt: t,
      updatedAt: t,
    };
    setConversations((items) => [cloned, ...items]);
    setActiveId(cloned.id);
    setInput("");
    setPending([]);
    setEditingId(null);
    setError(null);
    setStreaming(false);
    setDrawerOpen(false);
    requestAnimationFrame(() => taRef.current?.focus());
    toast.success("Branched into a new thread");
  }

  function exportConversation(format: "md" | "json") {
    if (!active) return;
    const base = slugifyTitle(active.title);
    if (format === "md") {
      downloadBlob(`${base}.md`, "text/markdown;charset=utf-8", exportMarkdown(active));
    } else {
      downloadBlob(`${base}.json`, "application/json;charset=utf-8", exportJSON(active));
    }
    exportRef.current?.removeAttribute("open");
    toast.success(`Exported as ${format.toUpperCase()}`);
  }

  // Build a server-safe payload for share. We strip oversized data: image
  // attachments to keep the payload under the server's 2MB cap; users get a
  // toast warning if anything was dropped. Text-kind attachments and small
  // images pass through.
  async function shareConversation() {
    if (!active || !accessToken) return;
    if (active.messages.length === 0) {
      toast.error("Nothing to share yet — write something first.");
      return;
    }
    const ok = window.confirm(
      `Share this thread (${active.messages.length} ${
        active.messages.length === 1 ? "line" : "lines"
      }) as a public read-only link? Anyone with the URL will be able to read it.`,
    );
    if (!ok) return;

    const sharedMessages = active.messages.map((m) => {
      if (!m.attachments || m.attachments.length === 0) return m;
      const filtered = m.attachments.filter((a) => {
        if (a.kind === "image" && a.url.startsWith("data:")) {
          // Drop big inlined images — the share page can't host them and
          // they'd blow the payload cap.
          return a.url.length < 200_000;
        }
        return true;
      });
      return { ...m, attachments: filtered.length > 0 ? filtered : undefined };
    });
    const dropped = active.messages.reduce(
      (n, m, i) =>
        n + ((m.attachments?.length ?? 0) - (sharedMessages[i].attachments?.length ?? 0)),
      0,
    );

    const payload: Conversation = {
      ...active,
      messages: sharedMessages,
      draft: undefined,
    };
    exportRef.current?.removeAttribute("open");
    try {
      const r = await api.adminCreateShare(accessToken, {
        title: active.title,
        payload,
      });
      const url = `${window.location.origin}/chat/shared/${r.hash}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(
          dropped > 0
            ? `Copied. (${dropped} oversized image${dropped > 1 ? "s" : ""} were stripped)`
            : "Share link copied to clipboard",
        );
      } catch {
        toast.success(`Share link: ${url}`);
      }
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  /* attachment input helpers ---------------------------------------------- */

  const addAttachmentsFromFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const room = MAX_ATTACHMENTS - pending.length;
      if (room <= 0) {
        toast.error(`At most ${MAX_ATTACHMENTS} attachments per message.`);
        return;
      }
      const slice = list.slice(0, room);
      if (list.length > room) {
        toast.error(
          `Only the first ${room} of ${list.length} files were attached.`,
        );
      }
      const next: ChatAttachment[] = [];
      for (const f of slice) {
        const a = await fileToAttachment(f);
        if (a) next.push(a);
      }
      if (next.length > 0) {
        setPending((cur) => [...cur, ...next]);
      }
    },
    [pending.length],
  );

  const addAttachmentFromUrl = useCallback(
    (url: string): boolean => {
      if (!IMAGE_URL_RE.test(url)) return false;
      if (pending.length >= MAX_ATTACHMENTS) {
        toast.error(`At most ${MAX_ATTACHMENTS} attachments per message.`);
        return true;
      }
      setPending((cur) => [
        ...cur,
        {
          id: mid(),
          kind: "image",
          url,
          name: url.split("/").pop()?.split("?")[0],
        },
      ]);
      return true;
    },
    [pending.length],
  );

  function removeAttachment(id: string) {
    setPending((cur) => cur.filter((a) => a.id !== id));
  }

  /* message-level actions ------------------------------------------------- */

  async function copyMessage(m: Message) {
    try {
      await navigator.clipboard.writeText(m.content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }

  async function regenerateAssistant(assistantId: string) {
    if (!active) return;
    abortRef.current?.abort();
    abortRef.current = null;
    const idx = active.messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    // require a user message before this point — otherwise nothing to regen from
    const trimmed = active.messages.slice(0, idx);
    const lastUser = [...trimmed].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      toast.error("Nothing to regenerate from.");
      return;
    }
    const id = active.id;
    const placeholder: Message = {
      id: mid(),
      role: "assistant",
      content: "",
      createdAt: nowISO(),
    };
    patch(id, (c) => ({
      ...c,
      messages: [...trimmed, placeholder],
      updatedAt: nowISO(),
    }));
    setError(null);
    setStreaming(true);
    stuckBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    const history: ChatAPIMessage[] = trimmed
      .filter((m) => m.content || (m.attachments && m.attachments.length > 0))
      .map((m) => ({
        role: m.role,
        content: toApiContent(m.content, m.attachments),
      }));

    // Track the streamed content/tools locally so we can sync the final
    // shape to server in the finally block — React state would be stale by
    // the time we reach finally.
    let finalContent = "";
    const finalTools: string[] = [];

    try {
      await streamChatCompletion(
        history,
        (delta) => {
          finalContent += delta;
          patch(id, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === placeholder.id
                ? { ...m, content: m.content + delta }
                : m,
            ),
            updatedAt: nowISO(),
          }));
        },
        controller.signal,
        {
          webSearch: toolPrefs.webSearch,
          deepThinking: toolPrefs.deepThinking,
          model: toolPrefs.model ?? undefined,
          onTool: (name) => {
            if (!finalTools.includes(name)) finalTools.push(name);
            patch(id, (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === placeholder.id
                  ? {
                      ...m,
                      tools: m.tools?.includes(name)
                        ? m.tools
                        : [...(m.tools ?? []), name],
                    }
                  : m,
              ),
            }));
          },
        },
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(friendlyError(err));
      patch(id, (c) => ({
        ...c,
        messages: c.messages.filter(
          (m) => m.id !== placeholder.id || m.content.length > 0,
        ),
        updatedAt: nowISO(),
      }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
      // Write-through: push the final regenerated assistant turn to server.
      // Title is taken from the active conversation at this point — it
      // hasn't changed during regeneration (only the assistant payload did).
      if (finalContent && active) {
        writeThroughMessage(id, active.title, {
          ...placeholder,
          content: finalContent,
          tools: finalTools.length > 0 ? finalTools : undefined,
        });
      }
    }
  }

  function startEditUser(userId: string) {
    if (!active) return;
    if (streaming) {
      toast.error("Wait for the current reply to finish.");
      return;
    }
    const target = active.messages.find((m) => m.id === userId);
    if (!target || target.role !== "user") return;
    // Snapshot before mutating state — patch below would otherwise read stale values.
    const text = target.content;
    const atts = target.attachments ? [...target.attachments] : [];
    const idx = active.messages.findIndex((m) => m.id === userId);
    patch(active.id, (c) => ({
      ...c,
      messages: c.messages.slice(0, idx),
      updatedAt: nowISO(),
    }));
    setEditingId(userId);
    setInput(text);
    setPending(atts);
    setError(null);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      const len = text.length;
      taRef.current?.setSelectionRange(len, len);
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setInput("");
    setPending([]);
  }

  async function send(text: string, attachments: ChatAttachment[] = []) {
    const content = text.trim();
    if ((!content && attachments.length === 0) || streaming || !active) return;

    const id = active.id;
    const userMsg: Message = {
      id: mid(),
      role: "user",
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: nowISO(),
    };
    const placeholder: Message = {
      id: mid(),
      role: "assistant",
      content: "",
      createdAt: nowISO(),
    };

    const isFirst = !messages.some((m) => m.role === "user");
    const titleSeed = content || (attachments[0]?.name ?? "Image conversation");
    patch(id, (c) => ({
      ...c,
      title: isFirst ? titleFrom(titleSeed) : c.title,
      messages: [...c.messages, userMsg, placeholder],
      draft: undefined,
      updatedAt: nowISO(),
    }));
    setInput("");
    setPending([]);
    setEditingId(null);
    setError(null);
    setStreaming(true);
    stuckBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const history: ChatAPIMessage[] = [...messages, userMsg]
      .filter((m) => m.content || (m.attachments && m.attachments.length > 0))
      .map((m) => ({
        role: m.role,
        content: toApiContent(m.content, m.attachments),
      }));

    // Track final shape locally — finally block reads from these because
    // React state is stale by then.
    let finalContent = "";
    const finalTools: string[] = [];
    const finalTitle = isFirst ? titleFrom(titleSeed) : active.title;

    try {
      await streamChatCompletion(
        history,
        (delta) => {
          finalContent += delta;
          patch(id, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === placeholder.id
                ? { ...m, content: m.content + delta }
                : m,
            ),
            updatedAt: nowISO(),
          }));
        },
        controller.signal,
        {
          webSearch: toolPrefs.webSearch,
          deepThinking: toolPrefs.deepThinking,
          model: toolPrefs.model ?? undefined,
          onTool: (name) => {
            if (!finalTools.includes(name)) finalTools.push(name);
            patch(id, (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === placeholder.id
                  ? {
                      ...m,
                      tools: m.tools?.includes(name)
                        ? m.tools
                        : [...(m.tools ?? []), name],
                    }
                  : m,
              ),
            }));
          },
        },
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(friendlyError(err));
      // strip the empty assistant placeholder; keep partial content if any
      patch(id, (c) => ({
        ...c,
        messages: c.messages.filter(
          (m) => m.id !== placeholder.id || m.content.length > 0,
        ),
        updatedAt: nowISO(),
      }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
      // Write-through: push the user turn + final assistant turn to server.
      // Done here (not during streaming) so each turn pushes once. Sessions
      // are upserted by client_id on every message push, so duplicates are
      // absorbed.
      writeThroughMessage(id, finalTitle, userMsg);
      if (finalContent) {
        writeThroughMessage(id, finalTitle, {
          ...placeholder,
          content: finalContent,
          tools: finalTools.length > 0 ? finalTools : undefined,
        });
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  /* draft persistence ----------------------------------------------------- */

  // When the active conversation changes, restore its saved draft.
  useEffect(() => {
    if (!hydrated || !active) return;
    // Restoring a draft is the entry point into a thread, so seeding React
    // state from external (storage) state is the intended behavior here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInput(active.draft?.text ?? "");
    setPending(active.draft?.attachments ?? []);
    setEditingId(null);
    // We intentionally only re-run on activeId — the draft is the per-thread
    // entry point, and we don't want every conversations[] write to clobber
    // the in-flight typing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, hydrated]);

  // Debounced write of the current input/attachments back to the conversation
  // as a draft. 400ms keeps localStorage churn low during active typing.
  useEffect(() => {
    if (!hydrated || !active) return;
    const id = active.id;
    const t = setTimeout(() => {
      patch(id, (c) => {
        const same =
          c.draft?.text === input &&
          (c.draft?.attachments?.length ?? 0) === pending.length;
        if (same) return c;
        const empty = !input && pending.length === 0;
        return { ...c, draft: empty ? undefined : { text: input, attachments: pending } };
      });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, pending, activeId, hydrated]);

  /* keyboard shortcuts ---------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      // Cmd/Ctrl+K → new chat (anywhere on page).
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        newChat();
        return;
      }
      // Esc has a fallback chain: editing > drawer > streaming.
      if (e.key === "Escape") {
        if (editingId) {
          e.preventDefault();
          cancelEdit();
        } else if (drawerOpen) {
          e.preventDefault();
          setDrawerOpen(false);
        } else if (streaming) {
          e.preventDefault();
          stop();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, drawerOpen, streaming, activeId]);

  /* render ----------------------------------------------------------------- */

  if (!hydrated || !active) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[68rem] items-center justify-center px-6">
        <span className="caps text-muted-foreground">opening the page…</span>
      </div>
    );
  }

  const activeIndex = filtered.findIndex((c) => c.id === active.id);

  /* the index sidebar — used in both desktop sticky pane and mobile drawer */
  const indexPane = (
    <div className="flex h-full max-h-full flex-col">
      <div className="caps mb-5 flex items-center gap-3 text-muted-foreground">
        <span className="h-px w-7 bg-site-accent" aria-hidden />
        <span>Index</span>
        <span className="opacity-60" aria-hidden>· 索引</span>
      </div>

      <div className="kiri-search relative mb-5 pb-1.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full bg-transparent border-0 pb-1 pl-0 pr-2 font-reading text-sm italic outline-none placeholder:text-muted-foreground/45"
        />
        <span className="kiri-search-rule" aria-hidden />
      </div>

      <ol className="flex-1 -mr-2 space-y-3 overflow-y-auto pr-2">
        {filtered.length === 0 && (
          <li className="font-reading text-sm italic text-muted-foreground/60">
            Nothing matches “{search}”.
          </li>
        )}
        {filtered.map((c, i) => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id} className="kiri-index-li relative">
              <button
                type="button"
                onClick={() => {
                  setActiveId(c.id);
                  setDrawerOpen(false);
                }}
                className={cn(
                  "kiri-index-item group block w-full text-left",
                  isActive && "is-active",
                )}
              >
                <div className="flex items-baseline gap-2 pr-12">
                  <span className="kiri-roman caps tabular shrink-0 text-muted-foreground/55 group-[.is-active]:text-site-accent transition-colors">
                    {toRoman(i + 1)}.
                  </span>
                  <span className="font-reading text-sm leading-snug text-foreground/85 group-hover:text-foreground transition-colors line-clamp-2">
                    {c.title}
                  </span>
                </div>
                <div className="mt-1 ml-7 caps tabular flex items-center gap-2 text-[0.6rem] text-muted-foreground/55">
                  <span>{fmtDay(c.updatedAt)}</span>
                  <span className="opacity-60" aria-hidden>·</span>
                  <span className="tabular">
                    {c.messages.length}{" "}
                    {c.messages.length === 1 ? "line" : "lines"}
                  </span>
                </div>
                <span className="kiri-index-rule" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => discard(c.id, e)}
                className="kiri-index-del caps absolute right-0 top-0.5 text-[0.58rem] text-muted-foreground/40 hover:text-destructive transition-[color,opacity]"
                aria-label="Discard this conversation"
              >
                discard
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 border-t border-site-rule pt-4">
        <button
          type="button"
          onClick={newChat}
          className="caps group inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-site-accent"
        >
          <span className="text-site-accent">+</span>
          <span>Begin anew</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="kiri-chat min-h-[calc(100vh-5rem)]">
      <div className="mx-auto grid w-full max-w-[80rem] gap-0 px-6 py-8 md:grid-cols-[15rem_minmax(0,1fr)] md:px-10 md:py-10">
        {/* DESKTOP INDEX */}
        <aside className="hidden md:block">
          <div className="sticky top-8 max-h-[calc(100vh-5rem)]">
            {indexPane}
          </div>
        </aside>

        {/* PAGE */}
        <main className="kiri-page relative flex h-[calc(100vh-11rem)] min-h-[600px] flex-col md:border-l md:border-site-rule/60 md:pl-10">
          {/* Header */}
          <header className="mb-9 md:mb-12">
            <div className="caps mb-4 flex items-baseline gap-3 text-muted-foreground">
              <span className="hidden sm:inline">Correspondence</span>
              <span className="hidden sm:inline opacity-50" aria-hidden>·</span>
              <span className="font-reading italic normal-case tracking-normal text-foreground/85 truncate">
                {active.title}
              </span>
              <span
                className="ml-auto inline-flex items-baseline gap-2 transition-opacity duration-300"
                style={{ opacity: streaming ? 1 : 0 }}
                aria-hidden={!streaming}
              >
                <span className="kiri-pulse" aria-hidden />
                <span className="text-site-accent">composing</span>
              </span>
              {isAdmin && (
                <Link
                  href="/chat/memories"
                  className="caps text-[0.62rem] text-muted-foreground transition-colors hover:text-site-accent"
                  title="View and prune Kiri's memory"
                >
                  · memory
                </Link>
              )}
              <details
                ref={exportRef}
                className="chat-export-menu relative"
              >
                <summary
                  className="chat-export-trigger"
                  aria-label="Conversation actions"
                  title="Conversation actions"
                >
                  <span aria-hidden>⋯</span>
                </summary>
                <div className="chat-export-list" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => exportConversation("md")}
                    disabled={messages.length === 0}
                  >
                    <span aria-hidden>↓</span>
                    <span>export markdown</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => exportConversation("json")}
                    disabled={messages.length === 0}
                  >
                    <span aria-hidden>{"{}"}</span>
                    <span>export json</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void shareConversation()}
                      disabled={messages.length === 0}
                      title="Make a public read-only link to this thread"
                    >
                      <span aria-hidden>↗</span>
                      <span>share publicly</span>
                    </button>
                  )}
                </div>
              </details>
            </div>

            <h1 className="font-display text-[clamp(2rem,4.6vw,3.4rem)] font-light leading-[1.04] tracking-[-0.022em] text-foreground">
              A page,{" "}
              <span className="italic text-site-accent">in</span>{" "}
              dialogue<span className="text-site-accent">.</span>
            </h1>

            <div className="mt-5 flex items-center gap-3" aria-hidden>
              <span className="font-display select-none text-xl tracking-[0.5em] text-site-accent/35">
                ⁂
              </span>
            </div>
          </header>

          {/* Mobile thread strip */}
          <div className="-mx-6 mb-6 flex items-center justify-between border-b border-site-rule px-6 pb-3 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="caps inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-site-accent"
            >
              <span aria-hidden className="opacity-60">≡</span>
              index
              <span className="caps tabular text-[0.6rem] opacity-70">
                ({filtered.length})
              </span>
            </button>
            <button
              type="button"
              onClick={newChat}
              className="caps inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-site-accent"
            >
              <span className="text-site-accent">+</span>
              new
            </button>
            <span className="caps tabular text-muted-foreground/55">
              {toRoman(activeIndex + 1) || "i"} / {toRoman(filtered.length)}
            </span>
          </div>

          {/* Messages or empty state */}
          <div
            ref={scrollRef}
            className="kiri-scroll relative -mr-2 flex-1 overflow-y-auto pr-2"
          >
            {userMsgCount === 0 ? (
              <EmptyState
                opener={opener}
                onPick={(s) => {
                  setInput(s);
                  taRef.current?.focus();
                }}
              />
            ) : (
              <ol className="space-y-12 pb-4 md:space-y-14">
                {messages.map((m, i) => {
                  const isStreaming =
                    streaming &&
                    i === messages.length - 1 &&
                    m.role === "assistant";
                  return (
                    <Exchange
                      key={m.id}
                      message={m}
                      index={i + 1}
                      isStreaming={isStreaming}
                      streaming={streaming}
                      onCopy={() => void copyMessage(m)}
                      onRetry={
                        m.role === "assistant"
                          ? () => void regenerateAssistant(m.id)
                          : undefined
                      }
                      onEdit={
                        m.role === "user"
                          ? () => startEditUser(m.id)
                          : undefined
                      }
                      onBranch={() => branchFromMessage(m.id)}
                    />
                  );
                })}
                {error && <ErrorLine text={error} />}
                <li ref={tailRef} aria-hidden className="h-1 list-none" />
              </ol>
            )}
          </div>

          {/* Input dock */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input, pending);
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types?.includes("Files")) {
                e.preventDefault();
                setDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragOver(false);
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.files?.length) return;
              e.preventDefault();
              setDragOver(false);
              void addAttachmentsFromFiles(e.dataTransfer.files);
            }}
            className={cn(
              "kiri-dock mt-7 border-t border-site-rule pt-5",
              dragOver && "kiri-dock-dropping",
            )}
          >
            {editingId && (
              <div className="chat-edit-banner">
                <span>
                  ✎ editing message · 编辑中
                </span>
                <button type="button" onClick={cancelEdit}>
                  cancel
                </button>
              </div>
            )}

            {pending.length > 0 && (
              <div className="chat-attach-row">
                {pending.map((a) => (
                  <span key={a.id} className="chat-attach-chip" data-kind={a.kind}>
                    {a.kind === "image" ? (
                      <>
                        {/* data:/remote URLs aren't routable through next/image without
                            per-host config; chip is small and short-lived. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.name ?? "attachment"} />
                        {a.name && <span className="chip-name">{a.name}</span>}
                      </>
                    ) : (
                      <>
                        <span className="chip-icon" aria-hidden>
                          {a.mime === "application/pdf" ? "PDF" : "TXT"}
                        </span>
                        <span className="chip-name">{a.name ?? "file"}</span>
                        <span className="chip-meta">
                          {a.text ? `${a.text.length.toLocaleString()} chars` : ""}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className="chip-remove"
                      aria-label={`Remove ${a.name ?? "attachment"}`}
                      onClick={() => removeAttachment(a.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="kiri-input-wrap relative">
              {refQuery && refResults.length > 0 && (
                <div className="chat-ref-popover" role="listbox" aria-label="Reference suggestions">
                  <div className="chat-ref-head">
                    <span aria-hidden>@</span>
                    <span>{refQuery.q || "type to search…"}</span>
                  </div>
                  <ul>
                    {refResults.map((r, i) => {
                      const active = i === refIdx;
                      const key =
                        r.kind === "post" ? `post:${r.slug}` : `msg:${r.messageId}`;
                      return (
                        <li
                          key={key}
                          role="option"
                          aria-selected={active}
                          data-active={active ? "1" : undefined}
                          // mousedown so we beat the textarea's onBlur close.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectRef(r);
                          }}
                          onMouseEnter={() => setRefIdx(i)}
                        >
                          <span className="ref-kind">
                            {r.kind === "post" ? "post" : "msg"}
                          </span>
                          <span className="ref-body">
                            {r.kind === "post" ? (
                              <>
                                <span className="ref-title">{r.title}</span>
                                {r.summary && (
                                  <span className="ref-summary">
                                    {snippetOf(r.summary, 80)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="ref-title">
                                  {r.role === "user" ? "you" : "Kiri"}
                                  <span className="ref-time">
                                    {" · "}
                                    {fmtTime(r.createdAt)}
                                  </span>
                                </span>
                                <span className="ref-summary">
                                  {snippetOf(r.snippet, 80)}
                                </span>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="chat-ref-foot caps">
                    <span>↑↓</span>
                    <span>navigate</span>
                    <span aria-hidden>·</span>
                    <span>enter</span>
                    <span>insert</span>
                    <span aria-hidden>·</span>
                    <span>esc</span>
                    <span>close</span>
                  </div>
                </div>
              )}
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  const v = e.target.value;
                  setInput(v);
                  // Keep the @-popover in sync with what's just left of the
                  // caret. We do this here (not in a useEffect on input)
                  // because the cursor position isn't observable through
                  // state alone — onChange has it on the DOM event target.
                  const caret = e.target.selectionStart ?? v.length;
                  setRefQuery(scanForRefToken(v, caret));
                }}
                onClick={(e) => {
                  // Re-evaluate the @-token on click — the user may have
                  // clicked into a half-typed `@foo` from elsewhere.
                  const ta = e.currentTarget;
                  setRefQuery(
                    scanForRefToken(ta.value, ta.selectionStart ?? ta.value.length),
                  );
                }}
                onBlur={() => {
                  // Delay close so a click inside the popover (which steals
                  // focus from the textarea) can land before we tear down.
                  window.setTimeout(closeRefPopover, 120);
                }}
                onKeyDown={(e) => {
                  // While the @-popover is open, hijack arrows/enter/esc.
                  if (refQuery && refResults.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setRefIdx((i) => Math.min(refResults.length - 1, i + 1));
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setRefIdx((i) => Math.max(0, i - 1));
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      selectRef(refResults[refIdx]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeRefPopover();
                      return;
                    }
                  }
                  const meta = e.ctrlKey || e.metaKey;
                  // Cmd/Ctrl+Enter forces send even during IME composition.
                  if (meta && e.key === "Enter") {
                    e.preventDefault();
                    void send(input, pending);
                    return;
                  }
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send(input, pending);
                    return;
                  }
                  // ArrowUp on an empty input → edit the last user message.
                  if (
                    e.key === "ArrowUp" &&
                    input === "" &&
                    pending.length === 0 &&
                    !editingId
                  ) {
                    const last = [...messages]
                      .reverse()
                      .find((m) => m.role === "user");
                    if (last) {
                      e.preventDefault();
                      startEditUser(last.id);
                    }
                  }
                }}
                onPaste={(e) => {
                  // Prefer clipboardData.items so we catch screenshot pastes
                  // (Chrome puts them in items, not files).
                  const items = e.clipboardData?.items;
                  const files: File[] = [];
                  if (items) {
                    for (let i = 0; i < items.length; i++) {
                      const it = items[i];
                      if (it.kind === "file") {
                        const f = it.getAsFile();
                        if (f) files.push(f);
                      }
                    }
                  }
                  if (files.length === 0 && e.clipboardData?.files?.length) {
                    for (let i = 0; i < e.clipboardData.files.length; i++) {
                      files.push(e.clipboardData.files[i]);
                    }
                  }
                  if (files.length > 0) {
                    e.preventDefault();
                    void addAttachmentsFromFiles(files);
                    return;
                  }
                  // No files — try image URL detection on the plain text.
                  const txt = e.clipboardData?.getData("text/plain")?.trim();
                  if (txt && addAttachmentFromUrl(txt)) {
                    e.preventDefault();
                  }
                }}
                rows={1}
                maxLength={20000}
                placeholder="Write a line, ask a question…"
                className="w-full resize-none border-0 bg-transparent px-0 pb-2 pt-1 font-reading text-base leading-[1.7] text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/45"
              />
              <span className="kiri-input-rule" aria-hidden />
              <span className="kiri-input-rule-focus" aria-hidden />
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf,text/*,.txt,.md,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.go,.rs,.java,.json,.yaml,.yml,.toml,.css,.scss,.html,.xml,.sql,.sh"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) {
                  void addAttachmentsFromFiles(e.target.files);
                }
                e.target.value = "";
              }}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="chat-tool-bar">
                <button
                  type="button"
                  className="chat-tool-pill"
                  onClick={() => fileRef.current?.click()}
                  disabled={pending.length >= MAX_ATTACHMENTS}
                  aria-label="Attach an image"
                  title="Attach an image"
                >
                  <span aria-hidden>＋</span>
                  <span>image</span>
                </button>

                <button
                  type="button"
                  className="chat-tool-pill"
                  data-on={toolPrefs.webSearch ? "1" : undefined}
                  aria-pressed={toolPrefs.webSearch}
                  onClick={() =>
                    setToolPrefs((p) => ({ ...p, webSearch: !p.webSearch }))
                  }
                  title="Search the web for fresh info (requires a compatible upstream)"
                >
                  <span aria-hidden>◎</span>
                  <span>web</span>
                </button>

                <button
                  type="button"
                  className="chat-tool-pill"
                  data-on={toolPrefs.deepThinking ? "1" : undefined}
                  aria-pressed={toolPrefs.deepThinking}
                  onClick={() =>
                    setToolPrefs((p) => ({
                      ...p,
                      deepThinking: !p.deepThinking,
                    }))
                  }
                  title="Higher reasoning effort, lower temperature"
                >
                  <span aria-hidden>✶</span>
                  <span>think</span>
                </button>

                {chatConfig && chatConfig.models.length > 1 && (
                  <details
                    className="chat-model-popover"
                    ref={modelRef}
                  >
                    <summary
                      className="chat-tool-pill"
                      aria-label="Choose model"
                      title="Choose model"
                    >
                      <span>{toolPrefs.model ?? chatConfig.default}</span>
                      <span aria-hidden>▾</span>
                    </summary>
                    <div className="chat-model-list" role="menu">
                      {chatConfig.models.map((m) => {
                        const active =
                          (toolPrefs.model ?? chatConfig.default) === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setToolPrefs((p) => ({
                                ...p,
                                model:
                                  m === chatConfig.default ? null : m,
                              }));
                              modelRef.current?.removeAttribute("open");
                            }}
                          >
                            <span>{m}</span>
                            {active && <span aria-hidden>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="caps group inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-site-accent"
                >
                  <span aria-hidden className="kiri-pulse" />
                  <span>stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && pending.length === 0}
                  className="caps group inline-flex items-baseline gap-2 text-foreground transition-colors hover:text-site-accent disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:text-foreground"
                >
                  <span>{editingId ? "revise" : "reply"}</span>
                  <span
                    aria-hidden
                    className="transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1 group-disabled:translate-x-0"
                  >
                    →
                  </span>
                </button>
              )}
            </div>
            <p className="caps mt-2 text-[0.6rem] text-muted-foreground/65">
              <span className="hidden sm:inline">
                enter to send · shift+enter for a new line
              </span>
              {input.length > 80 && (
                <span className="ml-2 tabular opacity-70">{input.length}</span>
              )}
            </p>
          </form>
        </main>
      </div>

      {/* MOBILE DRAWER */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close index"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-background/85 backdrop-blur-sm"
          />
          <div className="kiri-drawer absolute inset-y-0 left-0 w-[19rem] max-w-[85vw] border-r border-site-rule bg-background px-6 py-7 shadow-[0_0_60px_-20px_color-mix(in_oklab,var(--site-accent)_30%,transparent)]">
            {indexPane}
          </div>
        </div>
      )}

      {/* scoped chat-page styles */}
      <style jsx global>{`
        /* index hover hairline (pen-stroke) */
        .kiri-chat .kiri-index-item {
          position: relative;
          padding: 0.25rem 0 0.85rem 0;
        }
        .kiri-chat .kiri-index-rule {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: var(--site-rule);
          transform: scaleX(0.35);
          transform-origin: left center;
          transition:
            transform 480ms cubic-bezier(0.22, 1, 0.36, 1),
            background-color 240ms ease;
        }
        .kiri-chat .kiri-index-item:hover .kiri-index-rule {
          transform: scaleX(1);
        }
        .kiri-chat .kiri-index-item.is-active .kiri-index-rule {
          transform: scaleX(1);
          background: var(--site-accent);
        }
        .kiri-chat .kiri-index-li .kiri-index-del {
          opacity: 0;
        }
        .kiri-chat .kiri-index-li:hover .kiri-index-del,
        .kiri-chat .kiri-index-del:focus-visible {
          opacity: 1;
        }

        /* search rule */
        .kiri-chat .kiri-search-rule {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: var(--site-rule);
          transition: background-color 280ms ease;
        }
        .kiri-chat .kiri-search:focus-within .kiri-search-rule {
          background: var(--site-accent);
        }

        /* pulsing dot */
        @keyframes kiri-pulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.18);
          }
        }
        .kiri-chat .kiri-pulse {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 99px;
          background: var(--site-accent);
          box-shadow: 0 0 0 3px
            color-mix(in oklab, var(--site-accent) 12%, transparent);
          animation: kiri-pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          transform-origin: center;
        }

        /* streaming caret — at end of last paragraph */
        @keyframes kiri-caret {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .kiri-chat .chat-markdown.is-streaming > :last-child::after {
          content: "";
          display: inline-block;
          width: 2px;
          height: 1em;
          margin-left: 3px;
          background: var(--site-accent);
          animation: kiri-caret 1.05s steps(1) infinite;
          vertical-align: text-bottom;
          transform: translateY(-0.1em);
        }
        .kiri-chat .kiri-caret-standalone {
          display: inline-block;
          width: 2px;
          height: 1.4em;
          background: var(--site-accent);
          animation: kiri-caret 1.05s steps(1) infinite;
        }

        /* input rule + focus draw */
        .kiri-chat .kiri-input-rule {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: var(--site-rule);
        }
        .kiri-chat .kiri-input-rule-focus {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: var(--site-accent);
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .kiri-chat .kiri-input-wrap:focus-within .kiri-input-rule-focus {
          transform: scaleX(1);
        }

        /* drop hint — soft accent border when files dragged in */
        .kiri-chat .kiri-dock-dropping {
          box-shadow: inset 0 2px 0 0 var(--site-accent);
          background: color-mix(in oklab, var(--site-accent) 4%, transparent);
        }

        /* exchange enter — soft fade-up on first appear */
        @keyframes kiri-msg-reveal {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .kiri-chat .kiri-exchange {
          animation: kiri-msg-reveal 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* keep chat-markdown rendering crisp inside the exchange grid */
        .kiri-chat .chat-markdown {
          font-family: var(--font-reading);
          font-size: 1.04rem;
          line-height: 1.78;
          color: var(--foreground);
        }
        .kiri-chat .chat-markdown > *:first-child { margin-top: 0; }
        .kiri-chat .chat-markdown > *:last-child  { margin-bottom: 0; }

        /* empty-state staggered reveal */
        @keyframes kiri-stagger {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .kiri-chat .kiri-empty-line {
          animation: kiri-stagger 540ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* mobile drawer slide */
        @keyframes kiri-drawer-in {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .kiri-chat .kiri-drawer {
          animation: kiri-drawer-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* scrollbar — quiet, on-paper feel */
        .kiri-chat .kiri-scroll::-webkit-scrollbar,
        .kiri-chat ol::-webkit-scrollbar {
          width: 6px;
        }
        .kiri-chat .kiri-scroll::-webkit-scrollbar-thumb,
        .kiri-chat ol::-webkit-scrollbar-thumb {
          background: color-mix(in oklab, var(--site-rule) 60%, transparent);
          border-radius: 99px;
        }
        .kiri-chat .kiri-scroll::-webkit-scrollbar-thumb:hover,
        .kiri-chat ol::-webkit-scrollbar-thumb:hover {
          background: color-mix(in oklab, var(--site-accent) 50%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .kiri-chat *,
          .kiri-chat *::before,
          .kiri-chat *::after {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* subcomponents ───────────────────────────────────────────────────────────── */

function Exchange({
  message,
  index,
  isStreaming,
  streaming,
  onCopy,
  onRetry,
  onEdit,
  onBranch,
}: {
  message: Message;
  index: number;
  isStreaming: boolean;
  streaming: boolean;
  onCopy: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
  onBranch?: () => void;
}) {
  const isUser = message.role === "user";
  const atts = message.attachments ?? [];
  const hasContent = message.content.length > 0 || atts.length > 0;
  return (
    <li className="kiri-exchange chat-message-row grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 md:grid-cols-[7rem_minmax(0,1fr)] md:gap-8">
      <div className="pt-1 md:pt-1.5">
        <span
          className={cn(
            "block font-display text-[0.95rem] italic leading-none tracking-[-0.005em] md:text-base",
            isUser ? "text-foreground/55" : "text-site-accent/85",
          )}
        >
          {isUser ? "You" : "Kiri AI"}
        </span>
        {!isUser && (message.tools ?? []).length > 0 && (
          <span className="chat-tool-badge" aria-label="Tools used">
            {(message.tools ?? []).map((t, i) => (
              <span key={t}>
                {i === 0 ? "·" : "·"} {prettyToolName(t)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="min-w-0">
        {atts.length > 0 && (
          <div className="chat-attachments">
            {atts.map((a) =>
              a.kind === "image" ? (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={a.name ?? "open attachment"}
                >
                  {/* data:/remote URLs aren't routable through next/image without
                      per-host config; thumbnails open the original on click. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.name ?? "attachment"}
                    className="chat-attachment-thumb"
                  />
                </a>
              ) : (
                <span key={a.id} className="chat-attachment-file" title={a.name}>
                  <span className="chip-icon" aria-hidden>
                    {a.mime === "application/pdf" ? "PDF" : "TXT"}
                  </span>
                  <span className="chip-name">{a.name ?? "file"}</span>
                  <span className="chip-meta">
                    {a.text ? `${a.text.length.toLocaleString()} chars` : ""}
                  </span>
                </span>
              ),
            )}
          </div>
        )}

        {isUser ? (
          message.content ? (
            <div className="font-reading whitespace-pre-wrap text-[1.04rem] leading-[1.78] text-foreground">
              {message.content}
            </div>
          ) : null
        ) : message.content ? (
          <div className={cn("chat-markdown", isStreaming && "is-streaming")}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="chat-table-wrap">
                    <table>{children}</table>
                  </div>
                ),
                pre: (props) => <CodeBlock {...props} />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="kiri-caret-standalone" aria-hidden />
        )}

        <div className="mt-3 flex items-baseline gap-2 caps tabular text-[0.6rem] text-muted-foreground/55">
          <span>{toRoman(index)}.</span>
          <span className="opacity-50" aria-hidden>·</span>
          <span>{fmtTime(message.createdAt)}</span>
        </div>

        {hasContent && (
          <div className="chat-message-actions" aria-label="Message actions">
            <button
              type="button"
              className="chat-action-btn"
              onClick={onCopy}
              disabled={streaming && isStreaming}
              aria-label="Copy message"
            >
              copy
            </button>
            {onRetry && (
              <button
                type="button"
                className="chat-action-btn"
                onClick={onRetry}
                disabled={streaming}
                aria-label="Regenerate this reply"
              >
                retry
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className="chat-action-btn"
                onClick={onEdit}
                disabled={streaming}
                aria-label="Edit and resend this message"
              >
                edit
              </button>
            )}
            {onBranch && (
              <button
                type="button"
                className="chat-action-btn"
                onClick={onBranch}
                disabled={streaming}
                aria-label="Branch into a new thread from this message"
                title="Clone the conversation up to here as a new thread"
              >
                branch
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CodeBlock({ children, ...rest }: HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.querySelector("code")?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }

  return (
    <figure className="code-block" data-copied={copied ? "1" : undefined}>
      <pre ref={ref} {...rest}>
        {children}
      </pre>
      <button
        type="button"
        className="code-copy-btn"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
      >
        <svg
          className="icon icon-copy"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
        <svg
          className="icon icon-check"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 12l5 5L20 6" />
        </svg>
        <span className="code-copy-label">copy</span>
      </button>
    </figure>
  );
}

function EmptyState({
  opener,
  onPick,
}: {
  opener: string;
  onPick: (s: string) => void;
}) {
  return (
    <div className="py-6 md:py-12">
      <p
        className="kiri-empty-line caps mb-7 flex items-center gap-3 text-muted-foreground"
        style={{ animationDelay: "60ms" }}
      >
        <span className="h-px w-7 bg-site-accent" aria-hidden />
        Begin
        <span className="opacity-60" aria-hidden>· 起笔</span>
      </p>

      <h2
        className="kiri-empty-line font-display text-[clamp(2.2rem,5.4vw,4.2rem)] font-light leading-[1.04] tracking-[-0.024em] text-foreground"
        style={{ animationDelay: "140ms" }}
      >
        <span className="italic">{opener.replace(/[?.]$/, "")}</span>
        <span className="not-italic font-medium text-site-accent">
          {opener.match(/[?.]$/)?.[0] ?? ""}
        </span>
      </h2>

      <p
        className="kiri-empty-line font-reading mt-7 max-w-md text-base italic leading-[1.78] text-muted-foreground"
        style={{ animationDelay: "240ms" }}
      >
        A quiet place to think alongside someone. Drafts, outlines,
        half-formed ideas — they all belong here.
      </p>

      <div
        className="kiri-empty-line mt-12 mb-4 flex items-center gap-3"
        style={{ animationDelay: "320ms" }}
        aria-hidden
      >
        <span className="h-px w-8 bg-site-rule" />
        <span className="font-display select-none text-sm tracking-[0.4em] text-site-accent/45">
          ~·~
        </span>
        <span className="h-px w-8 bg-site-rule" />
      </div>

      <ul className="space-y-3">
        {PROMPT_FRAGMENTS.map((p, i) => (
          <li
            key={p}
            className="kiri-empty-line"
            style={{ animationDelay: `${380 + i * 80}ms` }}
          >
            <button
              type="button"
              onClick={() => onPick(p)}
              className="group flex items-baseline gap-3 text-left"
            >
              <span className="caps tabular shrink-0 text-[0.65rem] text-muted-foreground/55 transition-colors group-hover:text-site-accent">
                {toRoman(i + 1)}.
              </span>
              <span className="font-reading border-b border-transparent text-base italic leading-snug text-foreground/85 transition-[color,border-color] group-hover:border-site-accent/60 group-hover:text-site-accent">
                {p}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <li className="kiri-exchange grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 md:grid-cols-[7rem_minmax(0,1fr)] md:gap-8">
      <div className="pt-1.5">
        <span className="block font-display text-base italic leading-none text-destructive/85">
          ✺ Error
        </span>
      </div>
      <div className="font-reading italic text-foreground/85">{text}</div>
    </li>
  );
}
