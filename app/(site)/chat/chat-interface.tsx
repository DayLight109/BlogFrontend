"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ApiError, streamChatCompletion, type ChatAPIMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

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
 * ────────────────────────────────────────────────────────────────────────── */

type Role = "user" | "assistant";
interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "kiri-chat:v2";
const ACTIVE_KEY = "kiri-chat-active:v2";

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

/* component ───────────────────────────────────────────────────────────────── */

export function ChatInterface() {
  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [opener] = useState(
    () => OPENERS[Math.floor(Math.random() * OPENERS.length)],
  );

  const taRef = useRef<HTMLTextAreaElement>(null);
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
    if (active && active.messages.length === 0) {
      taRef.current?.focus();
      setDrawerOpen(false);
      return;
    }
    abortRef.current?.abort();
    const c = emptyConversation();
    setConversations((items) => [c, ...items]);
    setActiveId(c.id);
    setInput("");
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
      return;
    }
    setConversations(next);
    if (id === activeId) setActiveId(next[0].id);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming || !active) return;

    const id = active.id;
    const userMsg: Message = {
      id: mid(),
      role: "user",
      content,
      createdAt: nowISO(),
    };
    const placeholder: Message = {
      id: mid(),
      role: "assistant",
      content: "",
      createdAt: nowISO(),
    };

    const isFirst = !messages.some((m) => m.role === "user");
    patch(id, (c) => ({
      ...c,
      title: isFirst ? titleFrom(content) : c.title,
      messages: [...c.messages, userMsg, placeholder],
      updatedAt: nowISO(),
    }));
    setInput("");
    setError(null);
    setStreaming(true);
    stuckBottom.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const history: ChatAPIMessage[] = [...messages, userMsg]
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await streamChatCompletion(
        history,
        (delta) => {
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
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

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
              void send(input);
            }}
            className="kiri-dock mt-7 border-t border-site-rule pt-5"
          >
            <div className="kiri-input-wrap relative">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
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

            <div className="mt-3 flex items-baseline justify-between gap-4">
              <p className="caps text-[0.6rem] text-muted-foreground/65">
                <span className="hidden sm:inline">
                  enter to send · shift+enter for a new line
                </span>
                {input.length > 80 && (
                  <span className="ml-2 tabular opacity-70">
                    {input.length}
                  </span>
                )}
              </p>
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
                  disabled={!input.trim()}
                  className="caps group inline-flex items-baseline gap-2 text-foreground transition-colors hover:text-site-accent disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:text-foreground"
                >
                  <span>reply</span>
                  <span
                    aria-hidden
                    className="transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1 group-disabled:translate-x-0"
                  >
                    →
                  </span>
                </button>
              )}
            </div>
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
}: {
  message: Message;
  index: number;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <li className="kiri-exchange grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 md:grid-cols-[7rem_minmax(0,1fr)] md:gap-8">
      <div className="pt-1 md:pt-1.5">
        <span
          className={cn(
            "block font-display text-[0.95rem] italic leading-none tracking-[-0.005em] md:text-base",
            isUser ? "text-foreground/55" : "text-site-accent/85",
          )}
        >
          {isUser ? "You" : "Kiri AI"}
        </span>
      </div>

      <div className="min-w-0">
        {isUser ? (
          <div className="font-reading whitespace-pre-wrap text-[1.04rem] leading-[1.78] text-foreground">
            {message.content}
          </div>
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
      </div>
    </li>
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
