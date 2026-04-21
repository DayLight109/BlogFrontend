export function Rule({
  variant = "line",
  className = "",
}: {
  variant?: "line" | "asterism" | "tilde";
  className?: string;
}) {
  if (variant === "asterism") {
    return (
      <div
        className={`flex justify-center py-2 ${className}`}
        aria-hidden="true"
      >
        <span className="font-display select-none text-xl tracking-[0.6em] text-muted-foreground/65">
          ⁂
        </span>
      </div>
    );
  }

  if (variant === "tilde") {
    return (
      <div
        className={`flex items-center justify-center gap-3 py-4 ${className}`}
        aria-hidden="true"
      >
        <span className="h-px w-10 bg-site-rule md:w-14" />
        <span className="font-display select-none text-sm tracking-[0.4em] text-site-accent/75">
          ~·~
        </span>
        <span className="h-px w-10 bg-site-rule md:w-14" />
      </div>
    );
  }

  return (
    <hr
      className={`h-px border-0 bg-site-rule ${className}`}
      aria-hidden="true"
    />
  );
}
