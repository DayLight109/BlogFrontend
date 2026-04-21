import { api } from "@/lib/api";
import { TransitionLink } from "@/components/site/transition-link";

function formatShortDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export async function RelatedPosts({ slug }: { slug: string }) {
  const { items } = await api.getRelated(slug, 3);
  if (!items || items.length === 0) return null;

  return (
    <section aria-label="Related essays">
      <h3 className="caps mb-6 flex items-center gap-3 text-muted-foreground">
        <span className="h-px w-10 bg-site-accent" aria-hidden />
        Further reading
        <span className="opacity-60" aria-hidden>
          · 延伸
        </span>
      </h3>

      <ul className="grid gap-6 md:grid-cols-3">
        {items.map((p) => (
          <li key={p.id}>
            <TransitionLink
              href={`/posts/${p.slug}`}
              className="group block h-full border-t border-site-rule/80 pt-5 transition-colors hover:border-site-accent/80"
            >
              <p className="caps tabular mb-3 text-muted-foreground transition-colors group-hover:text-site-accent">
                {formatShortDate(p.publishedAt ?? p.createdAt)}
              </p>
              <p className="font-display text-lg font-medium leading-snug tracking-[-0.015em] text-foreground transition-colors group-hover:text-site-accent">
                {p.title}
              </p>
              {p.summary && (
                <p className="font-reading mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                  {p.summary}
                </p>
              )}
            </TransitionLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
