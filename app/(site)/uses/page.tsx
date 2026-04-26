import type { Metadata } from "next";

import { api } from "@/lib/api";
import type { EditorialBlock } from "@/lib/types";
import { EditorialPage } from "@/components/site/editorial-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Uses",
  description: "Hardware, software, and tools I rely on.",
};

const fallback: EditorialBlock = {
  heroTitle: "What I use.",
  bodyHtml: "",
};

export default async function UsesPage() {
  let block: EditorialBlock = fallback;
  try {
    const settings = await api.getSettings();
    if (settings?.uses) block = settings.uses;
  } catch {
    /* keep fallback */
  }

  return (
    <EditorialPage
      eyebrow="Uses"
      eyebrowZh="器物"
      heroTitle={block.heroTitle || fallback.heroTitle}
      bodyHtml={block.bodyHtml}
      emptyText="The toolbox is still being arranged."
    />
  );
}
