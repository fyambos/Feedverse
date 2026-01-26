import type { Dispatch, SetStateAction } from "react";
import type { Conversation, Profile } from "@/data/db/schema";
import { updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";

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
  findConversationIdByExactParticipants: (db: any, scenarioId: string, participantIds: string[]) => string | null;
  makeConversationId: (scenarioId: string) => string;
};

function uniqTrimmed(ids: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ) as string[];
}

export function createDmConversationsApi(deps: Deps) {
  const upsertConversation = async (c: Conversation) => {
    const convId = String((c as any).id ?? "").trim();
    const sid = String((c as any).scenarioId ?? "").trim();
    if (!convId || !sid) return;

    const now = new Date().toISOString();

    const next = await updateDb((prev) => {
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
      const existing = conversations[convId];

      conversations[convId] = {
        ...(existing ?? {}),
        ...(c as any),
        id: convId,
        scenarioId: sid,
        participantProfileIds: Array.isArray((c as any).participantProfileIds)
          ? (c as any).participantProfileIds.map(String).filter(Boolean)
          : ((existing as any)?.participantProfileIds ?? []),
        createdAt: (existing as any)?.createdAt ?? (c as any).createdAt ?? now,
        updatedAt: now,
      } as any;

      return { ...(prev as any), conversations } as any;
    });

    deps.setState({ isReady: true, db: next as any });
  };

  const updateConversationMeta = async (args: {
    scenarioId: string;
    conversationId: string;
    title?: string | null;
    avatarUrl?: string | null;
  }) => {
    const sid = String(args.scenarioId ?? "").trim();
    const cid = String(args.conversationId ?? "").trim();
    if (!sid || !cid) return;

    const title = args.title;
    const avatarUrl = args.avatarUrl;

    if (deps.env.backendEnabled) {
      const token = String(deps.auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) throw new Error("Missing backend auth");
      if (!deps.env.isUuidLike(sid) || !deps.env.isUuidLike(cid)) throw new Error("Invalid ids for backend mode");

      let nextAvatarUrl: string | null | undefined;
      if (avatarUrl === undefined) {
        nextAvatarUrl = undefined;
      } else if (avatarUrl === null) {
        nextAvatarUrl = null;
      } else {
        const trimmed = String(avatarUrl).trim();
        nextAvatarUrl = trimmed ? trimmed : null;
      }

      // If we have a local image uri, upload it to R2 first and persist the returned public URL.
      if (typeof nextAvatarUrl === "string" && nextAvatarUrl.length > 0 && !/^https?:\/\//i.test(nextAvatarUrl)) {
        const lower = nextAvatarUrl.toLowerCase();
        const type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
        const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
        const form = new FormData();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form.append("avatar", { uri: nextAvatarUrl, name: `conversation_${cid}_${Date.now()}.${ext}`, type } as any);

        const up = await apiFetch({
          path: `/conversations/${encodeURIComponent(cid)}/avatar`,
          token,
          init: {
            method: "POST",
            body: form as any,
          },
        });

        if (!up.ok) throw new Error((up.json as any)?.error ?? up.text ?? "Upload failed");
        const uploadedConversation = (up.json as any)?.conversation;
        if (uploadedConversation?.id) {
          await upsertConversation(uploadedConversation as any);
        }

        // Avatar is already persisted server-side; omit it from the meta PUT.
        nextAvatarUrl = undefined;
      }

      const body: any = {};
      if (title !== undefined) body.title = title;
      if (nextAvatarUrl !== undefined) body.avatarUrl = nextAvatarUrl;

      // If avatar was uploaded and there's no title change, we're done.
      if (Object.keys(body).length === 0) return;

      const res = await apiFetch({
        path: `/conversations/${encodeURIComponent(cid)}`,
        token,
        init: {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      });

      if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Update failed");
      const c = (res.json as any)?.conversation;
      if (c?.id) {
        await upsertConversation(c as any);
      }
      return;
    }

    const next = await updateDb((prev) => {
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
      const existing = conversations[cid];
      if (!existing) return prev;
      if (String((existing as any).scenarioId ?? "") !== sid) return prev;

      const now = new Date().toISOString();

      const nextTitle = title == null ? undefined : String(title);
      const nextAvatarUrl = avatarUrl == null ? undefined : String(avatarUrl);

      conversations[cid] = {
        ...existing,
        title: nextTitle && nextTitle.trim() ? nextTitle.trim() : undefined,
        avatarUrl: nextAvatarUrl && nextAvatarUrl.trim() ? nextAvatarUrl.trim() : undefined,
        updatedAt: now,
      } as any;

      return { ...(prev as any), conversations } as any;
    });

    deps.setState({ isReady: true, db: next as any });
  };

  const updateConversationParticipants = async (args: {
    scenarioId: string;
    conversationId: string;
    participantProfileIds: string[];
  }) => {
    const sid = String(args.scenarioId ?? "").trim();
    const cid = String(args.conversationId ?? "").trim();
    const ids = uniqTrimmed(args.participantProfileIds);

    if (!sid || !cid) return;
    if (ids.length < 1) return;

    if (deps.env.backendEnabled) {
      const token = String(deps.auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) throw new Error("Missing backend auth");
      if (!deps.env.isUuidLike(sid) || !deps.env.isUuidLike(cid)) throw new Error("Invalid ids for backend mode");

      const res = await apiFetch({
        path: `/conversations/${encodeURIComponent(cid)}/participants`,
        token,
        init: {
          method: "PUT",
          body: JSON.stringify({ participantProfileIds: ids }),
        },
      });

      if (!res.ok) throw new Error((res.json as any)?.error ?? res.text ?? "Update failed");
      const c = (res.json as any)?.conversation;
      if (c?.id) {
        await upsertConversation(c as any);
      }
      return;
    }

    const next = await updateDb((prev) => {
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
      const existing = conversations[cid];
      if (!existing) return prev;
      if (String((existing as any).scenarioId ?? "") !== sid) return prev;

      const now = new Date().toISOString();

      conversations[cid] = {
        ...existing,
        participantProfileIds: ids,
        updatedAt: now,
      } as any;

      return { ...(prev as any), conversations } as any;
    });

    deps.setState({ isReady: true, db: next as any });
  };

  const getConversationById = (conversationId: string) => {
    const db = deps.getDb();
    if (!db) return null;
    const id = String(conversationId ?? "").trim();
    if (!id) return null;
    return (((db as any).conversations ?? {}) as Record<string, Conversation>)[id] ?? null;
  };

  const listSendAsProfilesForScenario = (scenarioId: string) => {
    const db = deps.getDb();
    if (!db) return { owned: [], public: [] };

    const sid = String(scenarioId ?? "").trim();
    const uid = String(deps.currentUserId ?? "").trim();
    if (!sid) return { owned: [], public: [] };

    const owned: Profile[] = [];
    const pub: Profile[] = [];

    for (const p of Object.values(db.profiles ?? {})) {
      if (String((p as any).scenarioId ?? "") !== sid) continue;
      const isPublic = Boolean((p as any).isPublic);
      if (uid && String((p as any).ownerUserId ?? "") === uid) owned.push(p as any);
      if (isPublic) pub.push(p as any);
    }

    const byName = (a: Profile, b: Profile) =>
      String((a as any).displayName ?? "").localeCompare(String((b as any).displayName ?? ""));

    owned.sort(byName);
    pub.sort(byName);

    return { owned, public: pub };
  };

  const getOrCreateConversation = async (args: {
    scenarioId: string;
    participantProfileIds: string[];
    selectedProfileId?: string;
  }): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> => {
    const sid = String(args.scenarioId ?? "").trim();
    const ids = uniqTrimmed(args.participantProfileIds);

    if (!sid) return { ok: false, error: "scenarioId is required" };
    if (ids.length < 1) return { ok: false, error: "participantProfileIds must have 1+ ids" };

    if (deps.env.backendEnabled) {
      const token = String(deps.auth.token ?? "").trim();
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      if (!token || !baseUrl) return { ok: false, error: "Missing backend auth" };
      if (!deps.env.isUuidLike(sid)) return { ok: false, error: "Invalid scenarioId for backend mode" };

      const res = await apiFetch({
        path: `/scenarios/${encodeURIComponent(sid)}/conversations:getOrCreate`,
        token,
        init: {
          method: "POST",
          body: JSON.stringify({ participantProfileIds: ids, selectedProfileId: args.selectedProfileId }),
        },
      });

      if (!res.ok) return { ok: false, error: (res.json as any)?.error ?? res.text ?? "Could not create" };
      const c = (res.json as any)?.conversation;
      const convId = String(c?.id ?? "").trim();
      if (!convId) return { ok: false, error: "Could not create" };

      await upsertConversation(c as any);
      return { ok: true, conversationId: convId };
    }

    const db = deps.getDb();
    const existingId = db ? deps.findConversationIdByExactParticipants(db as any, sid, ids as string[]) : null;
    const convId = existingId ?? deps.makeConversationId(sid);

    const now = new Date().toISOString();

    const next = await updateDb((prev) => {
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
      const existing = conversations[convId];

      if (!existing) {
        conversations[convId] = {
          id: convId,
          scenarioId: sid,
          participantProfileIds: (ids.slice().sort() as string[]),
          createdAt: now,
          updatedAt: now,
          lastMessageAt: undefined,
        } as any;
      }

      return { ...(prev as any), conversations } as any;
    });

    deps.setState({ isReady: true, db: next as any });
    return { ok: true, conversationId: convId };
  };

  return {
    upsertConversation,
    updateConversationMeta,
    updateConversationParticipants,
    getConversationById,
    listSendAsProfilesForScenario,
    getOrCreateConversation,
  };
}
