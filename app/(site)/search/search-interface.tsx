"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Search as SearchIcon, Loader2 } from "lucide-react";

import { api } from "@/lib/api";
import { TransitionLink } from "@/components/site/transition-link";

function useDebounced<T>(value: T, delay = 280) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function formatShortDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function highlight(text: string, needle: string) {
  if (!needle.trim()) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === needle.toLowerCase() ? (
      <mark
        key={i}
        className="rounded-[2px] bg-site-accent/20 px-0.5 py-[0.05em] text-foreground"
      >
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function SearchInterface() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: () => api.searchPosts(debounced.trim()),
  });

  return (
    <section className="py-10 md:py-14">
      <div className="relative max-w-2xl">
        <SearchIcon
          className="pointer-events-none absolute left-0 top-3 size-5 text-muted-foreground"
          strokeWidth={1.6}
        />
        <div className="field-underline">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a word, a phrase, a fragment…"
            className="w-full border-0 bg-transparent py-3 pl-8 pr-10 font-display text-2xl text-foreground placeholder:text-muted-foreground/45 outline-none focus:border-0 md:text-3xl"
          />
          <span className="field-underline-static" aria-hidden />
          <span className="field-underline-focus" aria-hidden />
        </div>
        {isFetching && (
          <Loader2
            className="absolute right-0 top-4 size-4 animate-spin text-muted-foreground"
            strokeWidth={1.6}
          />
        )}
      </div>

      <p className="caps mt-4 text-xs text-muted-foreground/70">
        Type at least 2 characters · 至少输入 2 字
      </p>

      <div className="mt-12">
        {debounced.trim().length < 2 && (
          <p className="font-display text-xl italic text-muted-foreground">
            Start typing to search.
          </p>
        )}

        {debounced.trim().length >= 2 && data && data.items.length === 0 && (
          <div>
            <p className="font-display text-xl italic text-muted-foreground">
              Nothing matches{" "}
              <span className="text-foreground">
                “{debounced.trim()}”
              </span>
              .
            </p>
            <p className="caps mt-2 text-muted-foreground/70">
              try a different word
            </p>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <p className="caps mb-8 text-muted-foreground">
              <span className="tabular text-foreground">
                {String(data.total).padStart(2, "0")}
              </span>{" "}
              {data.total === 1 ? "match" : "matches"}
            </p>
            <ol className="divide-y divide-site-rule/70">
              {data.items.map((p, i) => (
                <li key={p.id} className="group">
                  <TransitionLink
                    href={`/posts/${p.slug}`}
                    className="block py-6 md:grid md:grid-cols-[8rem_1fr] md:items-baseline md:gap-8"
                  >
                    <span className="caps tabular mb-2 block text-muted-foreground md:mb-0">
                      <span className="mr-2 text-foreground/50">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {formatShortDate(p.publishedAt ?? p.createdAt)}
                    </span>
                    <div className="space-y-2">
                      <h3 className="title-hover-underline font-display text-xl font-medium leading-tight tracking-[-0.015em] transition-colors duration-300 group-hover:text-site-accent md:text-2xl">
                        {highlight(p.title, debounced.trim())}
                      </h3>
                      {p.summary && (
                        <p className="font-reading text-muted-foreground">
                          {highlight(p.summary, debounced.trim())}
                        </p>
                      )}
                    </div>
                  </TransitionLink>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
