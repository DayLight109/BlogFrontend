import type { MetadataRoute } from "next";

import { api } from "@/lib/api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/archive",
    "/tags",
    "/about",
    "/search",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));

  try {
    const [{ items: posts }, tagsData] = await Promise.all([
      api.listPosts({ size: 500 }),
      api.listTags(),
    ]);

    const postRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
      url: `${SITE_URL}/posts/${p.slug}`,
      lastModified: new Date(p.updatedAt ?? p.createdAt),
      changeFrequency: "monthly",
      priority: 0.85,
    }));

    const tagRoutes: MetadataRoute.Sitemap = tagsData.items.map((t) => ({
      url: `${SITE_URL}/tags/${encodeURIComponent(t.tag)}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    return [...staticRoutes, ...postRoutes, ...tagRoutes];
  } catch {
    return staticRoutes;
  }
}
