
import { pool } from "../config/database";
import type { ScenarioRow } from "./scenarioModels";

type ColumnInfo = {
  column_name: string;
  data_type: string;
  udt_name: string;
};

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  );
  return Boolean(res.rows?.[0]?.exists);
}

async function getColumns(tableName: string): Promise<ColumnInfo[]> {
  const res = await pool.query<ColumnInfo>(
    `
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    `,
    [tableName],
  );
  return res.rows ?? [];
}



export class ScenarioRepository {
  async listForUser(userId: string): Promise<ScenarioRow[]> {
    const exists = await tableExists("scenarios");
    if (!exists) return [];

    const uid = String(userId ?? "").trim();
    if (!uid) return [];

    const columns = await getColumns("scenarios");
    const byName = new Map(columns.map((c) => [c.column_name, c]));

    const hasOwnerUserId = byName.has("owner_user_id");
    const gmUserIdsCol = byName.get("gm_user_ids");
    const hasGmUserIdsArray = gmUserIdsCol?.data_type === "ARRAY";

    // Membership can be modeled as a join table instead of an array/json column.
    const hasScenarioPlayers = await tableExists("scenario_players");

    // Tags are modeled as global_tags + scenario_tags join table.
    const hasScenarioTags = await tableExists("scenario_tags");
    const hasGlobalTags = await tableExists("global_tags");
    const hasTags = hasScenarioTags && hasGlobalTags;

    const whereParts: string[] = [];
    const params: unknown[] = [uid];

    if (hasOwnerUserId) {
      // Robust across uuid/text owner_user_id types.
      whereParts.push("owner_user_id::text = $1");
    }

    if (hasGmUserIdsArray) {
      // Robust across uuid[]/text[] gm_user_ids types.
      whereParts.push(
        gmUserIdsCol?.udt_name === "_uuid" ? "$1 = ANY(gm_user_ids::text[])" : "$1 = ANY(gm_user_ids)",
      );
    }

    if (hasScenarioPlayers) {
      whereParts.push(
        "EXISTS (SELECT 1 FROM scenario_players sp WHERE sp.scenario_id = scenarios.id AND sp.user_id::text = $1)",
      );
    }

    // Safety: if we can't express per-user filtering, never return all scenarios.
    if (whereParts.length === 0) return [];

    const whereClause = `WHERE (${whereParts.join(" OR ")})`;

    const orderClause = byName.has("updated_at")
      ? "ORDER BY updated_at DESC"
      : byName.has("created_at")
        ? "ORDER BY created_at DESC"
        : "";

    const membersJoin = hasScenarioPlayers
      ? `
        LEFT JOIN LATERAL (
          SELECT array_agg(sp.user_id) AS player_ids
          FROM scenario_players sp
          WHERE sp.scenario_id = scenarios.id
        ) members ON TRUE
      `
      : "";

    const tagsJoin = hasTags
      ? `
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', 't_' || gt.key,
                'key', gt.key,
                'name', gt.name,
                'color', gt.color
              )
              ORDER BY gt.key
            ),
            '[]'::json
          ) AS tags
          FROM scenario_tags st
          JOIN global_tags gt ON gt.key = st.tag_key
          WHERE st.scenario_id = scenarios.id
        ) tag_rows ON TRUE
      `
      : "";

    const selectExtras =
      (hasScenarioPlayers ? ", COALESCE(members.player_ids, '{}'::uuid[]) AS player_ids" : "") +
      (hasTags ? ", COALESCE(tag_rows.tags, '[]'::json) AS tags" : "");

    const sql = `
      SELECT scenarios.*${selectExtras}
      FROM scenarios
      ${membersJoin}
      ${tagsJoin}
      ${whereClause}
      ${orderClause}
      LIMIT 200
    `;

    const res = await pool.query<ScenarioRow>(sql, params);
    return res.rows ?? [];
  }

