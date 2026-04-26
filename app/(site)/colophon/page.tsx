import type { Metadata } from "next";

import { api } from "@/lib/api";
import type { EditorialBlock } from "@/lib/types";
import { EditorialPage } from "@/components/site/editorial-page";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Colophon",
  description: "Notes on how this site is built.",
};

const fallback: EditorialBlock = {
  heroTitle: "About this site.",
  bodyHtml: "",
};

export default async function ColophonPage() {
  let block: EditorialBlock = fallback;
  try {
    const settings = await api.getSettings();
    if (settings?.colophon) block = settings.colophon;
  } catch {
    /* keep fallback */
  }

  return (
    <EditorialPage
      eyebrow="Colophon"
      eyebrowZh="版记"
      heroTitle={block.heroTitle || fallback.heroTitle}
      bodyHtml={block.bodyHtml}
      emptyText="Notes on the press will follow."
    />
  );
}
