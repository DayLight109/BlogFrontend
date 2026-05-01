import type { Metadata } from "next";

import { ChatInterface } from "./chat-interface";

export const metadata: Metadata = {
  title: "AI Chat",
  description: "A polished AI conversation workspace for the blog.",
};

export default function ChatPage() {
  return <ChatInterface />;
}
