import { v4 as uuidv4 } from "uuid";
import type { Conversation, Message } from "@/data/db/schema";
import { readDb, updateDb } from "@/data/db/storage";
import { apiFetch } from "@/lib/api/apiClient";
import { getActiveConversation } from "./conversationView";
import { type AppNotification, presentNotification } from "../scenario/notificationEvents";
import { getScenarioNotificationPrefsFromDb } from "../scenario/scenarioNotificationPrefs";

type AuthLike = {
  isReady: boolean;
  token?: string | null;
  userId?: string | null;
};

type ProviderStateLike = {
  isReady: boolean;
  db: any;
};

type ConversationsSyncRef = {
  current: {
    inFlightByScenario: Record<string, boolean>;
    lastSyncAtByScenario: Record<string, number>;
  };
};

type WsConnectionsRef = {
  current: Record<string, WebSocket | null>;
};

type SetStateLike = (next: { isReady: boolean; db: any } | ((prev: any) => any)) => void;

type BackendEnv = {
  backendEnabled: boolean;
  isUuidLike: (id: string) => boolean;
  isBackendMode: (token: string | null | undefined) => boolean;
};

type MessageEventHandler = (msg: Message) => void;

type TypingEvent = {
  scenarioId?: string;
  conversationId?: string;
  profileId?: string;
  typing?: boolean;
  userId?: string;
};

type TypingEventHandler = (ev: TypingEvent) => void;

async function upsertConversationFromServer(args: {
  conversation: any;
  setState: SetStateLike;
}): Promise<void> {
  const convId = String(args.conversation?.id ?? "").trim();
  const sid = String(args.conversation?.scenarioId ?? args.conversation?.scenario_id ?? "").trim();
  if (!convId || !sid) return;

  const now = new Date().toISOString();

  const next = await updateDb((prev) => {
    const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
    const existing = conversations[convId];

    conversations[convId] = {
      ...(existing ?? {}),
      ...(args.conversation ?? {}),
      id: convId,
      scenarioId: sid,
      participantProfileIds: Array.isArray((args.conversation as any).participantProfileIds)
        ? (args.conversation as any).participantProfileIds.map(String).filter(Boolean)
        : ((existing as any)?.participantProfileIds ?? []),
      createdAt: (existing as any)?.createdAt ?? (args.conversation as any)?.createdAt ?? now,
      updatedAt: now,
    } as any;

    return { ...(prev as any), conversations } as any;
  });

  args.setState({ isReady: true, db: next as any });
}