  async findByInviteCode(inviteCode: string): Promise<ScenarioRow | null> {
    const exists = await tableExists("scenarios");
    if (!exists) return null;

    const code = String(inviteCode ?? "").trim().toUpperCase();
    if (!code) return null;

    const hasScenarioPlayers = await tableExists("scenario_players");
    const hasScenarioTags = await tableExists("scenario_tags");
    const hasGlobalTags = await tableExists("global_tags");
    const hasTags = hasScenarioTags && hasGlobalTags;

    const membersJoin = hasScenarioPlayers
      ? `
        LEFT JOIN LATERAL (
          SELECT array_agg(sp.user_id) AS player_ids
          FROM scenario_players sp
          WHERE sp.scenario_id = scenarios.id
        ) members ON TRUE
      `
      : "";

    const tagsJoin = hasTags
      ? `
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', 't_' || gt.key,
                'key', gt.key,
                'name', gt.name,
                'color', gt.color
              )
              ORDER BY gt.key
            ),
            '[]'::json
          ) AS tags
          FROM scenario_tags st
          JOIN global_tags gt ON gt.key = st.tag_key
          WHERE st.scenario_id = scenarios.id
        ) tag_rows ON TRUE
      `
      : "";

    const selectExtras =
      (hasScenarioPlayers ? ", COALESCE(members.player_ids, '{}'::uuid[]) AS player_ids" : "") +
      (hasTags ? ", COALESCE(tag_rows.tags, '[]'::json) AS tags" : "");

    const sql = `
      SELECT scenarios.*${selectExtras}
      FROM scenarios
      ${membersJoin}
      ${tagsJoin}
      WHERE UPPER(invite_code) = $1
      LIMIT 1
    `;

    const res = await pool.query<ScenarioRow>(sql, [code]);
    return (res.rows?.[0] as ScenarioRow | undefined) ?? null;
  }

  async getById(scenarioId: string): Promise<ScenarioRow | null> {
    const exists = await tableExists("scenarios");
    if (!exists) return null;

    const sid = String(scenarioId ?? "").trim();
    if (!sid) return null;

    const hasScenarioPlayers = await tableExists("scenario_players");
    const hasScenarioTags = await tableExists("scenario_tags");
    const hasGlobalTags = await tableExists("global_tags");
    const hasTags = hasScenarioTags && hasGlobalTags;

    const membersJoin = hasScenarioPlayers
      ? `
        LEFT JOIN LATERAL (
          SELECT array_agg(sp.user_id) AS player_ids
          FROM scenario_players sp
          WHERE sp.scenario_id = scenarios.id
        ) members ON TRUE
      `
      : "";

    const tagsJoin = hasTags
      ? `
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id', 't_' || gt.key,
                'key', gt.key,
                'name', gt.name,
                'color', gt.color
              )
              ORDER BY gt.key
            ),
            '[]'::json
          ) AS tags
          FROM scenario_tags st
          JOIN global_tags gt ON gt.key = st.tag_key
          WHERE st.scenario_id = scenarios.id
        ) tag_rows ON TRUE
      `
      : "";

    const selectExtras =
      (hasScenarioPlayers ? ", COALESCE(members.player_ids, '{}'::uuid[]) AS player_ids" : "") +
      (hasTags ? ", COALESCE(tag_rows.tags, '[]'::json) AS tags" : "");

    const sql = `
      SELECT scenarios.*${selectExtras}
      FROM scenarios
      ${membersJoin}
      ${tagsJoin}
      WHERE scenarios.id = $1
      LIMIT 1
    `;
    const res = await pool.query<ScenarioRow>(sql, [sid]);
    return (res.rows?.[0] as ScenarioRow | undefined) ?? null;
  }

