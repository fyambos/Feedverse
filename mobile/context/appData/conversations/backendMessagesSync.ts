import type { Conversation, Message } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";

type AuthLike = {
  isReady: boolean;
  token?: string | null;
};

type ProviderStateLike = {
  isReady: boolean;
  db: any;
};

type MessagesSyncRef = {
  current: {
    inFlightByConversation: Record<string, boolean>;
    lastSyncAtByConversation: Record<string, number>;
  };
};

type SetStateLike = (next: { isReady: boolean; db: any }) => void;

type BackendEnv = {
  backendEnabled: boolean;
  isUuidLike: (id: string) => boolean;
};

export async function syncMessagesForConversationBackend(args: {
  scenarioId: string;
  conversationId: string;
  limit?: number;
  env: BackendEnv;
  auth: AuthLike;
  providerState: ProviderStateLike;
  messagesSyncRef: MessagesSyncRef;
  setState: SetStateLike;
}): Promise<void> {
  const sid = String(args.scenarioId ?? "").trim();
  const cid = String(args.conversationId ?? "").trim();
  const limit = Math.max(1, Math.min(200, Number.isFinite(args.limit as any) ? Number(args.limit) : 200));

  if (!args.env.backendEnabled) return;
  if (!sid || !args.env.isUuidLike(sid)) return;
  if (!cid || !args.env.isUuidLike(cid)) return;
  if (!args.auth.isReady) return;
  if (!args.providerState.isReady || !args.providerState.db) return;

  const token = String(args.auth.token ?? "").trim();
  const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (!token || !baseUrl) return;

  const key = cid;
  const nowMs = Date.now();
  const lastAt = args.messagesSyncRef.current.lastSyncAtByConversation[key] ?? 0;
  const inFlight = Boolean(args.messagesSyncRef.current.inFlightByConversation[key]);

  if (inFlight) return;
  if (nowMs - lastAt < 3_000) return;

  args.messagesSyncRef.current.inFlightByConversation[key] = true;
  args.messagesSyncRef.current.lastSyncAtByConversation[key] = nowMs;

  try {
    const res = await apiFetch({
      path: `/conversations/${encodeURIComponent(cid)}/messages?limit=${encodeURIComponent(String(limit))}`,
      token,
    });

    const json: any = res.json as any;
    const rows =
      Array.isArray(json?.items) ? (json.items as any[]) : Array.isArray(json?.messages) ? (json.messages as any[]) : null;
    if (!res.ok || !rows) return;

    const now = new Date().toISOString();
    const nextDb = await updateDb((prev) => {
      const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;

      const serverIds = new Set(
        rows
          .map((r) => String((r as any)?.id ?? "").trim())
          .filter(Boolean)
      );

      // Server is source of truth, but DO NOT delete optimistic client_* messages.
      // Also, keep existing server messages where possible so we preserve extra
      // client-only fields (e.g. clientMessageId) to avoid UI flicker.
      for (const [mid, m] of Object.entries(messages)) {
        if (String((m as any).scenarioId ?? "") !== sid) continue;
        if (String((m as any).conversationId ?? "") !== cid) continue;

        const id = String((m as any)?.id ?? mid).trim();
        const status = String((m as any)?.clientStatus ?? "").trim();
        const keepOptimistic = id.startsWith("client_") || status === "sending" || status === "failed";
        if (keepOptimistic) continue;

        if (!serverIds.has(id)) {
          delete (messages as any)[mid];
        }
      }

      let lastMessageAt: string | undefined = undefined;
      const order: Array<{ id: string; createdAt: string }> = [];

      for (const raw of rows) {
        const id = String(raw?.id ?? "").trim();
        if (!id) continue;

        const createdAt = raw?.createdAt
          ? new Date(raw.createdAt).toISOString()
          : raw?.created_at
            ? new Date(raw.created_at).toISOString()
            : now;

        const existing = messages[id] ?? ({} as any);
        messages[id] = {
          ...existing,
          id,
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
          conversationId: String(raw?.conversationId ?? raw?.conversation_id ?? cid),
          senderProfileId: String(raw?.senderProfileId ?? raw?.sender_profile_id ?? ""),
          senderUserId:
            raw?.senderUserId != null
              ? String(raw.senderUserId)
              : raw?.sender_user_id != null
                ? String(raw.sender_user_id)
                : (existing as any)?.senderUserId,
          kind: String(raw?.kind ?? raw?.kind ?? "text"),
          text: String(raw?.text ?? ""),
          imageUrls: Array.isArray(raw?.imageUrls)
            ? raw.imageUrls.map(String).filter(Boolean)
            : Array.isArray(raw?.image_urls)
              ? raw.image_urls.map(String).filter(Boolean)
              : [],
          createdAt,
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : createdAt,
          editedAt: raw?.editedAt
            ? new Date(raw.editedAt).toISOString()
            : raw?.edited_at
              ? new Date(raw.edited_at).toISOString()
              : undefined,
        } as any;

        if (!lastMessageAt || createdAt > lastMessageAt) lastMessageAt = createdAt;
        order.push({ id, createdAt });
      }

      order.sort((a, b) => {
        if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
        return a.id.localeCompare(b.id);
      });
      const messageIds = order.map((x) => x.id);

      const conv = conversations[cid];
      if (conv && String((conv as any).scenarioId ?? "") === sid) {
        conversations[cid] = { ...conv, lastMessageAt, updatedAt: now, messageIds } as any;
      }

      return { ...(prev as any), conversations, messages } as any;
    });

    args.setState({ isReady: true, db: nextDb as any });
  } finally {
    args.messagesSyncRef.current.inFlightByConversation[key] = false;
  }
}
