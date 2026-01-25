import type { RequestHandler } from "express";
import { HTTP_STATUS } from "../config/constants";
import { ScenarioRepository } from "../scenarios/scenarioRepositories";

export type ScenarioRole = "owner" | "gm" | "member";

function gmUserIdsInclude(gmUserIds: unknown, userId: string): boolean {
  const uid = String(userId ?? "").trim();
  if (!uid) return false;

  if (Array.isArray(gmUserIds)) {
    return gmUserIds.map((v) => String(v).trim()).filter(Boolean).includes(uid);
  }

  if (typeof gmUserIds === "string") {
    const raw = gmUserIds.trim();
    if (!raw) return false;

    // Some DBs/drivers can return arrays as strings; best-effort parse JSON array.
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean).includes(uid);
      }
    } catch {
      // ignore
    }
  }

  return false;
}

export async function getScenarioRole(args: {
  scenarioId: string;
  userId: string;
  repo?: ScenarioRepository;
}): Promise<ScenarioRole | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const repo = args.repo ?? new ScenarioRepository();
  const scenario = await repo.getById(sid);
  if (!scenario) return null;

  const ownerUserId = String((scenario as any)?.owner_user_id ?? "").trim();
  if (ownerUserId && ownerUserId === uid) return "owner";

  const gmUserIds = (scenario as any)?.gm_user_ids;
  if (gmUserIdsInclude(gmUserIds, uid)) return "gm";

  const member = await repo.isUserInScenario({ scenarioId: sid, userId: uid });
  if (member) return "member";

  return null;
}

export function requireScenarioMember(args?: { param?: string }): RequestHandler {
  const param = args?.param ?? "id";

  return async (req, res, next) => {
    const userId = String((req as any).user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String((req as any).params?.[param] ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const role = await getScenarioRole({ scenarioId, userId });
    if (!role) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    (req as any).scenarioRole = role;
    next();
  };
}

export function requireScenarioOwner(args?: { param?: string }): RequestHandler {
  const param = args?.param ?? "id";

  return async (req, res, next) => {
    const userId = String((req as any).user?.id ?? "").trim();
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: "Unauthorized" });

    const scenarioId = String((req as any).params?.[param] ?? "").trim();
    if (!scenarioId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: "scenarioId is required" });

    const role = await getScenarioRole({ scenarioId, userId });
    if (role !== "owner") return res.status(HTTP_STATUS.FORBIDDEN).json({ error: "Not allowed" });

    (req as any).scenarioRole = role;
    next();
  };
}