  async createForUser(args: {
    userId: string;
    name: string;
    cover: string;
    inviteCode: string;
    description?: string | null;
    mode: string;
    settings?: unknown;
    gmUserIds?: string[];
    tags?: Array<{ key?: string; name?: string; color?: string; id?: string }>;
  }): Promise<ScenarioRow> {
    const uid = String(args.userId ?? "").trim();
    if (!uid) throw new Error("userId is required");

    const name = String(args.name ?? "").trim();
    const cover = String(args.cover ?? "").trim();
    const inviteCode = String(args.inviteCode ?? "").trim().toUpperCase();
    const mode = String(args.mode ?? "").trim();

    if (!name) throw new Error("name is required");
    if (!inviteCode) throw new Error("inviteCode is required");
    if (!mode) throw new Error("mode is required");

    const gmUserIds = Array.isArray(args.gmUserIds) ? args.gmUserIds.map(String).filter(Boolean) : [];
    const gmDeduped = Array.from(new Set([uid, ...gmUserIds]));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertRes = await client.query<ScenarioRow>(
        `
        INSERT INTO scenarios (
          name,
          cover,
          invite_code,
          owner_user_id,
          description,
          mode,
          gm_user_ids,
          settings
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::uuid[], $8::jsonb
        )
        RETURNING *
        `,
        [
          name,
          cover,
          inviteCode,
          uid,
          args.description ?? null,
          mode,
          gmDeduped,
          args.settings ?? {},
        ],
      );

      const created = insertRes.rows?.[0] as ScenarioRow | undefined;
      if (!created?.id) throw new Error("Scenario create failed");

      // ensure membership
      const hasScenarioPlayers = await tableExists("scenario_players");
      if (hasScenarioPlayers) {
        await client.query(
          `INSERT INTO scenario_players (scenario_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [created.id, uid],
        );
      }

      // tags (optional)
      const hasScenarioTags = await tableExists("scenario_tags");
      const hasGlobalTags = await tableExists("global_tags");
      if (hasScenarioTags && hasGlobalTags) {
        const rawTags = Array.isArray(args.tags) ? args.tags : [];
        const cleaned = rawTags
          .map((t) => {
            const obj = (t ?? {}) as Record<string, unknown>;
            const key = String(obj.key ?? obj.id ?? "").toLowerCase().trim();
            if (!key) return null;
            const name = String(obj.name ?? key).trim();
            const color = String(obj.color ?? "").trim();
            return { key, name, color };
          })
          .filter(Boolean) as Array<{ key: string; name: string; color: string }>;

        const uniq = new Map<string, { key: string; name: string; color: string }>();
        for (const t of cleaned) {
          if (!uniq.has(t.key)) uniq.set(t.key, t);
        }

        for (const t of uniq.values()) {
          await client.query(
            `
            INSERT INTO global_tags (key, name, color)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
            `,
            [t.key, t.name, t.color],
          );
          await client.query(
            `INSERT INTO scenario_tags (scenario_id, tag_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [created.id, t.key],
          );
        }
      }

      await client.query("COMMIT");

      const full = await this.getById(String(created.id));
      if (!full) throw new Error("Scenario create fetch failed");
      return full;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateForOwner(args: {
    scenarioId: string;
    ownerUserId: string;
    patch: Partial<{
      name: string;
      cover: string;
      inviteCode: string;
      description: string | null;
      mode: string;
      settings: unknown;
      gmUserIds: string[];
      tags: Array<{ key?: string; name?: string; color?: string; id?: string }>;
    }>;
  }): Promise<ScenarioRow | null> {
    const sid = String(args.scenarioId ?? "").trim();
    const uid = String(args.ownerUserId ?? "").trim();
    if (!sid || !uid) return null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ownership check
      const owned = await client.query(
        "SELECT 1 FROM scenarios WHERE id = $1 AND owner_user_id::text = $2 LIMIT 1",
        [sid, uid],
      );
      if ((owned.rows?.length ?? 0) === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const setParts: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      const p = args.patch ?? {};

      const addSet = (col: string, val: unknown, cast?: string) => {
        values.push(val);
        const placeholder = `$${idx++}`;
        setParts.push(`${col} = ${cast ? `${placeholder}::${cast}` : placeholder}`);
      };

      if (p.name !== undefined) addSet("name", String(p.name ?? "").trim());
      if (p.cover !== undefined) addSet("cover", String(p.cover ?? "").trim());
      if (p.inviteCode !== undefined) addSet("invite_code", String(p.inviteCode ?? "").trim().toUpperCase());
      if (p.description !== undefined) addSet("description", p.description == null ? null : String(p.description));
      if (p.mode !== undefined) addSet("mode", String(p.mode ?? "").trim());
      if (p.settings !== undefined) addSet("settings", p.settings ?? {}, "jsonb");

      if (p.gmUserIds !== undefined) {
        const gm = Array.isArray(p.gmUserIds) ? p.gmUserIds.map(String).filter(Boolean) : [];
        const gmDeduped = Array.from(new Set([uid, ...gm]));
        addSet("gm_user_ids", gmDeduped, "uuid[]");
      }

      if (setParts.length > 0) {
        // keep updated_at in sync if column exists
        const cols = await getColumns("scenarios");
        const hasUpdatedAt = cols.some((c) => c.column_name === "updated_at");
        if (hasUpdatedAt) setParts.push("updated_at = NOW() AT TIME ZONE 'UTC'");

        values.push(sid, uid);
        const sql = `UPDATE scenarios SET ${setParts.join(", ")} WHERE id = $${idx++} AND owner_user_id::text = $${idx++}`;
        await client.query(sql, values);
      }

      // tags replacement (optional)
      const hasScenarioTags = await tableExists("scenario_tags");
      const hasGlobalTags = await tableExists("global_tags");
      if (p.tags !== undefined && hasScenarioTags && hasGlobalTags) {
        await client.query(`DELETE FROM scenario_tags WHERE scenario_id = $1`, [sid]);

        const rawTags = Array.isArray(p.tags) ? p.tags : [];
        const cleaned = rawTags
          .map((t) => {
            const obj = (t ?? {}) as Record<string, unknown>;
            const key = String(obj.key ?? obj.id ?? "").toLowerCase().trim();
            if (!key) return null;
            const name = String(obj.name ?? key).trim();
            const color = String(obj.color ?? "").trim();
            return { key, name, color };
          })
          .filter(Boolean) as Array<{ key: string; name: string; color: string }>;

        const uniq = new Map<string, { key: string; name: string; color: string }>();
        for (const t of cleaned) {
          if (!uniq.has(t.key)) uniq.set(t.key, t);
        }

        for (const t of uniq.values()) {
          await client.query(
            `
            INSERT INTO global_tags (key, name, color)
            VALUES ($1, $2, $3)
            ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
            `,
            [t.key, t.name, t.color],
          );
          await client.query(
            `INSERT INTO scenario_tags (scenario_id, tag_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [sid, t.key],
          );
        }
      }

      await client.query("COMMIT");
      return await this.getById(sid);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteForOwner(args: { scenarioId: string; ownerUserId: string }): Promise<boolean> {
    const sid = String(args.scenarioId ?? "").trim();
    const uid = String(args.ownerUserId ?? "").trim();
    if (!sid || !uid) return false;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // ensure owner
      const owned = await client.query(
        "SELECT 1 FROM scenarios WHERE id = $1 AND owner_user_id::text = $2 LIMIT 1",
        [sid, uid],
      );
      if ((owned.rows?.length ?? 0) === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      // best-effort cleanup for join tables
      if (await tableExists("scenario_players")) {
        await client.query("DELETE FROM scenario_players WHERE scenario_id = $1", [sid]);
      }
      if (await tableExists("scenario_tags")) {
        await client.query("DELETE FROM scenario_tags WHERE scenario_id = $1", [sid]);
      }

      const del = await client.query(
        "DELETE FROM scenarios WHERE id = $1 AND owner_user_id::text = $2",
        [sid, uid],
      );

      await client.query("COMMIT");
      return (del.rowCount ?? 0) > 0;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async leaveScenario(args: { scenarioId: string; userId: string }): Promise<{ deleted: boolean }> {
    const sid = String(args.scenarioId ?? "").trim();
    const uid = String(args.userId ?? "").trim();
    if (!sid || !uid) return { deleted: false };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const scenarioRes = await client.query<ScenarioRow>(
        "SELECT id, owner_user_id FROM scenarios WHERE id = $1 LIMIT 1",
        [sid],
      );
      const scenario = scenarioRes.rows?.[0];
      if (!scenario?.id) {
        await client.query("ROLLBACK");
        return { deleted: false };
      }

      const ownerId = String(scenario.owner_user_id ?? "");
      const isOwner = ownerId && ownerId === uid;


      if (!(await tableExists("scenario_players"))) {
        // If there's no membership table, we can't represent leaving.
        await client.query("ROLLBACK");
        return { deleted: false };
      }

      if (isOwner) {
        const cnt = await client.query(
          "SELECT COUNT(*)::int AS n FROM scenario_players WHERE scenario_id = $1",
          [sid],
        );
        const n = Number(cnt.rows?.[0]?.n ?? 0);

        if (n > 1) {
          // owner can't leave while others exist
          await client.query("ROLLBACK");
          throw new Error("Owner must transfer ownership before leaving");
        }

        // owner alone => delete scenario
        await client.query("DELETE FROM scenario_players WHERE scenario_id = $1", [sid]);

        if (await tableExists("scenario_tags")) {
          await client.query("DELETE FROM scenario_tags WHERE scenario_id = $1", [sid]);
        }
        await client.query("DELETE FROM scenarios WHERE id = $1", [sid]);

        await client.query("COMMIT");
        return { deleted: true };
      }

      await client.query(
        "DELETE FROM scenario_players WHERE scenario_id = $1 AND user_id::text = $2",
        [sid, uid],
      );

      // If the schema has gm_user_ids and the user is a GM, leaving should remove them.
      try {
        const cols = await getColumns("scenarios");
        const gmCol = cols.find((c) => c.column_name === "gm_user_ids");
        if (gmCol?.data_type === "ARRAY") {
          const isUuidArray = gmCol.udt_name === "_uuid";
          const coalesceCast = isUuidArray ? "COALESCE(gm_user_ids, '{}'::uuid[])" : "COALESCE(gm_user_ids, '{}'::text[])";
          const elemExpr = isUuidArray ? "$2::uuid" : "$2";
          const gmSql = `
            UPDATE scenarios
            SET gm_user_ids = array_remove(${coalesceCast}, ${elemExpr}),
                updated_at = NOW() AT TIME ZONE 'UTC'
            WHERE id = $1
          `;
          await client.query(gmSql, [sid, uid]);
        } else {
          // no-op
        }
      } catch (e) {
        // best-effort
      }

      // Leaving should also detach any owned profiles in this scenario so:
      // - the user stops receiving scenario-based notifications (mentions/replies/messages)
      // - the profiles can be re-adopted later (if not adopted by someone else and not deleted)
      // NOTE: owner_user_id is nullable (public/unowned profiles).
      try {
        const profilesExists = await tableExists("profiles");
        if (!profilesExists) {
          // no-op
        } else {
          const pcols = await getColumns("profiles");
          const hasScenarioId = pcols.some((c) => c.column_name === "scenario_id");
          const hasOwner = pcols.some((c) => c.column_name === "owner_user_id");
          if (!hasScenarioId || !hasOwner) {
            // no-op
          } else {
            const setParts: string[] = ["owner_user_id = NULL"];
            if (pcols.some((c) => c.column_name === "is_public")) setParts.push("is_public = true");
            if (pcols.some((c) => c.column_name === "is_private")) setParts.push("is_private = false");
            if (pcols.some((c) => c.column_name === "updated_at")) {
              setParts.push("updated_at = NOW() AT TIME ZONE 'UTC'");
            }

            const sql = `
              UPDATE profiles
              SET ${setParts.join(", ")}
              WHERE scenario_id = $1
                AND owner_user_id::text = $2
            `;
            await client.query(sql, [sid, uid]);
          }
        }
      } catch (e) {
        // best-effort; do not block leaving if profile detachment fails
      }

      await client.query("COMMIT");

      return { deleted: false };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async transferOwnership(args: { scenarioId: string; fromUserId: string; toUserId: string }): Promise<ScenarioRow | null> {
    const sid = String(args.scenarioId ?? "").trim();
    const from = String(args.fromUserId ?? "").trim();
    const to = String(args.toUserId ?? "").trim();
    if (!sid || !from || !to) return null;
    if (from === to) return null;

    if (!(await tableExists("scenario_players"))) return null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const owned = await client.query(
        "SELECT 1 FROM scenarios WHERE id = $1 AND owner_user_id::text = $2 LIMIT 1",
        [sid, from],
      );
      if ((owned.rows?.length ?? 0) === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const member = await client.query(
        "SELECT 1 FROM scenario_players WHERE scenario_id = $1 AND user_id::text = $2 LIMIT 1",
        [sid, to],
      );
      if ((member.rows?.length ?? 0) === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        "UPDATE scenarios SET owner_user_id = $1, updated_at = NOW() AT TIME ZONE 'UTC' WHERE id = $2",
        [to, sid],
      );

      // ensure GM list includes new owner if gm_user_ids exists
      const cols = await getColumns("scenarios");
      const gmCol = cols.find((c) => c.column_name === "gm_user_ids");
      if (gmCol?.data_type === "ARRAY") {
        await client.query(
          "UPDATE scenarios SET gm_user_ids = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(gm_user_ids, '{}'::uuid[])) x UNION SELECT $1::uuid)) WHERE id = $2",
          [to, sid],
        );
      }

      await client.query("COMMIT");
      return await this.getById(sid);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async isUserInScenario(args: { scenarioId: string; userId: string }): Promise<boolean> {
    const scenarioId = String(args.scenarioId ?? "").trim();
    const userId = String(args.userId ?? "").trim();
    if (!scenarioId || !userId) return false;

    const hasScenarioPlayers = await tableExists("scenario_players");
    if (!hasScenarioPlayers) return false;

    const res = await pool.query(
      "SELECT 1 FROM scenario_players WHERE scenario_id = $1 AND user_id::text = $2 LIMIT 1",
      [scenarioId, userId],
    );
    return (res.rows?.length ?? 0) > 0;
  }

  async addUserToScenario(args: { scenarioId: string; userId: string }): Promise<void> {
    const scenarioId = String(args.scenarioId ?? "").trim();
    const userId = String(args.userId ?? "").trim();
    if (!scenarioId || !userId) return;

    const hasScenarioPlayers = await tableExists("scenario_players");
    if (!hasScenarioPlayers) return;

    await pool.query(
      `
      INSERT INTO scenario_players (scenario_id, user_id)
      SELECT $1, $2
      WHERE NOT EXISTS (
        SELECT 1 FROM scenario_players WHERE scenario_id = $1 AND user_id::text = $2
      )
      `,
      [scenarioId, userId],
    );
  }

  async updateCover(scenarioId: string, coverUrl: string): Promise<void> {
    const query = "UPDATE scenarios SET cover = $1, updated_at = $2 WHERE id = $3";
    await pool.query(query, [coverUrl, new Date(), scenarioId]);
  }
}
