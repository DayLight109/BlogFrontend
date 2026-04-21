"use client";

import { useEffect } from "react";

/**
 * After the article body has rendered, walk every `<figure.code-block>`
 * and inject a tiny "copy" button in its top-right corner. Server-rendered
 * markup stays semantic; client adds affordances progressively.
 */
export function CodeBlockEnhancer({ scope }: { scope?: string }) {
  useEffect(() => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return;

    const figures = root.querySelectorAll<HTMLElement>("figure.code-block");
    const unbinds: Array<() => void> = [];

    figures.forEach((fig) => {
      if (fig.dataset.enhanced === "1") return;
      fig.dataset.enhanced = "1";

      // language badge (top-left)
      const lang = fig.dataset.lang;
      if (lang && lang !== "text") {
        const tag = document.createElement("span");
        tag.className = "code-lang-tag";
        tag.textContent = lang;
        fig.appendChild(tag);
      }

      // copy button (top-right)
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy-btn";
      btn.setAttribute("aria-label", "Copy code");
      btn.innerHTML = `
        <svg class="icon icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <svg class="icon icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span class="code-copy-label">copy</span>
      `;

      const onClick = async () => {
        const code = fig.querySelector("code");
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code.textContent ?? "");
          fig.dataset.copied = "1";
          window.setTimeout(() => {
            delete fig.dataset.copied;
          }, 1500);
        } catch {
          /* ignore */
        }
      };
      btn.addEventListener("click", onClick);
      fig.appendChild(btn);
      unbinds.push(() => btn.removeEventListener("click", onClick));
    });

    return () => {
      unbinds.forEach((fn) => fn());
    };
  }, [scope]);

  return null;
}
