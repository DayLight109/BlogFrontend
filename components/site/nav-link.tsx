import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Props = ComponentProps<typeof Link> & {
  active?: boolean;
  children: ReactNode;
};

/**
 * Nav link with an animated hairline that draws from the left on hover.
 * scaleX(0→1) with transform-origin:left — the draw is ~480ms,
 * matches the pen-stroke metaphor of the rest of the site.
 */
export function NavLink({ active, children, className = "", ...props }: Props) {
  return (
    <Link
      {...props}
      className={`caps group relative inline-block pb-1.5 transition-colors hover:text-foreground ${
        active ? "text-foreground" : "text-muted-foreground"
      } ${className}`}
    >
      <span>{children}</span>
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-0 left-0 right-0 h-px origin-left bg-current transition-transform duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          active ? "scale-x-100" : "scale-x-0"
        } group-hover:scale-x-100`}
      />
    </Link>
  );
}
