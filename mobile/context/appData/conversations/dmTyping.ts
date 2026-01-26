type WsConnectionsRef = {
  current: Record<string, WebSocket | null>;
};

type TypingWsBootstrapRef = {
  current: { lastAttemptAtByScenario: Record<string, number> };
};

type Deps = {
  currentUserId: string;
  wsConnectionsRef: WsConnectionsRef;
  typingWsBootstrapRef: TypingWsBootstrapRef;
  syncConversationsForScenario: (scenarioId: string) => Promise<void>;
};

export function createSendTyping(deps: Deps) {
  return ({
    scenarioId,
    conversationId,
    profileId,
    typing,
  }: {
    scenarioId?: string;
    conversationId?: string;
    profileId?: string;
    typing?: boolean;
  }) => {
    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    try {
      const ws = deps.wsConnectionsRef.current[sid];

      const readyState = ws && (ws as any).readyState != null ? Number((ws as any).readyState) : null;
      const isOpen = readyState === 1;

      if (!ws || !isOpen) {
        const nowMs = Date.now();
        const lastAt = deps.typingWsBootstrapRef.current.lastAttemptAtByScenario[sid] ?? 0;
        if (nowMs - lastAt > 10_000) {
          deps.typingWsBootstrapRef.current.lastAttemptAtByScenario[sid] = nowMs;
          try {
            void deps.syncConversationsForScenario(sid).catch(() => {});
          } catch {}
        }
        return;
      }

      const payload: Record<string, unknown> = {
        scenarioId: sid,
        typing: Boolean(typing),
      };
      if (conversationId) payload.conversationId = String(conversationId);
      if (profileId) payload.profileId = String(profileId);
      const uid = String(deps.currentUserId ?? "").trim();
      if (uid) payload.userId = uid;
      ws.send(JSON.stringify({ event: "typing", payload }));
    } catch {
      // ignore send errors
    }
  };
}
