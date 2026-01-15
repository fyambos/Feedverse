import { CreateUserData } from "../auth/authModels";
import { r2Service } from "../config/cloudflare/r2Service";
import { APP_CONFIG } from "../config/constants";
import { pool } from "../config/database";
import { User, UserScenario } from "./userModels";

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const query = "SELECT * FROM users WHERE id = $1 AND is_deleted = false";
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = "SELECT * FROM users WHERE email = $1 AND is_deleted = false";
    const result = await pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async emailExists(email: string): Promise<boolean> {
    const query = "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)";
    const result = await pool.query(query, [email]);
    return result.rows[0].exists;
  }

  async create(
    userData: CreateUserData,
    avatarFile?: Express.Multer.File,
  ): Promise<User> {
    let finalAvatarUrl = userData.avatar_url || APP_CONFIG.EMPTY_STRING;

    if (avatarFile) {
      finalAvatarUrl = await r2Service.uploadAvatar(avatarFile, userData.id);
    }
    const query = `
      INSERT INTO users (id, username, name, email, password_hash, avatar_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const result = await pool.query(query, [
      userData.id,
      userData.username,
      userData.name,
      userData.email,
      userData.password_hash,
      finalAvatarUrl,
      userData.created_at,
      userData.updated_at,
    ]);
    return result.rows[0];
  }

  /*
  async updateLastLogin(email: string, loginDate: Date): Promise<void> {
    const query = "UPDATE users SET last_login = $1 WHERE email = $2";
    await pool.query(query, [loginDate, email]);
  }
  */

  async updateAvatar_url(userId: string, avatar_url: string): Promise<void> {
    const query =
      "UPDATE users SET avatar_url = $1, updated_at = $2 WHERE id = $3";
    await pool.query(query, [avatar_url, new Date(), userId]);
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const query = "SELECT * FROM users WHERE google_id = $1";
    const result = await pool.query(query, [googleId]);
    return result.rows[0] || null;
  }

  async findUserScenarios(userId: string): Promise<UserScenario[]> {
    const query = `
      SELECT
        s.id,
        s.name,
        s.cover,
        s.invite_code,
        s.owner_user_id,
        s.description,
        s.mode,
        s.created_at,
        s.updated_at,
        (s.owner_user_id = $1) as is_owner
      FROM scenarios s
      INNER JOIN scenario_players sp ON s.id = sp.scenario_id
      WHERE sp.user_id = $1
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  async softDelete(userId: string): Promise<boolean> {
    const query = `
      UPDATE users
      SET
        is_deleted = true,
        deleted_at = $2,
        updated_at = $2,
        -- Anonymisation des données personnelles
        email = CONCAT('deleted_', id, '@feedverse.deleted'),
        username = CONCAT('deleted_user_', SUBSTRING(id::text, 1, 8)),
        name = 'Compte supprimé',
        password_hash = NULL,
        settings = '{}'::jsonb
      WHERE id = $1 AND is_deleted = false
      RETURNING id
    `;
    const result = await pool.query(query, [userId, new Date()]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}
