/**
 * Thin spine-red bar that fills with scroll progress.
 * Pure CSS (scroll-timeline) — no JS, no repaint cost.
 * Invisible in browsers without scroll-timeline support.
 */
export function ReadingProgress() {
  return <div className="reading-progress" aria-hidden="true" />;
}
