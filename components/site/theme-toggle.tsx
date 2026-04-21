"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Day ↔ Noct toggle.
 *
 * On click, uses the View Transitions API to perform a circular reveal
 * expanding from the button's position — imagine ink bleeding across paper.
 * Falls back to an instant switch when the API is unavailable or the user
 * has requested reduced motion.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored =
      (typeof window !== "undefined"
        ? (localStorage.getItem("theme") as "light" | "dark" | null)
        : null) ?? null;
    const isDark =
      stored === "dark" ||
      (!stored && document.documentElement.classList.contains("dark"));
    setTheme(isDark ? "dark" : "light");
  }, []);

  function applyTheme(next: "light" | "dark") {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  function toggle() {
    if (theme === null) return;
    const next = theme === "light" ? "dark" : "light";

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    if (!doc.startViewTransition || reduced) {
      applyTheme(next);
      return;
    }

    const rect = btnRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const maxR = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy),
    );

    const root = document.documentElement;
    root.style.setProperty("--tt-x", `${cx}px`);
    root.style.setProperty("--tt-y", `${cy}px`);
    root.style.setProperty("--tt-r", `${maxR}px`);
    root.dataset.themeTransition = "true";

    const transition = doc.startViewTransition(() => applyTheme(next));

    transition.finished.finally(() => {
      delete root.dataset.themeTransition;
    });
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`caps group inline-flex items-center gap-2.5 text-muted-foreground transition-[color,opacity] hover:text-foreground ${
        theme === null ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <span className="relative block h-px w-7 bg-muted-foreground/50">
        <span
          className="absolute top-1/2 block h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-site-accent transition-[left] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: theme === "dark" ? "calc(100% - 0.375rem)" : "0" }}
        />
      </span>
      <span className="tabular inline-block min-w-[2.25rem]">
        {theme === "dark" ? "Noct" : "Day"}
      </span>
    </button>
  );
}
