import type { Metadata } from "next";

import { api } from "@/lib/api";
import type { EditorialBlock } from "@/lib/types";
import { EditorialPage } from "@/components/site/editorial-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Now",
  description: "What I'm focused on right now.",
};

const fallback: EditorialBlock = {
  heroTitle: "What I'm doing now.",
  bodyHtml: "",
};

export default async function NowPage() {
  let block: EditorialBlock = fallback;
  try {
    const settings = await api.getSettings();
    if (settings?.now) block = settings.now;
  } catch {
    /* keep fallback */
  }

  return (
    <EditorialPage
      eyebrow="Now"
      eyebrowZh="此刻"
      heroTitle={block.heroTitle || fallback.heroTitle}
      bodyHtml={block.bodyHtml}
      emptyText="A blank page, for now."
    />
  );
}
