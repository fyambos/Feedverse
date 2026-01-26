// Non-reactive tracker for which conversation is currently being viewed.
// Using a module-level map avoids React state update loops and stays
// consistent across iOS/Android timings.
const activeConversationByScenario: Record<string, string | null> = {};

export function setActiveConversation(scenarioId: string, conversationId: string | null) {
  const sid = String(scenarioId ?? "").trim();
  if (!sid) return;
  activeConversationByScenario[sid] = conversationId == null ? null : String(conversationId).trim();
}

export function getActiveConversation(scenarioId: string): string | null {
  const sid = String(scenarioId ?? "").trim();
  if (!sid) return null;
  return activeConversationByScenario[sid] ?? null;
}
