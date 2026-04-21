"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const token = useAuth((s) => s.accessToken);
  const firstField = useRef<HTMLInputElement>(null);

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (token) router.replace("/admin");
  }, [token, router]);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!u.trim() || !p) return;
    setLoading(true);
    try {
      const r = await api.login(u.trim(), p);
      setAuth(r.accessToken, r.expiresAt, r.user);
      router.push("/admin");
    } catch {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      toast.error("Something didn't match.");
      setP("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kiri-login relative min-h-screen overflow-hidden bg-background">
      {/* Ambient gradient aura — slow drift so the page feels alive, not dead. */}
      <div
        aria-hidden
        className="kiri-login-aura pointer-events-none absolute inset-0 opacity-70 dark:opacity-55"
      />

      {/* Hairline frame: editorial margins on all four sides */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-6 border border-site-rule/60 md:inset-10"
      />

      {/* Folio marks in corners — a faint sign the page exists */}
      <p
        aria-hidden
        className="caps tabular absolute left-10 top-10 hidden text-[0.65rem] text-muted-foreground/50 md:block"
      >
        — xxiv —
      </p>
      <p
        aria-hidden
        className="caps tabular absolute bottom-10 right-10 hidden text-[0.65rem] text-muted-foreground/50 md:block"
      >
        fin.
      </p>

      <div className="relative grid min-h-screen md:grid-cols-[1fr_minmax(0,480px)]">
        {/* ─────────── LEFT: the quiet room ─────────── */}
        <aside className="relative hidden flex-col justify-between px-14 py-16 md:flex lg:px-20">
          {/* Top ornament: thin rule + seal dot */}
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-14 bg-site-accent" />
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full bg-site-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--site-accent)_18%,transparent)]"
            />
          </div>

          {/* Hero block */}
          <div className="max-w-[34rem]">
            {/* Oversized italic quotation ornament */}
            <p
              aria-hidden
              className="font-display mb-2 select-none text-[8rem] leading-none italic text-site-accent/25"
              style={{ fontFeatureSettings: '"ss01"' }}
            >
              &ldquo;
            </p>

            <p className="font-display text-[clamp(2.2rem,4.4vw,3.6rem)] font-light leading-[1.1] tracking-[-0.022em] text-foreground">
              A small,{" "}
              <span className="italic text-site-accent">private</span> room.
            </p>

            <p className="font-reading mt-7 max-w-[28rem] text-base italic leading-[1.75] text-muted-foreground">
              How did you find your way here?
              <span className="ml-2 opacity-60" aria-hidden>
                · 你是怎么找到这儿的
              </span>
            </p>

            {/* Asterism */}
            <p
              aria-hidden
              className="font-display mt-12 select-none text-2xl tracking-[1em] text-site-accent/40"
            >
              ✳ ✳ ✳
            </p>
          </div>

          {/* Footer mark */}
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-8 bg-site-rule" />
            <span
              className="caps text-[0.65rem] text-muted-foreground/60"
              aria-hidden
            >
              volume i · shelf no. iii
            </span>
          </div>
        </aside>

        {/* Vertical rule between the two panels (desktop only) */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px bg-site-rule/60 md:block"
          style={{ left: "calc(100% - 480px)" }}
        />

        {/* ─────────── RIGHT: the door ─────────── */}
        <section className="relative flex flex-col items-stretch justify-center px-6 py-16 md:px-12 md:py-16 lg:px-16">
          {/* Mobile-only ornament top */}
          <div className="mb-14 flex items-center gap-3 md:hidden">
            <span aria-hidden className="h-px w-12 bg-site-accent" />
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full bg-site-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--site-accent)_18%,transparent)]"
            />
          </div>

          <div
            className={`mx-auto w-full max-w-[22rem] ${
              shake ? "animate-[kiri-shake_420ms_cubic-bezier(.36,.07,.19,.97)]" : ""
            }`}
          >
            {/* Tiny marginalia above form */}
            <p
              aria-hidden
              className="caps mb-12 flex items-center gap-3 text-[0.65rem] text-muted-foreground/60"
            >
              <span className="h-px w-6 bg-site-accent/50" />
              entrée · 入口
              <span className="ml-auto tabular">i / ii</span>
            </p>

            <form
              onSubmit={onSubmit}
              className="space-y-10"
              autoComplete="off"
            >
              {/* Field 1 */}
              <label className="kiri-field block" htmlFor="a">
                <span className="sr-only">Name</span>
                <span
                  aria-hidden
                  className="kiri-field-num caps tabular text-[0.65rem] text-muted-foreground/55"
                >
                  i.
                </span>
                <input
                  ref={firstField}
                  id="a"
                  name="a"
                  type="text"
                  value={u}
                  onChange={(e) => setU(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={50}
                  required
                  placeholder="——"
                  className="kiri-input"
                />
                <span className="kiri-line" aria-hidden />
                <span className="kiri-line-focus" aria-hidden />
              </label>

              {/* Field 2 */}
              <label className="kiri-field block" htmlFor="b">
                <span className="sr-only">Key</span>
                <span
                  aria-hidden
                  className="kiri-field-num caps tabular text-[0.65rem] text-muted-foreground/55"
                >
                  ii.
                </span>
                <input
                  id="b"
                  name="b"
                  type={showPw ? "text" : "password"}
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  autoComplete="off"
                  maxLength={100}
                  required
                  placeholder="——"
                  className="kiri-input pr-8 tracking-[0.1em]"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-0 top-[1.35rem] text-muted-foreground/45 transition-colors hover:text-site-accent"
                  aria-label={showPw ? "Hide" : "Show"}
                >
                  {showPw ? (
                    <EyeOff className="size-3.5" strokeWidth={1.6} />
                  ) : (
                    <Eye className="size-3.5" strokeWidth={1.6} />
                  )}
                </button>
                <span className="kiri-line" aria-hidden />
                <span className="kiri-line-focus" aria-hidden />
              </label>

              {/* Thin rule separator */}
              <div aria-hidden className="h-px w-full bg-site-rule/60" />

              <button
                type="submit"
                disabled={loading || !u.trim() || !p}
                className="kiri-enter group relative flex w-full items-center justify-center gap-2 px-5 py-3 font-reading text-sm tracking-wide transition-all duration-300 disabled:opacity-30"
              >
                <span className="relative z-10">
                  {loading ? "…" : "Enter"}
                </span>
                {!loading && (
                  <ArrowRight
                    className="relative z-10 size-4 transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1"
                    strokeWidth={1.6}
                  />
                )}
              </button>
            </form>

            {/* Quiet footer flourish */}
            <p
              aria-hidden
              className="font-display mt-14 text-center text-xl tracking-[0.8em] text-site-accent/35 select-none"
            >
              ·&nbsp;·&nbsp;·
            </p>
          </div>
        </section>
      </div>

      <style jsx>{`
        .kiri-login-aura {
          background-image:
            radial-gradient(
              circle at 22% 28%,
              color-mix(in oklab, var(--site-accent) 26%, transparent) 0%,
              transparent 48%
            ),
            radial-gradient(
              circle at 78% 72%,
              color-mix(in oklab, var(--site-accent) 14%, transparent) 0%,
              transparent 55%
            ),
            radial-gradient(
              circle at 50% 120%,
              color-mix(in oklab, var(--site-accent) 18%, transparent) 0%,
              transparent 58%
            );
          animation: kiri-drift 22s ease-in-out infinite alternate;
          filter: blur(60px);
        }

        :global(.dark) .kiri-login-aura {
          filter: blur(80px);
        }

        @keyframes kiri-drift {
          0% {
            transform: scale(1) translate(0, 0);
          }
          100% {
            transform: scale(1.08) translate(-2%, 1.5%);
          }
        }

        @keyframes kiri-shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-4px); }
          40%, 60% { transform: translateX(4px); }
        }

        /* Fields: Roman-numeral marginalia + animated underline */
        .kiri-field {
          position: relative;
          padding-left: 1.75rem;
        }
        .kiri-field-num {
          position: absolute;
          left: 0;
          top: 0.95rem;
          letter-spacing: 0;
        }
        .kiri-input {
          width: 100%;
          border: 0;
          background: transparent;
          padding: 0.25rem 0 0.5rem 0;
          font-family: var(--font-source-serif), Georgia, serif;
          font-size: 1.05rem;
          color: var(--foreground);
          outline: none;
          caret-color: var(--site-accent);
        }
        .kiri-input::placeholder {
          color: color-mix(in oklab, var(--muted-foreground) 40%, transparent);
          letter-spacing: 0.1em;
        }
        .kiri-input::selection {
          background: color-mix(in oklab, var(--site-accent) 30%, transparent);
        }
        .kiri-line {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: var(--site-rule);
        }
        .kiri-line-focus {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 1px;
          width: 0;
          background: var(--site-accent);
          transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .kiri-field:focus-within .kiri-line-focus {
          width: 100%;
        }
        .kiri-field:focus-within .kiri-field-num {
          color: var(--site-accent);
          transition: color 220ms ease;
        }

        /* Submit: layered with a reveal-fill hover */
        .kiri-enter {
          color: var(--background);
          background: var(--foreground);
          overflow: hidden;
          isolation: isolate;
        }
        .kiri-enter::before {
          content: "";
          position: absolute;
          inset: 0;
          background: var(--site-accent);
          transform: translateY(100%);
          transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
          z-index: 0;
        }
        .kiri-enter:not(:disabled):hover::before {
          transform: translateY(0);
        }
        .kiri-enter:not(:disabled):hover {
          box-shadow:
            0 0 0 1px color-mix(in oklab, var(--site-accent) 30%, transparent),
            0 20px 40px -20px color-mix(in oklab, var(--site-accent) 50%, transparent);
        }
      `}</style>
    </div>
  );
}
