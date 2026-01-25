import type { PoolClient } from "pg";
import { pool } from "../config/database";
import type { CharacterSheetApi, CharacterSheetRow } from "./characterSheetModels";
import { mapCharacterSheetRowToApi } from "./characterSheetModels";

async function scenarioAccess(client: PoolClient, scenarioId: string, userId: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM scenarios s
    LEFT JOIN scenario_players sp
      ON sp.scenario_id = s.id
     AND sp.user_id = $2
    WHERE s.id = $1
      AND (
        s.owner_user_id = $2
        OR ($2 = ANY(COALESCE(s.gm_user_ids, '{}'::uuid[])))
        OR sp.user_id IS NOT NULL
      )
    LIMIT 1
  `,
    [scenarioId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function getProfileContext(client: PoolClient, profileId: string) {
  const res = await client.query<{
    scenario_id: string;
    profile_owner_user_id: string;
    scenario_owner_user_id: string;
    gm_user_ids: string[] | null;
  }>(
    `
    SELECT
      p.scenario_id,
      p.owner_user_id AS profile_owner_user_id,
      s.owner_user_id AS scenario_owner_user_id,
      s.gm_user_ids
    FROM profiles p
    JOIN scenarios s ON s.id = p.scenario_id
    WHERE p.id = $1
    LIMIT 1
  `,
    [profileId],
  );

  return res.rows[0] ?? null;
}

function isGmOrOwner(ctx: { scenario_owner_user_id: string; gm_user_ids: string[] | null }, userId: string): boolean {
  const uid = String(userId ?? "").trim();
  if (!uid) return false;
  if (String(ctx.scenario_owner_user_id ?? "") === uid) return true;
  const gmIds = Array.isArray(ctx.gm_user_ids) ? ctx.gm_user_ids.map(String) : [];
  return gmIds.includes(uid);
}

export async function listCharacterSheetsForScenario(args: {
  scenarioId: string;
  userId: string;
}): Promise<CharacterSheetApi[] | null> {
  const sid = String(args.scenarioId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!sid || !uid) return null;

  const client = await pool.connect();
  try {
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) return null;

    const res = await client.query<CharacterSheetRow>(
      `
      SELECT
        cs.profile_id,
        p.scenario_id,
        cs.name,
        cs.race,
        cs.class,
        cs.level,
        cs.alignment,
        cs.background,
        cs.strength,
        cs.dexterity,
        cs.constitution,
        cs.intelligence,
        cs.wisdom,
        cs.charisma,
        cs.hp_current,
        cs.hp_max,
        cs.hp_temp,
        cs.status,
        cs.inventory,
        cs.equipment,
        cs.spells,
        cs.abilities,
        cs.public_notes,
        CASE
          WHEN p.owner_user_id = $2
            OR s.owner_user_id = $2
            OR ($2 = ANY(COALESCE(s.gm_user_ids, '{}'::uuid[])))
          THEN cs.private_notes
          ELSE NULL
        END AS private_notes,
        cs.created_at,
        cs.updated_at
      FROM character_sheets cs
      JOIN profiles p ON p.id = cs.profile_id
      JOIN scenarios s ON s.id = p.scenario_id
      WHERE p.scenario_id = $1
      ORDER BY cs.created_at ASC, cs.profile_id ASC
    `,
      [sid, uid],
    );

    return res.rows.map(mapCharacterSheetRowToApi);
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export async function getCharacterSheetForProfile(args: {
  profileId: string;
  userId: string;
}): Promise<CharacterSheetApi | null> {
  const pid = String(args.profileId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const client = await pool.connect();
  try {
    const ctx = await getProfileContext(client, pid);
    if (!ctx) return null;

    const ok = await scenarioAccess(client, String(ctx.scenario_id), uid);
    if (!ok) return null;

    const canViewPrivate = String(ctx.profile_owner_user_id) === uid || isGmOrOwner(ctx, uid);

    const res = await client.query<CharacterSheetRow>(
      `
      SELECT
        cs.profile_id,
        p.scenario_id,
        cs.name,
        cs.race,
        cs.class,
        cs.level,
        cs.alignment,
        cs.background,
        cs.strength,
        cs.dexterity,
        cs.constitution,
        cs.intelligence,
        cs.wisdom,
        cs.charisma,
        cs.hp_current,
        cs.hp_max,
        cs.hp_temp,
        cs.status,
        cs.inventory,
        cs.equipment,
        cs.spells,
        cs.abilities,
        cs.public_notes,
        ${canViewPrivate ? "cs.private_notes" : "NULL"} AS private_notes,
        cs.created_at,
        cs.updated_at
      FROM character_sheets cs
      JOIN profiles p ON p.id = cs.profile_id
      WHERE cs.profile_id = $1
      LIMIT 1
    `,
      [pid],
    );

    const row = res.rows[0];
    return row ? mapCharacterSheetRowToApi(row) : null;
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export async function upsertCharacterSheetForProfile(args: {
  profileId: string;
  userId: string;
  patch: any;
}): Promise<{ sheet: CharacterSheetApi } | { error: string; status: number } | null> {
  const pid = String(args.profileId ?? "").trim();
  const uid = String(args.userId ?? "").trim();
  if (!pid || !uid) return null;

  const patch = args.patch ?? {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ctx = await getProfileContext(client, pid);
    if (!ctx) {
      await client.query("ROLLBACK");
      return { error: "Profile not found", status: 404 };
    }

    const sid = String(ctx.scenario_id);
    const ok = await scenarioAccess(client, sid, uid);
    if (!ok) {
      await client.query("ROLLBACK");
      return null;
    }

    const isProfileOwner = String(ctx.profile_owner_user_id) === uid;
    const isGmOwner = isGmOrOwner(ctx, uid);
    const canEdit = isProfileOwner || isGmOwner;
    const canEditPrivate = isProfileOwner || isGmOwner;

    if (!canEdit) {
      await client.query("ROLLBACK");
      return { error: "Not allowed", status: 403 };
    }

    const stats = (patch?.stats ?? patch?.Stats) ?? {};
    const hp = (patch?.hp ?? patch?.Hp) ?? {};

    const inventory = patch?.inventory;
    const equipment = patch?.equipment;
    const spells = patch?.spells;
    const abilities = patch?.abilities;

    await client.query(
      "INSERT INTO character_sheets (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING",
      [pid],
    );

    const res = await client.query<CharacterSheetRow>(
      `
      UPDATE character_sheets
      SET
        name = COALESCE($2, name),
        race = COALESCE($3, race),
        class = COALESCE($4, class),
        level = COALESCE($5, level),
        alignment = COALESCE($6, alignment),
        background = COALESCE($7, background),

        strength = COALESCE($8, strength),
        dexterity = COALESCE($9, dexterity),
        constitution = COALESCE($10, constitution),
        intelligence = COALESCE($11, intelligence),
        wisdom = COALESCE($12, wisdom),
        charisma = COALESCE($13, charisma),

        hp_current = COALESCE($14, hp_current),
        hp_max = COALESCE($15, hp_max),
        hp_temp = COALESCE($16, hp_temp),

        status = COALESCE($17, status),

        inventory = COALESCE($18::jsonb, inventory),
        equipment = COALESCE($19::jsonb, equipment),
        spells = COALESCE($20::jsonb, spells),
        abilities = COALESCE($21::jsonb, abilities),

        public_notes = COALESCE($22, public_notes),
        private_notes = ${canEditPrivate ? "COALESCE($23, private_notes)" : "private_notes"},

        updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE profile_id = $1
      RETURNING
        profile_id,
        $24::uuid AS scenario_id,
        name,
        race,
        class,
        level,
        alignment,
        background,
        strength,
        dexterity,
        constitution,
        intelligence,
        wisdom,
        charisma,
        hp_current,
        hp_max,
        hp_temp,
        status,
        inventory,
        equipment,
        spells,
        abilities,
        public_notes,
        private_notes,
        created_at,
        updated_at
    `,
      [
        pid,
        patch?.name ?? null,
        patch?.race ?? null,
        patch?.class ?? null,
        patch?.level ?? null,
        patch?.alignment ?? null,
        patch?.background ?? null,

        stats?.strength ?? null,
        stats?.dexterity ?? null,
        stats?.constitution ?? null,
        stats?.intelligence ?? null,
        stats?.wisdom ?? null,
        stats?.charisma ?? null,

        hp?.current ?? null,
        hp?.max ?? null,
        hp?.temp ?? null,

        patch?.status ?? null,

        inventory != null ? JSON.stringify(inventory) : null,
        equipment != null ? JSON.stringify(equipment) : null,
        spells != null ? JSON.stringify(spells) : null,
        abilities != null ? JSON.stringify(abilities) : null,

        patch?.publicNotes ?? patch?.public_notes ?? null,
        patch?.privateNotes ?? patch?.private_notes ?? null,

        sid,
      ],
    );

    const row = res.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { error: "Update failed", status: 400 };
    }

    await client.query("COMMIT");
    return { sheet: mapCharacterSheetRowToApi(row) };
  } catch (e: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("upsertCharacterSheet failed", e);
    return { error: "Update failed", status: 400 };
  } finally {
    client.release();
  }
}
