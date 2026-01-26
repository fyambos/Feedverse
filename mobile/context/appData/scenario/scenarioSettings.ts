import type { Dispatch, SetStateAction } from "react";
import { updateDb } from "@/data/db/storage";

type Deps = {
  getDb: () => any;
  setState: Dispatch<SetStateAction<any>>;
};

export function createScenarioSettingsApi(deps: Deps) {
  const getScenarioSettings = (scenarioId: string): any => {
    const db = deps.getDb();
    if (!db) return {};
    const sid = String(scenarioId ?? "").trim();
    return (db.scenarios?.[sid] as any)?.settings ?? {};
  };

  const updateScenarioSettings = async (scenarioId: string, patch: any): Promise<void> => {
    const sid = String(scenarioId ?? "").trim();
    if (!sid) return;

    const nextDb = await updateDb((prev) => {
      const current = prev.scenarios?.[sid];
      if (!current) return prev;

      const prevSettings = ((current as any).settings ?? {}) as Record<string, any>;
      const nextSettings = { ...prevSettings, ...(patch ?? {}) };

      const now = new Date().toISOString();

      return {
        ...prev,
        scenarios: {
          ...prev.scenarios,
          [sid]: {
            ...current,
            settings: nextSettings,
            updatedAt: now,
          } as any,
        },
      };
    });

    deps.setState({ isReady: true, db: nextDb as any });
  };

  return { getScenarioSettings, updateScenarioSettings };
}
