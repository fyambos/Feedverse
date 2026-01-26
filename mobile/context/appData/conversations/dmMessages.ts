import type { Dispatch, SetStateAction } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Conversation, Message } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { coerceStringArray } from "@/lib/utils/pgArrays";

type AuthLike = {
  token?: string | null;
};

type EnvLike = {
  backendEnabled: boolean;
  isUuidLike: (id: string) => boolean;
};

type Deps = {
  env: EnvLike;
  auth: AuthLike;
  currentUserId: string;
  getDb: () => any;
  setState: Dispatch<SetStateAction<any>>;
};

export function createDmMessagesApi(deps: Deps) {
  const sendMessage: any = async (args: {
    scenarioId: string;
    conversationId: string;
    senderProfileId: string;
    text: string;
    imageUris?: string[];
    kind?: string;
    clientMessageId?: string;
  }) => {
    const sid = String(args.scenarioId ?? "").trim();
    const cid = String(args.conversationId ?? "").trim();
    const from = String(args.senderProfileId ?? "").trim();
    const body = String(args.text ?? "").trim();
    const kindVal = args.kind ? String(args.kind) : undefined;
    const images = Array.isArray(args.imageUris) ? args.imageUris.map(String).map((s) => s.trim()).filter(Boolean) : [];
    if (!sid || !cid || !from) return { ok: false, error: "Missing ids" };
    if (!body && images.length === 0) return { ok: false, error: "Message is empty" };

    if (deps.env.backendEnabled) {
      const token = String(deps.auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return { ok: false, error: "Missing backend auth" };
      if (!deps.env.isUuidLike(sid) || !deps.env.isUuidLike(cid) || !deps.env.isUuidLike(from)) {
        return { ok: false, error: "Invalid ids for backend mode" };
      }

      const requestedClientId = String(args.clientMessageId ?? "").trim();
      const optimisticId = requestedClientId ? requestedClientId : `client_${uuidv4()}`;
      const optimisticCreatedAt = new Date().toISOString();
      const optimisticTextForPreview = body ? body : images.length > 0 ? "photo" : "";

      const applyOptimistic = (prevDb: any) => {
        const conversations = { ...((prevDb as any).conversations ?? {}) } as Record<string, Conversation>;
        const messages = { ...((prevDb as any).messages ?? {}) } as Record<string, Message>;

        const existing = messages[optimisticId];
        const base = existing ? { ...(existing as any) } : {};
        messages[optimisticId] = {
          ...base,
          id: optimisticId,
          scenarioId: sid,
          conversationId: cid,
          senderProfileId: from,
          text: body,
          kind: String(kindVal ?? (base as any)?.kind ?? "text"),
          imageUrls: images,
          createdAt: String((base as any)?.createdAt ?? optimisticCreatedAt),
          updatedAt: optimisticCreatedAt,
          editedAt: undefined,
          clientStatus: "sending",
          clientError: undefined,
        } as any;

        const conv = conversations[cid];
        if (conv && String((conv as any).scenarioId ?? "") === sid) {
          const existingIds = Array.isArray((conv as any).messageIds) ? (conv as any).messageIds.map(String).filter(Boolean) : [];
          if (!existingIds.includes(optimisticId)) existingIds.push(optimisticId);

          conversations[cid] = {
            ...conv,
            lastMessageAt: optimisticCreatedAt,
            updatedAt: optimisticCreatedAt,
            messageIds: existingIds,
            lastMessageText: optimisticTextForPreview,
            lastMessageKind: String(kindVal ?? "text"),
            lastMessageSenderProfileId: from,
          } as any;
        }

        return { ...(prevDb as any), conversations, messages } as any;
      };

      // IMPORTANT: update UI state immediately.
      try {
        deps.setState((prevState: any) => {
          const curDb = (prevState as any)?.db;
          if (!curDb) return prevState as any;
          return { isReady: true, db: applyOptimistic(curDb) } as any;
        });
      } catch {}

      // Persist in background.
      try {
        void updateDb((prev) => applyOptimistic(prev as any));
      } catch {}

      const hasLocalImages = images.some((u) => !/^https?:\/\//i.test(u));

      const res = hasLocalImages
        ? await (async () => {
            const form = new FormData();
            form.append("senderProfileId", from);
            form.append("text", body);
            if (kindVal) form.append("kind", kindVal);

            let i = 0;
            for (const uri of images) {
              if (!uri || /^https?:\/\//i.test(uri)) continue;
              const lower = uri.toLowerCase();
              const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
              const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              form.append("images", { uri, name: `dm_${cid}_${Date.now()}_${i}.${ext}`, type } as any);
              i++;
            }

            return await apiFetch({
              path: `/conversations/${encodeURIComponent(cid)}/messages`,
              token,
              init: {
                method: "POST",
                body: form as any,
              },
            });
          })()
        : await apiFetch({
            path: `/conversations/${encodeURIComponent(cid)}/messages`,
            token,
            init: {
              method: "POST",
              body: JSON.stringify({ senderProfileId: from, text: body, kind: kindVal }),
            },
          });

      if (!res.ok) {
        const err = (res.json as any)?.error ?? res.text ?? "Send failed";
        const applyFailed = (prevDb: any) => {
          const messages = { ...((prevDb as any).messages ?? {}) } as Record<string, Message>;
          const existing = messages[optimisticId];
          if (!existing) return prevDb as any;
          messages[optimisticId] = {
            ...(existing as any),
            clientStatus: "failed",
            clientError: String(err),
            updatedAt: new Date().toISOString(),
          } as any;
          return { ...(prevDb as any), messages } as any;
        };

        try {
          deps.setState((prevState: any) => {
            const curDb = (prevState as any)?.db;
            if (!curDb) return prevState as any;
            return { isReady: true, db: applyFailed(curDb) } as any;
          });
        } catch {}

        try {
          void updateDb((prev) => applyFailed(prev as any));
        } catch {}

        return { ok: false, error: err };
      }

      const m = (res.json as any)?.message;
      const mid = String(m?.id ?? "").trim();
      if (!mid) return { ok: false, error: "Send failed" };

      const remoteImageUrls = coerceStringArray(m?.imageUrls ?? m?.image_urls);
      const localPickedImages = images.filter((u) => !/^https?:\/\//i.test(u));
      const imageUrlsForDb = remoteImageUrls.length > 0 ? remoteImageUrls : localPickedImages;

      const applyServerConfirm = (prevDb: any) => {
        const conversations = { ...((prevDb as any).conversations ?? {}) } as Record<string, Conversation>;
        const messages = { ...((prevDb as any).messages ?? {}) } as Record<string, Message>;

        try {
          delete (messages as any)[optimisticId];
        } catch {}

        const createdAt = m?.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString();

        messages[mid] = {
          id: mid,
          clientMessageId: optimisticId,
          scenarioId: sid,
          conversationId: cid,
          senderProfileId: from,
          senderUserId:
            m?.senderUserId != null
              ? String(m.senderUserId)
              : m?.sender_user_id != null
                ? String(m.sender_user_id)
                : String(deps.currentUserId ?? "").trim() || undefined,
          text: String(m?.text ?? body),
          kind: String(m?.kind ?? m?.kind ?? kindVal ?? "text"),
          imageUrls: imageUrlsForDb,
          createdAt,
          updatedAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : createdAt,
          editedAt: m?.editedAt ? new Date(m.editedAt).toISOString() : undefined,
        } as any;

        const conv = conversations[cid];
        if (conv && String((conv as any).scenarioId ?? "") === sid) {
          const existingIds = Array.isArray((conv as any).messageIds) ? (conv as any).messageIds.map(String).filter(Boolean) : [];
          const nextIds = existingIds.filter((x: string) => x !== optimisticId);
          if (!nextIds.includes(mid)) nextIds.push(mid);

          conversations[cid] = {
            ...conv,
            lastMessageAt: createdAt,
            updatedAt: new Date().toISOString(),
            messageIds: nextIds,
            lastMessageText: String(m?.text ?? optimisticTextForPreview ?? ""),
            lastMessageKind: String(m?.kind ?? kindVal ?? "text"),
            lastMessageSenderProfileId: from,
          } as any;
        }

        return { ...(prevDb as any), conversations, messages } as any;
      };

      try {
        deps.setState((prevState: any) => {
          const curDb = (prevState as any)?.db;
          if (!curDb) return prevState as any;
          return { isReady: true, db: applyServerConfirm(curDb) } as any;
        });
      } catch {}

      try {
        void updateDb((prev) => applyServerConfirm(prev as any));
      } catch {}

      return { ok: true, messageId: mid };
    }

    // Local mode
    const now = new Date().toISOString();
    const messageId = uuidv4();

    const nextDb = await updateDb((prev) => {
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
      const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

      const conv = conversations[cid];
      if (!conv) return prev;
      if (String((conv as any).scenarioId ?? "") !== sid) return prev;

      messages[messageId] = {
        id: messageId,
        scenarioId: sid,
        conversationId: cid,
        senderProfileId: from,
        text: body,
        imageUrls: images,
        createdAt: now,
        updatedAt: now,
        editedAt: undefined,
      } as any;

      const existingIds = Array.isArray((conv as any).messageIds) ? (conv as any).messageIds.map(String).filter(Boolean) : [];
      if (!existingIds.includes(messageId)) existingIds.push(messageId);

      conversations[cid] = {
        ...conv,
        lastMessageAt: now,
        updatedAt: now,
        messageIds: existingIds,
        lastMessageText: body ? body : images.length > 0 ? "photo" : "",
        lastMessageKind: String(kindVal ?? "text"),
        lastMessageSenderProfileId: from,
      } as any;

      return { ...(prev as any), conversations, messages } as any;
    });

    deps.setState({ isReady: true, db: nextDb as any });
    return { ok: true, messageId };
  };

  const updateMessage = async (args: { scenarioId: string; messageId: string; text?: string; senderProfileId?: string }) => {
    const sid = String(args.scenarioId ?? "").trim();
    const mid = String(args.messageId ?? "").trim();
    const nextText = args.text == null ? undefined : String(args.text);
    const nextSender = args.senderProfileId == null ? undefined : String(args.senderProfileId);
    if (!sid || !mid) return;

    if (deps.env.backendEnabled) {
      const token = String(deps.auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) throw new Error("Missing backend auth");
      if (!deps.env.isUuidLike(sid) || !deps.env.isUuidLike(mid)) throw new Error("Invalid ids for backend mode");

      const body: any = {};
      if (nextText !== undefined) body.text = nextText;
      if (nextSender !== undefined) body.senderProfileId = nextSender;

      const res = await apiFetch({
        path: `/messages/${encodeURIComponent(mid)}`,
        token,
        init: {
          method: "PUT",
          body: JSON.stringify(body),
        },
      });

      if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Update failed");
      const m = (res.json as any)?.message;
      if (!m?.id) return;

      const nextDb = await updateDb((prev) => {
        const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
        const existing = messages[mid] ?? {};

        const createdAt = m?.createdAt ? new Date(m.createdAt).toISOString() : String((existing as any)?.createdAt ?? new Date().toISOString());

        messages[mid] = {
          ...(existing as any),
          id: String(m.id),
          scenarioId: String(m?.scenarioId ?? sid),
          conversationId: String(m?.conversationId ?? (existing as any)?.conversationId ?? ""),
          senderProfileId: String(m?.senderProfileId ?? (existing as any)?.senderProfileId ?? ""),
          text: String(m?.text ?? (existing as any)?.text ?? ""),
          createdAt,
          updatedAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : new Date().toISOString(),
          editedAt: m?.editedAt ? new Date(m.editedAt).toISOString() : new Date().toISOString(),
        } as any;

        return { ...(prev as any), messages } as any;
      });

      deps.setState({ isReady: true, db: nextDb as any });
      return;
    }

    const nextDb = await updateDb((prev) => {
      const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

      const existing = messages[mid];
      if (!existing) return prev;
      if (String((existing as any).scenarioId ?? "") !== sid) return prev;

      const now = new Date().toISOString();
      const patched: any = { ...existing };

      let changed = false;

      if (nextText !== undefined) {
        const body = nextText.trim();
        if (!body) return prev;
        if (String((existing as any).text ?? "") !== body) {
          patched.text = body;
          changed = true;
        }
      }

      if (nextSender !== undefined) {
        const from = nextSender.trim();
        if (!from) return prev;
        if (String((existing as any).senderProfileId ?? "") !== from) {
          patched.senderProfileId = from;
          changed = true;
        }
      }

      if (!changed) return prev;

      patched.updatedAt = now;
      patched.editedAt = now;
      messages[mid] = patched;

      return { ...(prev as any), messages } as any;
    });

    deps.setState({ isReady: true, db: nextDb as any });
  };

  const deleteMessage = async (args: { scenarioId: string; messageId: string }) => {
    const sid = String(args.scenarioId ?? "").trim();
    const mid = String(args.messageId ?? "").trim();
    if (!sid || !mid) return;

    if (deps.env.backendEnabled) {
      const token = String(deps.auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) throw new Error("Missing backend auth");
      // Client-only optimistic ids (e.g. client_*) should be deleted locally only.
      if (deps.env.isUuidLike(sid) && deps.env.isUuidLike(mid)) {
        const res = await apiFetch({
          path: `/messages/${encodeURIComponent(mid)}`,
          token,
          init: { method: "DELETE" },
        });
        if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Delete failed");
      }
    }

    const nextDb = await updateDb((prev) => {
      const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;

      const existing = messages[mid];
      if (!existing) return prev;
      if (String((existing as any).scenarioId ?? "") !== sid) return prev;

      const cid = String((existing as any).conversationId ?? "");
      delete messages[mid];

      const conv = conversations[cid];
      if (conv && String((conv as any).scenarioId ?? "") === sid) {
        let lastMessageAt: string | undefined = undefined;
        for (const m of Object.values(messages)) {
          if (String((m as any).scenarioId ?? "") !== sid) continue;
          if (String((m as any).conversationId ?? "") !== cid) continue;
          const createdAt = String((m as any).createdAt ?? "");
          if (!createdAt) continue;
          if (!lastMessageAt || createdAt.localeCompare(lastMessageAt) > 0) lastMessageAt = createdAt;
        }

        conversations[cid] = {
          ...conv,
          lastMessageAt,
          updatedAt: new Date().toISOString(),
        } as any;
      }

      return { ...(prev as any), conversations, messages } as any;
    });

    deps.setState({ isReady: true, db: nextDb as any });
  };

  const reorderMessagesInConversation = async (args: {
    scenarioId: string;
    conversationId: string;
    orderedMessageIds: string[];
  }) => {
    const sid = String(args.scenarioId ?? "").trim();
    const cid = String(args.conversationId ?? "").trim();
    const ids = (args.orderedMessageIds ?? []).map(String).map((s) => s.trim()).filter(Boolean);
    if (!sid || !cid) return;
    if (ids.length < 2) return;

    const nextDb = await updateDb((prev) => {
      const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;

      const existing: Message[] = [];
      for (const mid of ids) {
        const m = messages[mid];
        if (!m) return prev;
        if (String((m as any).scenarioId ?? "") !== sid) return prev;
        if (String((m as any).conversationId ?? "") !== cid) return prev;
        existing.push(m);
      }

      let startMs: number | null = null;
      for (const m of existing) {
        const ms = Date.parse(String((m as any).createdAt ?? ""));
        if (!Number.isFinite(ms)) continue;
        startMs = startMs == null ? ms : Math.min(startMs, ms);
      }
      if (startMs == null) startMs = Date.now();

      for (let i = 0; i < ids.length; i++) {
        const mid = ids[i];
        const m = messages[mid];
        if (!m) continue;
        messages[mid] = { ...m, createdAt: new Date(startMs + i * 1000).toISOString() } as any;
      }

      const conv = conversations[cid];
      if (conv && String((conv as any).scenarioId ?? "") === sid) {
        const lastMessageAt = new Date(startMs + (ids.length - 1) * 1000).toISOString();
        conversations[cid] = { ...conv, lastMessageAt, updatedAt: new Date().toISOString() } as any;
      }

      return { ...(prev as any), conversations, messages } as any;
    });

    deps.setState({ isReady: true, db: nextDb as any });
  };

  return {
    sendMessage,
    updateMessage,
    deleteMessage,
    reorderMessagesInConversation,
  };
}
