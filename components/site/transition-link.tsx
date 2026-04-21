"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type Props = ComponentProps<typeof NextLink>;

/**
 * Drop-in replacement for next/link that wraps navigation
 * in document.startViewTransition() when available — enabling
 * shared-element morphs between pages (e.g. post-title-{id}).
 *
 * Gracefully falls back to plain navigation when:
 *   - browser lacks View Transitions API
 *   - user opts for reduced motion
 *   - modifier keys pressed (open in new tab etc.)
 */
export function TransitionLink(props: Props) {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(e);
    if (e.defaultPrevented) return;
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0
    )
      return;

    const href = typeof props.href === "string" ? props.href : null;
    if (!href) return;

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };

    if (typeof doc.startViewTransition !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    e.preventDefault();
    doc.startViewTransition(() => {
      router.push(href);
    });
  };

  return <NextLink {...props} onClick={handleClick} />;
}
