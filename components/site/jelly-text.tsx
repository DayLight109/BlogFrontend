"use client";

import { useEffect } from "react";

const SELECTOR = "p, h2, h3, h4, li, blockquote, td";
const STREAK_WINDOW_MS = 1500;
const REQUIRED = 3;
// Don't trigger when the click lands on these — they have their own affordances.
const IGNORE_INSIDE = "a, code, button, figure.code-block, .code-copy-btn";

/**
 * Triple-click any text block inside `scope` to toggle a "ruby pudding"
 * state on that element. A second triple-click turns it off. State lives
 * on the DOM (.is-jelly class) so it survives until the element unmounts.
 *
 * While the element is jelly-on, every click also fires a "poke" — a
 * squish-and-rebound transform plus a ripple emanating from the cursor's
 * position (passed via --poke-x / --poke-y CSS variables).
 *
 * Mirrors CodeBlockEnhancer's pattern: the article body is rendered via
 * dangerouslySetInnerHTML, so we delegate from the scope root rather than
 * binding through React.
 */
export function JellyText({ scope }: { scope: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.querySelector(scope);
    if (!root) return;

    const counts = new WeakMap<Element, { n: number; t: number }>();

    const poke = (target: HTMLElement, ev: MouseEvent) => {
      const rect = target.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      target.style.setProperty("--poke-x", `${x}%`);
      target.style.setProperty("--poke-y", `${y}%`);
      // Re-trigger the animation: drop the class, force a reflow, re-add.
      target.classList.remove("is-poked");
      void target.offsetWidth;
      target.classList.add("is-poked");
    };

    const onAnimationEnd = (e: Event) => {
      const ev = e as AnimationEvent;
      if (ev.animationName !== "jelly-poke") return;
      (ev.currentTarget as HTMLElement).classList.remove("is-poked");
    };

    const onClick = (e: Event) => {
      const me = e as MouseEvent;
      const src = me.target as HTMLElement | null;
      if (!src) return;
      if (src.closest(IGNORE_INSIDE)) return;

      const target = src.closest(SELECTOR) as HTMLElement | null;
      if (!target || !root.contains(target)) return;

      // Don't bubble: clicking nested <li> shouldn't also count for the parent.
      e.stopPropagation();

      // Already in jelly state → fire a poke regardless of streak count.
      // We attach the listener once per element (the WeakMap dedupes).
      if (target.classList.contains("is-jelly")) {
        if (!pokeListenersAttached.has(target)) {
          target.addEventListener("animationend", onAnimationEnd);
          pokeListenersAttached.add(target);
        }
        poke(target, me);
      }

      const now = Date.now();
      const prev = counts.get(target);
      const n = prev && now - prev.t < STREAK_WINDOW_MS ? prev.n + 1 : 1;
      counts.set(target, { n, t: now });

      if (n >= REQUIRED) {
        target.classList.toggle("is-jelly");
        target.classList.remove("is-poked");
        counts.delete(target);
      }
    };

    const pokeListenersAttached = new WeakSet<Element>();

    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("click", onClick);
    };
  }, [scope]);

  return null;
}

