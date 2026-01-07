import {
  CreateScenarioData,
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

  async update(ScenarioData: UpdateScenarioData): Promise<void> {
    const query =
      "UPDATE scenarios SET name = $1, description = $2, mode = $3, cover = $4, updated_at = $5 WHERE id = $6";
    await pool.query(query, [
      ScenarioData.id,
      ScenarioData.name,
      ScenarioData.description,
      ScenarioData.mode,
      ScenarioData.cover,
      ScenarioData.updated_at,
    ]);
  }

  async updateCover(ScenarioId: string, cover: string): Promise<void> {
    const query =
      "UPDATE scenarios SET cover = $1, updated_at = $2 WHERE id = $3";
    await pool.query(query, [cover, new Date(), ScenarioId]);
  }

  async delete(id: string): Promise<Scenario | null> {
    const query = "DELETE FROM scenarios WHERE id = $1";
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async inviteCodeExists(inviteCode: string): Promise<boolean> {
    const query =
      "SELECT EXISTS(SELECT 1 FROM scenarios WHERE UPPER(invite_code) = UPPER($1))";
    const result = await pool.query(query, [inviteCode]);
    return result.rows[0].exists;
  }
}