export async function syncConversationsForScenarioBackend(args: {
  scenarioId: string;
  env: BackendEnv;
  auth: AuthLike;
  providerState: ProviderStateLike;
  conversationsSyncRef: ConversationsSyncRef;
  wsConnectionsRef: WsConnectionsRef;
  messageEventHandlers: Set<MessageEventHandler>;
  typingEventHandlers: Set<TypingEventHandler>;
  setState: SetStateLike;
}): Promise<void> {
  const sid = String(args.scenarioId ?? "").trim();
  if (!args.env.backendEnabled) return;
  if (!sid || !args.env.isUuidLike(sid)) return;
  if (!args.auth.isReady) return;
  if (!args.providerState.isReady || !args.providerState.db) return;

  const token = String(args.auth.token ?? "").trim();
  const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (!token || !baseUrl) return;

  const nowMs = Date.now();
  const lastAt = args.conversationsSyncRef.current.lastSyncAtByScenario[sid] ?? 0;
  const inFlight = Boolean(args.conversationsSyncRef.current.inFlightByScenario[sid]);

  // throttle
  if (inFlight) return;
  if (nowMs - lastAt < 5_000) return;

  args.conversationsSyncRef.current.inFlightByScenario[sid] = true;
  args.conversationsSyncRef.current.lastSyncAtByScenario[sid] = nowMs;

  try {
    // Get selectedProfileId for this scenario from local state (api helper isn't available yet).
    // In backend mode the inbox is selected-profile-only; if we don't have a valid owned selection,
    // skip syncing instead of hitting the backend with a bad request.
    const rawSelected = args.providerState.db ? ((args.providerState.db as any).selectedProfileByScenario?.[sid] ?? null) : null;
    const selectedProfileId = rawSelected == null ? "" : String(rawSelected ?? "").trim();
    if (!selectedProfileId || selectedProfileId === "null" || selectedProfileId === "undefined") return;
    if (!args.env.isUuidLike(selectedProfileId)) return;

    const selectedProfile = (args.providerState.db as any)?.profiles?.[selectedProfileId];
    if (!selectedProfile) return;
    if (String((selectedProfile as any)?.scenarioId ?? "") !== sid) return;
    const authUserId = String(args.auth.userId ?? "").trim();
    if (authUserId) {
      const ownerUserId = String((selectedProfile as any)?.ownerUserId ?? "").trim();
      if (!ownerUserId || ownerUserId !== authUserId) return;
    }

    const query = `?selectedProfileId=${encodeURIComponent(selectedProfileId)}`;
    const res = await apiFetch({
      path: `/scenarios/${encodeURIComponent(sid)}/conversations${query}`,
      token,
    });

    const rows = Array.isArray((res.json as any)?.conversations) ? ((res.json as any).conversations as any[]) : null;
    if (!res.ok || !rows) return;

    const now = new Date().toISOString();
    const nextDb = await updateDb((prev) => {
      const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
      const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;

      const seen = new Set<string>();

      for (const raw of rows) {
        const id = String(raw?.id ?? "").trim();
        if (!id) continue;
        seen.add(id);

        const existing = conversations[id] ?? {};

        const participantIds = Array.isArray(raw?.participantProfileIds)
          ? raw.participantProfileIds.map(String).map((s: string) => s.trim()).filter(Boolean)
          : Array.isArray(raw?.participant_profile_ids)
            ? raw.participant_profile_ids.map(String).map((s: string) => s.trim()).filter(Boolean)
            : (existing as any)?.participantProfileIds ?? [];

        conversations[id] = {
          ...(existing as any),
          id,
          scenarioId: String(raw?.scenarioId ?? raw?.scenario_id ?? sid),
          title: raw?.title != null ? String(raw.title) : (existing as any)?.title,
          avatarUrl:
            raw?.avatarUrl != null
              ? String(raw.avatarUrl)
              : raw?.avatar_url != null
                ? String(raw.avatar_url)
                : (existing as any)?.avatarUrl,
          participantProfileIds: Array.from(new Set(participantIds)).sort(),
          createdAt: raw?.createdAt
            ? new Date(raw.createdAt).toISOString()
            : raw?.created_at
              ? new Date(raw.created_at).toISOString()
              : (existing as any)?.createdAt ?? now,
          updatedAt: raw?.updatedAt
            ? new Date(raw.updatedAt).toISOString()
            : raw?.updated_at
              ? new Date(raw.updated_at).toISOString()
              : now,
          lastMessageAt:
            raw?.lastMessageAt != null
              ? raw.lastMessageAt
                ? new Date(raw.lastMessageAt).toISOString()
                : undefined
              : raw?.last_message_at != null
                ? raw.last_message_at
                  ? new Date(raw.last_message_at).toISOString()
                  : undefined
                : (existing as any)?.lastMessageAt,
          lastMessageText:
            raw?.lastMessageText != null
              ? String(raw.lastMessageText)
              : raw?.last_message_text != null
                ? String(raw.last_message_text)
                : (existing as any)?.lastMessageText,
          lastMessageKind:
            raw?.lastMessageKind != null
              ? String(raw.lastMessageKind)
              : raw?.last_message_kind != null
                ? String(raw.last_message_kind)
                : (existing as any)?.lastMessageKind,
          lastMessageSenderProfileId:
            raw?.lastMessageSenderProfileId != null
              ? String(raw.lastMessageSenderProfileId)
              : raw?.last_message_sender_profile_id != null
                ? String(raw.last_message_sender_profile_id)
                : (existing as any)?.lastMessageSenderProfileId,
        } as any;
      }

      // NOTE: Do NOT delete local conversations that aren't returned by this sync.
      // The server list can be filtered (e.g. selectedProfileId) and we also want
      // to be resilient to transient backend errors. Deleting here can make DMs
      // "disappear" from the inbox.

      return { ...(prev as any), conversations, messages } as any;
    });

    args.setState({ isReady: true, db: nextDb as any });

    // Prefer WebSocket for realtime updates; fall back to polling if WS not available.
    try {
      const baseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
      const token = String(args.auth.token ?? "").trim();
      if (baseUrl && token && typeof WebSocket !== "undefined") {
        const existingWs = args.wsConnectionsRef.current[sid];
        if (!existingWs) {
          try {
            // Try to include Authorization header where supported (React Native WebSocket
            // supports passing `headers` in the constructor options). If that fails,
            // fall back to passing the token in the query string.
            const wsBase = `${baseUrl.replace(/^http/, "ws")}/realtime/ws?scenarioId=${encodeURIComponent(sid)}`;
            let ws: WebSocket;
            try {
              // @ts-ignore - some RN/WebSocket typings don't expose the headers option
              ws = new WebSocket(wsBase, undefined as any, { headers: { Authorization: `Bearer ${token}` } });
            } catch (e) {
              // Fallback: append token to query string
              const wsUrlWithToken = `${wsBase}&token=${encodeURIComponent(token)}`;
              ws = new WebSocket(wsUrlWithToken);
            }
            ws.onopen = () => {
              // no-op for now
            };
            ws.onmessage = async (ev: any) => {
              try {
                const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
                const evName = String(d?.event ?? "");
                const payload = d?.payload ?? d?.data ?? null;
                const currentUserId = String(args.auth.userId ?? "");

                if (evName === "conversation.created" && payload?.conversation) {
                  void upsertConversationFromServer({ conversation: payload.conversation as any, setState: args.setState });
                } else if (evName === "message.created" && payload?.message) {
                  const m = payload.message as any;
                  // upsert message directly
                  updateDb((prev) => {
                    const conversations = { ...((prev as any).conversations ?? {}) } as Record<string, Conversation>;
                    const messages = { ...((prev as any).messages ?? {}) } as Record<string, Message>;
                    const mid = String(m.id ?? "");
                    if (!mid) return prev as any;

                    const createdAt = m?.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString();

                    messages[mid] = {
                      id: mid,
                      scenarioId: String(m.scenarioId ?? m.scenario_id ?? sid),
                      conversationId: String(m.conversationId ?? m.conversation_id ?? ""),
                      senderProfileId: String(m.senderProfileId ?? m.sender_profile_id ?? ""),
                      senderUserId:
                        m?.senderUserId != null
                          ? String(m.senderUserId)
                          : m?.sender_user_id != null
                            ? String(m.sender_user_id)
                            : payload?.senderUserId != null
                              ? String((payload as any).senderUserId)
                              : undefined,
                      text: String(m.text ?? ""),
                      imageUrls: Array.isArray(m.imageUrls)
                        ? m.imageUrls.map(String).filter(Boolean)
                        : Array.isArray(m.image_urls)
                          ? m.image_urls.map(String).filter(Boolean)
                          : [],
                      createdAt,
                      updatedAt: m?.updatedAt ? new Date(m.updatedAt).toISOString() : createdAt,
                      editedAt: m?.editedAt ? new Date(m.editedAt).toISOString() : undefined,
                    } as any;

                    const cid = String(messages[mid].conversationId ?? "");
                    const conv = conversations[cid];
                    if (conv && String((conv as any).scenarioId ?? "") === sid) {
                      // If we have an optimistic local "client_*" message for this send,
                      // remove it now to avoid a brief duplicate bubble (optimistic + server echo).
                      try {
                        const serverSender = String(messages[mid].senderProfileId ?? "");
                        const serverText = String(messages[mid].text ?? "").trim();
                        const serverHasImages = (messages[mid] as any)?.imageUrls?.length > 0;

                        const serverMs = Date.parse(String(createdAt));
                        const cutoffMs = Number.isFinite(serverMs) ? serverMs - 2 * 60_000 : Date.now() - 2 * 60_000;

                        const convIdsRaw = (conv as any).messageIds;
                        const convIds = Array.isArray(convIdsRaw) ? convIdsRaw.map(String).filter(Boolean) : [];

                        let optimisticId: string | null = null;
                        // Search recent ids from the end first (newest).
                        for (let i = convIds.length - 1; i >= 0; i--) {
                          const id = convIds[i];
                          if (!id || !id.startsWith("client_")) continue;
                          const om = messages[id] as any;
                          if (!om) continue;
                          if (String(om.scenarioId ?? "") !== sid) continue;
                          if (String(om.conversationId ?? "") !== cid) continue;
                          if (String(om.senderProfileId ?? "") !== serverSender) continue;
                          if (String(om.clientStatus ?? "") !== "sending") continue;

                          const omCreatedAt = String(om.createdAt ?? "");
                          const omMs = Date.parse(omCreatedAt);
                          if (Number.isFinite(omMs) && omMs < cutoffMs) continue;

                          const omText = String(om.text ?? "").trim();
                          const omHasImages = Array.isArray(om.imageUrls) ? om.imageUrls.length > 0 : false;

                          const textMatch = serverText && omText ? serverText === omText : !serverText && !omText;
                          const imageMatch = serverHasImages && omHasImages;

                          // Prefer exact text matches; otherwise allow image-only match.
                          if (textMatch || imageMatch) {
                            optimisticId = id;
                            break;
                          }
                        }

                        // Fallback if conversation has no messageIds index yet.
                        if (!optimisticId) {
                          for (const [id, omAny] of Object.entries(messages)) {
                            if (!id || !id.startsWith("client_")) continue;
                            const om = omAny as any;
                            if (String(om.scenarioId ?? "") !== sid) continue;
                            if (String(om.conversationId ?? "") !== cid) continue;
                            if (String(om.senderProfileId ?? "") !== serverSender) continue;
                            if (String(om.clientStatus ?? "") !== "sending") continue;
                            const omText = String(om.text ?? "").trim();
                            const omHasImages = Array.isArray(om.imageUrls) ? om.imageUrls.length > 0 : false;
                            const textMatch = serverText && omText ? serverText === omText : !serverText && !omText;
                            const imageMatch = serverHasImages && omHasImages;
                            if (textMatch || imageMatch) {
                              optimisticId = id;
                              break;
                            }
                          }
                        }

                        if (optimisticId) {
                          // Preserve the optimistic client id on the server message so the UI can
                          // keep a stable key across the optimistic->server swap.
                          try {
                            (messages[mid] as any).clientMessageId = optimisticId;
                          } catch {}
                          try {
                            delete (messages as any)[optimisticId];
                          } catch {}
                          try {
                            if (Array.isArray((conv as any).messageIds)) {
                              (conv as any).messageIds = (conv as any).messageIds
                                .map(String)
                                .filter(Boolean)
                                .filter((x: string) => x !== optimisticId);
                            }
                          } catch {}
                        }
                      } catch {
                        // ignore dedupe failures
                      }

                      const existingIds = Array.isArray((conv as any).messageIds)
                        ? (conv as any).messageIds.map(String).filter(Boolean)
                        : [];
                      if (!existingIds.includes(mid)) existingIds.push(mid);

                      // Update preview fields for conversation list
                      conversations[cid] = {
                        ...conv,
                        lastMessageAt: createdAt,
                        updatedAt: new Date().toISOString(),
                        lastMessageText: String(m.text ?? ""),
                        lastMessageSenderProfileId: String(m.senderProfileId ?? m.sender_profile_id ?? ""),
                        messageIds: existingIds,
                      } as any;
                    }

                    return { ...(prev as any), conversations, messages } as any;
                  }).catch(() => {});

                  // Notify message event subscribers
                  for (const handler of args.messageEventHandlers) {
                    try {
                      handler(m);
                    } catch {}
                  }

                  // Present a local notification when appropriate:
                  // In backend mode we rely on remote pushes (Expo push) and MUST NOT
                  // also schedule local notifications, otherwise users get duplicates.
                  try {
                    const mid2 = String(m.id ?? "");
                    const convId = String(m.conversationId ?? m.conversation_id ?? "");

                    const tokenLocal = String(args.auth.token ?? "").trim();
                    if (args.env.isBackendMode(tokenLocal)) {
                      // Remote push is responsible for notifications.
                      return;
                    }

                    // IMPORTANT: use a fresh DB snapshot here (not `state.db`), because
                    // `state` can be stale across platforms/timings and cause iOS/Android
                    // to disagree about whether a conversation is currently being viewed.
                    const dbNow = await readDb();

                    const conv = (dbNow as any)?.conversations?.[convId] ?? null;
                    const viewingConvId = getActiveConversation(sid);
                    const profiles = (dbNow as any)?.profiles ?? {};
                    const selectedProfileId = (dbNow as any)?.selectedProfileByScenario?.[sid] ?? null;

                    // If the user is currently viewing this conversation, mark it read
                    // immediately (best-effort). Do not mutate unread counters here; the
                    // inbox screen uses the server unread endpoint.
                    try {
                      if (viewingConvId && String(viewingConvId) === String(convId) && selectedProfileId) {
                        const tokenLocal = String(args.auth.token ?? "").trim();
                        if (tokenLocal) {
                          void apiFetch({
                            path: `/conversations/${encodeURIComponent(convId)}/read`,
                            token: tokenLocal,
                            init: {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ profileId: String(selectedProfileId) }),
                            },
                          }).catch(() => {});
                        }
                      }
                    } catch {}

                    // don't notify for messages missing conversation or when message is from selected profile
                    if (convId && String(m.senderProfileId ?? "") !== String(selectedProfileId ?? "")) {
                      const senderPid = String(m.senderProfileId ?? "");
                      const senderProfile = profiles?.[senderPid] as any;
                      const sendingUserId = String((payload as any)?.senderUserId ?? m?.senderUserId ?? m?.sender_user_id ?? "").trim();

                      // Per-scenario notification prefs (messages/group + ignored profiles)
                      const prefs = getScenarioNotificationPrefsFromDb(dbNow as any, sid) ?? null;
                      const messagesEnabled = prefs?.messagesEnabled ?? true;
                      const groupMessagesEnabled = prefs?.groupMessagesEnabled ?? true;
                      const ignored = new Set<string>((prefs?.ignoredProfileIds ?? []).map(String));

                      // If the sender profile is owned by the current user, skip notification
                      if (String(senderProfile?.ownerUserId ?? "") === String(currentUserId ?? "")) {
                        // skip notifications for messages that originate from profiles owned by current user
                      } else if (
                        sendingUserId &&
                        sendingUserId === String(currentUserId ?? "") &&
                        String(selectedProfileId ?? "") === senderPid
                      ) {
                        // skip notifications when the current user *sent* the message as the sender profile
                      } else {
                        const participantIds: string[] = Array.isArray(conv?.participantProfileIds)
                          ? (conv as any).participantProfileIds.map(String).filter(Boolean)
                          : [];

                        const isGroupChat = participantIds.length > 2;
                        if (!messagesEnabled) {
                          // user muted all messages for this scenario
                          return;
                        }
                        if (isGroupChat && !groupMessagesEnabled) {
                          // user muted group chat messages for this scenario
                          return;
                        }

                        // Only notify for conversations that include at least one profile owned by the current user.
                        const ownedParticipantIds = participantIds.filter(
                          (pid) => String((profiles?.[pid] as any)?.ownerUserId ?? "") === String(currentUserId ?? "")
                        );

                        const ownedUnignored = ownedParticipantIds.filter((pid) => !ignored.has(String(pid)));

                        // If the user is currently viewing this conversation, skip notification.
                        if (viewingConvId && String(viewingConvId) === String(convId)) {
                          // skip notification when conversation is open
                        } else if (ownedUnignored.length > 0) {
                          // Pick the best target profile for navigation (prefer selected profile if it's owned and a participant).
                          const preferred =
                            selectedProfileId && ownedUnignored.includes(String(selectedProfileId))
                              ? String(selectedProfileId)
                              : String(ownedUnignored[0]);

                          const senderName = String(senderProfile?.displayName ?? "").trim();
                          const convTitle = String((conv as any)?.title ?? "").trim();
                          const title = `New DM: ${senderName || "Someone"}${isGroupChat ? (convTitle ? ` — ${convTitle}` : " — Group chat") : ""}`;
                          const bodyText = String(m.text ?? "").trim();
                          const hasImage = Array.isArray((m as any)?.imageUrls) && (m as any).imageUrls.length > 0;
                          const body = bodyText ? (hasImage ? `[Image] ${bodyText}` : bodyText) : hasImage ? "Sent an image" : "";
                          const notif = {
                            id: uuidv4(),
                            title,
                            body: body ? (body.length > 140 ? body.slice(0, 137) + "…" : body) : undefined,
                            scenarioId: sid,
                            conversationId: convId,
                            data: { conversationId: convId, scenarioId: sid, profileId: preferred, messageId: mid2 },
                          } as AppNotification;
                          void presentNotification(notif);
                        }
                      }
                    }
                  } catch (e) {
                    // ignore notification errors
                  }
                } else if (evName === "mention.created" && payload) {
                  try {
                    const tokenLocal = String(args.auth.token ?? "").trim();
                    if (args.env.isBackendMode(tokenLocal)) return;

                    const sid2 = String(payload?.scenarioId ?? sid);
                    const postId = String(payload?.postId ?? "").trim();
                    const authorProfileId = String(payload?.authorProfileId ?? "").trim();
                    const mentionedProfileIds: string[] = Array.isArray(payload?.mentionedProfileIds)
                      ? payload.mentionedProfileIds.map(String).filter(Boolean)
                      : [];

                    if (!sid2 || !postId || mentionedProfileIds.length === 0) return;

                    const dbNow = await readDb();
                    const profiles = (dbNow as any)?.profiles ?? {};
                    const selectedProfileId = String((dbNow as any)?.selectedProfileByScenario?.[sid2] ?? "");

                    // Skip if the mention comes from a profile owned by the current user.
                    const authorOwner = String((profiles?.[authorProfileId] as any)?.ownerUserId ?? "");
                    if (authorOwner && authorOwner === String(currentUserId ?? "")) return;

                    const ownedMentioned = mentionedProfileIds.filter(
                      (pid) => String((profiles?.[pid] as any)?.ownerUserId ?? "") === String(currentUserId ?? "")
                    );

                    const prefs = getScenarioNotificationPrefsFromDb(dbNow as any, sid2) ?? null;
                    const mentionsEnabled = prefs?.mentionsEnabled ?? true;
                    if (!mentionsEnabled) return;

                    const ignored = new Set<string>((prefs?.ignoredProfileIds ?? []).map(String));
                    const ownedUnignored = ownedMentioned.filter((pid) => !ignored.has(String(pid)));
                    if (ownedUnignored.length === 0) return;

                    const targetProfileId =
                      selectedProfileId && ownedUnignored.includes(selectedProfileId)
                        ? selectedProfileId
                        : String(ownedUnignored[0]);

                    const title = String(payload?.title ?? "You were mentioned").trim() || "You were mentioned";
                    const body = String(payload?.body ?? "").trim();

                    const notif = {
                      id: uuidv4(),
                      title,
                      body: body ? (body.length > 140 ? body.slice(0, 137) + "…" : body) : undefined,
                      scenarioId: sid2,
                      data: {
                        scenarioId: sid2,
                        postId,
                        profileId: targetProfileId,
                        kind: "mention",
                        authorProfileId,
                      },
                    } as AppNotification;

                    void presentNotification(notif);
                  } catch {
                    // ignore mention notification errors
                  }
                } else if (evName === "typing" && payload) {
                  // Notify typing subscribers
                  for (const h of args.typingEventHandlers) {
                    try {
                      h(payload as any);
                    } catch {}
                  }
                }
              } catch (e) {
                // ignore
              }
            };
            ws.onclose = () => {
              try {
                args.wsConnectionsRef.current[sid] = null;
              } catch {}
            };

            args.wsConnectionsRef.current[sid] = ws;
          } catch (e) {
            // fallback to polling below
          }
        }
      }

      // Polling fallback removed; rely on WebSocket for realtime updates.
    } catch (e) {
      // ignore failures
    }
  } finally {
    args.conversationsSyncRef.current.inFlightByScenario[sid] = false;
  }
}
