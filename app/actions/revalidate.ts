"use server";

import { revalidateTag } from "next/cache";

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
export async function revalidateSite(tags: string[] = ["posts"]) {
  for (const t of tags) {
    if (typeof t === "string" && t.length > 0) {
      revalidateTag(t, "max");
    }
  }
}
