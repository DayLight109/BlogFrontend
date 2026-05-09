"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import type { ChatMemory } from "@/lib/types";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Memory · the assistant's notebook
 *
 *  Admin-only listing of every persisted long-term memory the chat handler
 *  has extracted. Read-and-prune affordances only — there's no "add memory"
 *  button on purpose: the only sanctioned write path is automatic
 *  extraction at the cadence in service/chat_memory.go (every 4 user
 *  turns). Surfacing manual write would muddy the contract.
 * ────────────────────────────────────────────────────────────────────────── */

export function MemoriesInterface() {
  const accessToken = useAuth((s) => s.accessToken);
  const user = useAuth((s) => s.user);
  const setAuth = useAuth((s) => s.setAuth);
  const isAdmin = user?.role === "admin";

  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<ChatMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Best-effort silent refresh on mount. If the user has a valid refresh
  // cookie, this populates auth state; otherwise we land in the "not admin"
  // branch and prompt for login. Same pattern as chat-interface.tsx.
  useEffect(() => {
    let cancelled = false;
    api
      .refresh()
      .then((r) => {
        if (cancelled) return;
        setAuth(r.accessToken, r.expiresAt, r.user);
      })
      .catch(() => {
        /* anonymous — fall through to login prompt */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setAuth]);

  // Load the rolodex once we know we're authenticated as admin. Effect runs
  // when isAdmin/accessToken stabilize after the refresh above.
  useEffect(() => {
    if (!isAdmin || !accessToken) {
      // No fetch to do — flip loading off via microtask so we're not
      // calling setState synchronously inside the effect body.
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    let cancelled = false;
    // setLoading(true) happens through the microtask too — same reason.
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
    });
    api
      .adminListMemories(accessToken)
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiError
            ? e.message || `Failed to load memories (${e.status})`
            : "Failed to load memories.";
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, accessToken]);

  async function handleDelete(id: number) {
    if (!accessToken) return;
    const prev = items;
    // Optimistic removal — the DB call is fire-and-forget for UX.
    setItems((cur) => cur.filter((m) => m.id !== id));
    try {
      await api.adminDeleteMemory(accessToken, id);
      toast.success("Forgotten");
    } catch (e) {
      // Roll back on failure.
      setItems(prev);
      const msg = e instanceof ApiError ? e.message : "Couldn't forget that.";
      toast.error(msg);
    }
  }

  // ── Render branches ────────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <span className="caps text-muted-foreground">opening the page…</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <p className="caps mb-3 text-muted-foreground">— private page</p>
        <h1 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] font-light leading-tight tracking-tight">
          Kiri&rsquo;s memory is for the writer of this blog.
        </h1>
        <p className="font-reading mt-5 text-base italic text-muted-foreground">
          You&rsquo;re welcome to chat at{" "}
          <Link className="text-site-accent underline-offset-4 hover:underline" href="/chat">
            /chat
          </Link>{" "}
          — but the rolodex of remembered facts is admin-only.
        </p>
        <Link
          href="/admin/login"
          className="caps mt-8 inline-flex items-baseline gap-2 text-foreground transition-colors hover:text-site-accent"
        >
          <span>sign in</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 md:py-16">
      <header className="mb-10">
        <p className="caps mb-3 flex items-center gap-3 text-muted-foreground">
          <span className="h-px w-7 bg-site-accent" aria-hidden />
          memory · 备忘
          <Link
            href="/chat"
            className="caps ml-auto text-[0.62rem] text-muted-foreground transition-colors hover:text-site-accent"
          >
            ← back to chat
          </Link>
        </p>
        <h1 className="font-display text-[clamp(2rem,4.4vw,3rem)] font-light leading-[1.06] tracking-[-0.018em]">
          Things <span className="italic text-site-accent">Kiri</span> remembered.
        </h1>
        <p className="font-reading mt-5 max-w-lg text-base italic leading-[1.78] text-muted-foreground">
          Durable facts pulled from past conversations every few turns. Forget any
          line and Kiri stops referring to it on the next reply.
        </p>
      </header>

      {error && (
        <p className="font-reading italic text-destructive">{error}</p>
      )}

      {loading ? (
        <p className="caps text-muted-foreground">loading…</p>
      ) : items.length === 0 ? (
        <p className="font-reading italic text-muted-foreground">
          Nothing remembered yet — keep talking with Kiri and durable facts will
          land here automatically.
        </p>
      ) : (
        <ul className="chat-memory-list">
          {items.map((m, i) => (
            <li key={m.id}>
              <span className="caps tabular memory-roman">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="memory-body">
                <span className="memory-content">{m.content}</span>
                <span className="caps tabular memory-meta">
                  {fmtMemoryDate(m.createdAt)}
                </span>
              </span>
              <button
                type="button"
                className="caps memory-forget"
                onClick={() => void handleDelete(m.id)}
                aria-label={`Forget: ${m.content}`}
              >
                forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtMemoryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}
