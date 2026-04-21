"use client";

import {
  useRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** 0 = no pull, 1 = follows cursor; default 0.22 for subtle pull */
  strength?: number;
};

/**
 * A button that pulls gently toward the cursor. Uses CSS transform
 * with a smooth spring-like easing (no motion library). Falls back
 * to a static button when reduced-motion is requested or disabled.
 */
export function MagneticButton({
  children,
  strength = 0.22,
  className = "",
  disabled,
  onMouseMove,
  onMouseLeave,
  ...rest
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  const handleMove = (e: MouseEvent<HTMLButtonElement>) => {
    onMouseMove?.(e);
    if (disabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) * strength;
    const dy = (e.clientY - (rect.top + rect.height / 2)) * strength;
    el.style.setProperty("--mag-x", `${dx}px`);
    el.style.setProperty("--mag-y", `${dy}px`);
  };

  const handleLeave = (e: MouseEvent<HTMLButtonElement>) => {
    onMouseLeave?.(e);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mag-x", "0px");
    el.style.setProperty("--mag-y", "0px");
  };

  return (
    <button
      ref={ref}
      disabled={disabled}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`magnetic-btn ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
