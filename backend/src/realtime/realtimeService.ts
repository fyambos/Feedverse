import { Response } from "express";

type Subscriber = Response;

const subsByScenario: Map<string, Set<Subscriber>> = new Map();

export function subscribeScenarioEvents(scenarioId: string, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const set = subsByScenario.get(scenarioId) ?? new Set<Subscriber>();
  set.add(res);
  subsByScenario.set(scenarioId, set);

  reqOnClose(res, () => {
    set.delete(res);
    if (set.size === 0) subsByScenario.delete(scenarioId);
  });
}

function reqOnClose(res: Response, cb: () => void) {
  // @ts-ignore - Node/Express types
  res.req?.on?.("close", cb);
}

export function emitScenarioEvent(scenarioId: string, event: string, payload: unknown) {
  const set = subsByScenario.get(scenarioId);
  if (!set || set.size === 0) return;

  const data = JSON.stringify(payload);
  for (const res of Array.from(set)) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      // ignore write errors and remove subscriber
      set.delete(res);
    }
  }

  if (set.size === 0) subsByScenario.delete(scenarioId);
}

export default { subscribeScenarioEvents, emitScenarioEvent };
