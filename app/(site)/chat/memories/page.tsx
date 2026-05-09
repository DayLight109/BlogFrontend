import type { Metadata } from "next";

import { MemoriesInterface } from "./memories-interface";

export const metadata: Metadata = {
  title: "Kiri's memory",
  description: "Durable facts the assistant has filed away from past conversations.",
  robots: { index: false, follow: false },
};

export default function MemoriesPage() {
  return <MemoriesInterface />;
}
