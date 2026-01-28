import { ScenarioRepository } from "./scenarioRepositories";

const repo = new ScenarioRepository();

export async function ListScenariosService(userId: string) {
  const uid = String(userId ?? "").trim();
  if (!uid) return [];
  return repo.listForUser(uid);
}

export async function JoinScenarioByInviteCodeService(args: { userId: string; inviteCode: string }) {
  const uid = String(args.userId ?? "").trim();
  const code = String(args.inviteCode ?? "").trim().toUpperCase();
  if (!uid || !code) return null;

  const scenario = await repo.findByInviteCode(code);
  if (!scenario) return null;

  const scenarioId = String(scenario.id ?? "").trim();
  if (!scenarioId) return null;

  const alreadyIn = await repo.isUserInScenario({ scenarioId, userId: uid });
  if (!alreadyIn) {
    await repo.addUserToScenario({ scenarioId, userId: uid });
  }

  // Re-fetch so player_ids is up to date.
  const fresh = await repo.findByInviteCode(code);
  return { scenario: fresh ?? scenario, alreadyIn };
}

export async function CreateScenarioService(args: {
  userId: string;
  name: string;
  cover: string;
  inviteCode: string;
  description?: string | null;
  mode: string;
  settings?: unknown;
  allowPlayersReorderMessages?: boolean;
  gmUserIds?: string[];
  tags?: Array<{ key?: string; name?: string; color?: string; id?: string }>;
}) {
  const uid = String(args.userId ?? "").trim();
  if (!uid) return null;
  return repo.createForUser({
    userId: uid,
    name: args.name,
    cover: args.cover,
    inviteCode: args.inviteCode,
    description: args.description,
    mode: args.mode,
    settings: args.settings,
    allowPlayersReorderMessages: Boolean(args.allowPlayersReorderMessages ?? true),
    gmUserIds: args.gmUserIds,
    tags: args.tags,
  });
}

export async function UpdateScenarioService(args: {
  userId: string;
  scenarioId: string;
  patch: Partial<{
    name: string;
    cover: string;
    inviteCode: string;
    description: string | null;
    mode: string;
    settings: unknown;
    allowPlayersReorderMessages: boolean;
    gmUserIds: string[];
    tags: Array<{ key?: string; name?: string; color?: string; id?: string }>;
  }>;
}) {
  const uid = String(args.userId ?? "").trim();
  const sid = String(args.scenarioId ?? "").trim();
  if (!uid || !sid) return null;
  return repo.updateForOwner({ scenarioId: sid, ownerUserId: uid, patch: args.patch });
}

export async function DeleteScenarioService(args: { userId: string; scenarioId: string }) {
  const uid = String(args.userId ?? "").trim();
  const sid = String(args.scenarioId ?? "").trim();
  if (!uid || !sid) return false;
  return repo.deleteForOwner({ scenarioId: sid, ownerUserId: uid });
}

export async function LeaveScenarioService(args: { userId: string; scenarioId: string }) {
  const uid = String(args.userId ?? "").trim();
  const sid = String(args.scenarioId ?? "").trim();
  if (!uid || !sid) return { deleted: false };
  return repo.leaveScenario({ scenarioId: sid, userId: uid });
}

export async function TransferScenarioOwnershipService(args: { userId: string; scenarioId: string; toUserId: string }) {
  const uid = String(args.userId ?? "").trim();
  const sid = String(args.scenarioId ?? "").trim();
  const to = String(args.toUserId ?? "").trim();
  if (!uid || !sid || !to) return null;
  return repo.transferOwnership({ scenarioId: sid, fromUserId: uid, toUserId: to });
}
