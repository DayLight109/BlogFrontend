"use server";

import { revalidateTag } from "next/cache";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";
const ALLOWED_TAGS = new Set([
  "posts",
  "settings",
  "tags",
  "archive",
]);

/**
 * Invalidate the Next.js fetch cache for the given tags so that the public
 * site refetches fresh data from the Go API on the next request.
 *
 * In Next 16, `revalidateTag` requires a `cacheLife` profile as its second
 * argument. We use `"max"` for stale-while-revalidate semantics: readers may
 * briefly see stale content for the duration of the single background refresh.
 *
 * Our API client tags every public fetch with at least `"posts"`, so that
 * single tag cascades to list / detail / tags / archive / neighbors / related.
 * Pass additional specific tags for targeted invalidation.
 */
export async function revalidateSite(
  tags: string[] = ["posts"],
  accessToken?: string,
) {
  if (!accessToken) throw new Error("Unauthorized");

  const me = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!me.ok) throw new Error("Unauthorized");
  const user = (await me.json()) as { role?: string };
  if (user.role !== "admin") throw new Error("Forbidden");

  for (const t of new Set(tags)) {
    if (ALLOWED_TAGS.has(t)) {
      revalidateTag(t, "max");
    }
  }
}
