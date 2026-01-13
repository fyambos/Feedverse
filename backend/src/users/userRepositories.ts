import { CreateUserData } from "../auth/authModels";
import { r2Service } from "../config/cloudflare/r2Service";
import { APP_CONFIG } from "../config/constants";
import { pool } from "../config/database";
import { User } from "./userModels";

export class UserRepository {
  async updateUsername(userId: string, username: string): Promise<void> {
    const query = "UPDATE users SET username = $1, updated_at = $2 WHERE id = $3";
    await pool.query(query, [username, new Date(), userId]);
  }
  async getAvatarUrl(userId: string): Promise<string | null> {
    const query = "SELECT avatar_url FROM users WHERE id = $1";
    const result = await pool.query(query, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    const v = row.avatar_url;
    return v == null ? null : String(v);
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const query = "SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1))";
    const result = await pool.query(query, [username]);
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

  async findByIds(ids: string[]): Promise<User[]> {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const query = `SELECT id, username, avatar_url, created_at, updated_at FROM users WHERE id = ANY($1)`;
    const result = await pool.query(query, [ids]);
    return result.rows || [];
  }
}
