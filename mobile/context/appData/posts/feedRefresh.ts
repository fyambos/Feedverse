// One-shot "refresh home feed" flag by scenario.
const feedRefreshNeededByScenario: Record<string, boolean> = {};

export function markScenarioFeedRefreshNeeded(scenarioId: string) {
  const sid = String(scenarioId ?? "").trim();
  if (!sid) return;
  feedRefreshNeededByScenario[sid] = true;
}

export function consumeScenarioFeedRefreshNeeded(scenarioId: string): boolean {
  const sid = String(scenarioId ?? "").trim();
  if (!sid) return false;
  const needed = Boolean(feedRefreshNeededByScenario[sid]);
  if (needed) feedRefreshNeededByScenario[sid] = false;
  return needed;
}
