import {
  CreateScenarioData,
  ScenarioMode,
  ScenarioPlayer,
  UpdateScenarioData,
} from "../scenarios/scenarioModels";
import { r2Service } from "../config/cloudflare/r2Service";
import { APP_CONFIG } from "../config/constants";
import { pool } from "../config/database";
import { Scenario } from "./scenarioModels";

export class ScenarioRepository {
  async findById(id: string): Promise<Scenario | null> {
    const query = "SELECT * FROM scenarios WHERE Id = $1";
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async IdExists(id: string): Promise<boolean> {
    const query = "SELECT EXISTS(SELECT 1 FROM scenarios WHERE Id = $1)";
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  async create(
    scenarioData: CreateScenarioData,
    coverFile?: Express.Multer.File,
  ): Promise<Scenario> {
    let finalCoverUrl = scenarioData.cover || APP_CONFIG.EMPTY_STRING;

    if (coverFile) {
      finalCoverUrl = await r2Service.uploadScenarioCover(
        coverFile,
        scenarioData.id,
      );
    }

    const query = `
      INSERT INTO scenarios (
        id, name, description, mode, cover, invite_code,
        owner_user_id, gm_user_ids, settings, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await pool.query(query, [
      scenarioData.id,
      scenarioData.name,
      scenarioData.description,
      scenarioData.mode,
      finalCoverUrl,
      scenarioData.invite_code,
      scenarioData.owner_user_id,
      scenarioData.gm_user_ids,
      JSON.stringify(scenarioData.settings),
      scenarioData.created_at,
      scenarioData.updated_at,
    ]);

    return result.rows[0];
  }

  async update(
    scenarioId: string,
    updateData: Partial<UpdateScenarioData>,
    coverFile?: Express.Multer.File,
  ): Promise<Scenario> {
    let finalCoverUrl = updateData.cover;

    if (coverFile) {
      finalCoverUrl = await r2Service.uploadScenarioCover(
        coverFile,
        scenarioId,
      );
    }

    const fieldsToUpdate: string[] = [];
    const values: (string | Date)[] = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      fieldsToUpdate.push(`name = $${paramIndex}`);
      values.push(updateData.name);
      paramIndex++;
    }

    if (updateData.description !== undefined) {
      fieldsToUpdate.push(`description = $${paramIndex}`);
      values.push(updateData.description);
      paramIndex++;
    }

    if (updateData.invite_code !== undefined) {
      fieldsToUpdate.push(`invite_code = $${paramIndex}`);
      values.push(updateData.invite_code);
      paramIndex++;
    }

    if (finalCoverUrl !== undefined) {
      fieldsToUpdate.push(`cover = $${paramIndex}`);
      values.push(finalCoverUrl);
      paramIndex++;
    }

    fieldsToUpdate.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    paramIndex++;

    values.push(scenarioId);

    const query = `
      UPDATE scenarios
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async updateCover(ScenarioId: string, cover: string): Promise<void> {
    const query =
      "UPDATE scenarios SET cover = $1, updated_at = $2 WHERE id = $3";
    await pool.query(query, [cover, new Date(), ScenarioId]);
  }

  async delete(id: string): Promise<boolean> {
    const query = "DELETE FROM scenarios WHERE id = $1 RETURNING id";
    const result = await pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async inviteCodeExists(inviteCode: string): Promise<boolean> {
    const query =
      "SELECT EXISTS(SELECT 1 FROM scenarios WHERE UPPER(invite_code) = UPPER($1))";
    const result = await pool.query(query, [inviteCode]);
    return result.rows[0].exists;
  }

  async addPlayer(scenarioId: string, userId: string): Promise<void> {
    const query = `
      INSERT INTO scenario_players (scenario_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (scenario_id, user_id) DO NOTHING
    `;
    await pool.query(query, [scenarioId, userId]);
  }

  async findPlayersByScenarioId(scenarioId: string): Promise<ScenarioPlayer[]> {
    const query = `
      SELECT
        u.id,
        u.username,
        u.name,
        u.avatar_url,
        (s.owner_user_id = u.id) as is_owner
      FROM users u
      INNER JOIN scenario_players sp ON u.id = sp.user_id
      INNER JOIN scenarios s ON sp.scenario_id = s.id
      WHERE sp.scenario_id = $1 AND u.is_deleted = false
      ORDER BY is_owner DESC, u.username ASC
    `;
    const result = await pool.query(query, [scenarioId]);
    return result.rows;
  }

  async transferOwnership(
    scenarioId: string,
    newOwnerId: string,
    scenarioMode: ScenarioMode,
    currentOwnerId: string,
  ): Promise<Scenario> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const isNewOwnerParticipant = await client.query(
        "SELECT EXISTS(SELECT 1 FROM scenario_players WHERE scenario_id = $1 AND user_id = $2)",
        [scenarioId, newOwnerId],
      );

      if (!isNewOwnerParticipant.rows[0].exists) {
        await client.query(
          "INSERT INTO scenario_players (scenario_id, user_id) VALUES ($1, $2)",
          [scenarioId, newOwnerId],
        );
      }

      let updateQuery = `
        UPDATE scenarios
        SET owner_user_id = $1, updated_at = $2
      `;

      const newDate = APP_CONFIG.NOW;
      const queryParams: string[] = [newOwnerId, newDate.toDateString()];
      let paramIndex = 3;

      if (scenarioMode === "campaign") {
        updateQuery += `, gm_user_ids = array_append(
          array_remove(gm_user_ids, $${paramIndex}),
          $${paramIndex + 1}
        )`;
        queryParams.push(currentOwnerId, newOwnerId);
        paramIndex += 2;
      }

      updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
      queryParams.push(scenarioId);

      const result = await client.query(updateQuery, queryParams);

      await client.query("COMMIT");

      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByInviteCode(inviteCode: string): Promise<Scenario | null> {
    const query =
      "SELECT * FROM scenarios WHERE UPPER(invite_code) = UPPER($1)";
    const result = await pool.query(query, [inviteCode]);
    return result.rows[0] || null;
  }

  async isUserMember(scenarioId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM scenario_players 
        WHERE scenario_id = $1 AND user_id = $2
      )
    `;
    const result = await pool.query(query, [scenarioId, userId]);
    return result.rows[0].exists;
  }
}
