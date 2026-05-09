// Chat session sync — admin-only.
//
// The chat page treats localStorage as the durable cache and the server as
// the canonical store *when* the visitor is signed in as admin. Anonymous
// users skip every code path here.
//
// Hydration: pull every session + its messages on mount, merge with local
//            (server wins on overlap), then push any local-only sessions
//            up so the next pull is consistent.
// Write-through: upsert one session + each of its messages whenever a
//            streaming reply finishes. Done outside the stream loop so we
//            don't churn the network on every delta.
//
// We keep the wire format symmetrical with the local `Conversation` /
// `Message` shape so the hydration step is mostly a 1-to-1 rename.

import { ApiError, api, type ChatAttachment } from "@/lib/api";
import type {
  ServerChatMessage,
  ServerChatSession,
} from "@/lib/types";

export type Role = "user" | "assistant";

export interface SyncMessage {
  id: string;
  role: Role;
  content: string;
  attachments?: ChatAttachment[];
  tools?: string[];
  createdAt: string;
}

export interface SyncConversation {
  id: string; // == ClientID server-side
  title: string;
  pinned?: boolean;
  messages: SyncMessage[];
  createdAt: string;
  updatedAt: string;
}

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}

// Pull every session + its messages for the signed-in admin. Returns an
// array suitable for direct merging with `Conversation[]` in chat-interface.
export async function pullAllSessions(token: string): Promise<SyncConversation[]> {
  const sessionsR = await api.adminListChatSessions(token);
  // Fetch each session's message list in parallel — for a personal blog
  // admin's volume this is tens of round-trips at most. The server pages
  // could batch this in a future pass.
  const out = await Promise.all(
    sessionsR.items.map(async (s) => {
      const msgsR = await api.adminListSessionMessages(token, s.clientId);
      return convertServerSession(s, msgsR.items);
    }),
  );
  return out;
}

// Push a session's metadata + every message in one fan-out. Upserts are
// idempotent so re-pushing is harmless. Logs but doesn't throw on partial
// failures — sync is best-effort.
export async function pushSession(
  token: string,
  conv: SyncConversation,
): Promise<void> {
  try {
    await api.adminUpsertChatSession(token, {
      clientId: conv.id,
      title: conv.title,
      pinned: conv.pinned ?? false,
    });
  } catch (e) {
    logSyncError("upsertSession", e);
    // Even if session upsert failed, attempt messages — server has an
    // on-demand session-create path that handles missing rows.
  }
  for (const m of conv.messages) {
    try {
      await api.adminUpsertSessionMessage(token, conv.id, {
        clientId: m.id,
        role: m.role,
        content: m.content,
        attachments: m.attachments && m.attachments.length > 0 ? m.attachments : undefined,
        tools: m.tools && m.tools.length > 0 ? m.tools : undefined,
      });
    } catch (e) {
      logSyncError("upsertMessage", e);
    }
  }
}

export async function pushSessionMeta(
  token: string,
  conv: SyncConversation,
): Promise<void> {
  try {
    await api.adminUpsertChatSession(token, {
      clientId: conv.id,
      title: conv.title,
      pinned: conv.pinned ?? false,
    });
  } catch (e) {
    logSyncError("upsertSession-meta", e);
  }
}

export async function pushMessage(
  token: string,
  sessionClientId: string,
  m: SyncMessage,
): Promise<void> {
  try {
    await api.adminUpsertSessionMessage(token, sessionClientId, {
      clientId: m.id,
      role: m.role,
      content: m.content,
      attachments: m.attachments && m.attachments.length > 0 ? m.attachments : undefined,
      tools: m.tools && m.tools.length > 0 ? m.tools : undefined,
    });
  } catch (e) {
    logSyncError("upsertMessage", e);
  }
}

export async function deleteSession(
  token: string,
  sessionClientId: string,
): Promise<void> {
  try {
    await api.adminDeleteChatSession(token, sessionClientId);
  } catch (e) {
    logSyncError("deleteSession", e);
  }
}

export async function deleteMessage(
  token: string,
  sessionClientId: string,
  msgClientId: string,
): Promise<void> {
  try {
    await api.adminDeleteSessionMessage(token, sessionClientId, msgClientId);
  } catch (e) {
    logSyncError("deleteMessage", e);
  }
}

// Convert a server-shaped session + its messages into the client shape.
// Attachments and tools were stored as opaque JSON columns so we cast
// here — the wire structure already matches because we shipped them as
// the same object shape on upsert.
function convertServerSession(
  s: ServerChatSession,
  msgs: ServerChatMessage[],
): SyncConversation {
  return {
    id: s.clientId,
    title: s.title,
    pinned: s.pinned,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messages: msgs.map(convertServerMessage),
  };
}

function convertServerMessage(m: ServerChatMessage): SyncMessage {
  // role narrowing — server allows "system" but the client only renders
  // user/assistant. System rows shouldn't appear in chat history pulls,
  // but if they do we coerce to "assistant" rather than crash.
  const role: Role = m.role === "user" ? "user" : "assistant";
  const atts = (m.attachments as ChatAttachment[] | null | undefined) ?? undefined;
  const tools = (m.tools as string[] | null | undefined) ?? undefined;
  return {
    id: m.clientId,
    role,
    content: m.content,
    attachments: Array.isArray(atts) && atts.length > 0 ? atts : undefined,
    tools: Array.isArray(tools) && tools.length > 0 ? tools : undefined,
    createdAt: m.createdAt,
  };
}

// Merge server-pulled sessions with the local cache. Server wins on overlap
// (matched by client_id == local id), local-only sessions are preserved.
// The result is sorted by updatedAt DESC so the most recent thread surfaces
// at the top of the index sidebar.
export function mergeSessions(
  local: SyncConversation[],
  server: SyncConversation[],
): SyncConversation[] {
  const byId = new Map<string, SyncConversation>();
  // Local first so server overrides on overlap.
  for (const c of local) byId.set(c.id, c);
  for (const c of server) byId.set(c.id, c);
  return Array.from(byId.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

function logSyncError(op: string, e: unknown): void {
  if (e instanceof ApiError) {
    // 401 in the middle of a session means the access token expired between
    // checks. The next refresh cycle will recover; don't toast.
    if (e.status === 401) return;
    console.warn(`chat sync: ${op} failed: ${e.status} ${e.message}`);
    return;
  }
  console.warn(`chat sync: ${op} failed:`, e);
}
