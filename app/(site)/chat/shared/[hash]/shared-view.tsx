"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

export type SharedRole = "user" | "assistant";

export interface SharedMessage {
  id: string;
  role: SharedRole;
  content: string;
  createdAt: string;
  attachments?: unknown[];
  tools?: string[];
}

export interface SharedConversation {
  title: string;
  createdAt: string;
  messages: SharedMessage[];
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Shared conversation · read-only
 *
 *  Stripped-down twin of the chat Exchange component — same editorial look,
 *  but no input dock, no actions, no auth gates. We don't try to render
 *  attachments here either: the share payload is meant to be portable, and
 *  data: URLs were stripped before upload.
 * ────────────────────────────────────────────────────────────────────────── */

export function SharedView({
  conversation,
  hash,
  title,
  viewCount,
  createdAt,
}: {
  conversation: SharedConversation;
  hash: string;
  title: string;
  viewCount: number;
  createdAt: string;
}) {
  return (
    <div className="kiri-chat min-h-[calc(100vh-5rem)]">
      <div className="mx-auto max-w-[52rem] px-6 py-10 md:px-10 md:py-14">
        <header className="mb-10">
          <p className="caps mb-3 flex items-center gap-3 text-muted-foreground">
            <span className="h-px w-7 bg-site-accent" aria-hidden />
            <span>Shared · 共享对话</span>
            <span className="opacity-50" aria-hidden>·</span>
            <span className="tabular text-[0.6rem]">
              {viewCount} {viewCount === 1 ? "view" : "views"}
            </span>
          </p>
          <h1 className="font-display text-[clamp(2rem,4.6vw,3.4rem)] font-light leading-[1.04] tracking-[-0.022em] text-foreground">
            {title || conversation.title}
          </h1>
          <p className="caps mt-4 text-muted-foreground">
            shared on {fmtShareDate(createdAt)} · read-only
          </p>
        </header>

        <ol className="space-y-12 md:space-y-14">
          {conversation.messages.map((m, i) => (
            <SharedExchange key={m.id} message={m} index={i + 1} />
          ))}
        </ol>

        <footer className="mt-16 border-t border-site-rule pt-6">
          <p className="font-reading italic text-muted-foreground">
            Want to start your own conversation?{" "}
            <Link
              href="/chat"
              className="text-site-accent underline-offset-4 hover:underline"
            >
              Open Kiri →
            </Link>
          </p>
          <p className="caps mt-2 text-[0.58rem] text-muted-foreground/55 tabular">
            share #{hash.slice(0, 8)}
          </p>
        </footer>
      </div>
    </div>
  );
}

function SharedExchange({
  message,
  index,
}: {
  message: SharedMessage;
  index: number;
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
        {!isUser && (message.tools ?? []).length > 0 && (
          <span className="chat-tool-badge">
            {(message.tools ?? []).map((t) => (
              <span key={t}>· {t.replace(/_/g, " ")} used</span>
            ))}
          </span>
        )}
      </div>
      <div className="min-w-0">
        {isUser ? (
          <div className="font-reading whitespace-pre-wrap text-[1.04rem] leading-[1.78] text-foreground">
            {message.content || <em className="text-muted-foreground">(empty)</em>}
          </div>
        ) : (
          <div className="chat-markdown">
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
        )}
        <div className="mt-3 flex items-baseline gap-2 caps tabular text-[0.6rem] text-muted-foreground/55">
          <span>{toRoman(index)}.</span>
          <span className="opacity-50" aria-hidden>·</span>
          <span>{fmtShareTime(message.createdAt)}</span>
        </div>
      </div>
    </li>
  );
}

function fmtShareDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function fmtShareTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
