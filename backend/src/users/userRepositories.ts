import { CreateUserData } from "../auth/authModels";
import { r2Service } from "../config/cloudflare/r2Service";
import { APP_CONFIG } from "../config/constants";
import { pool } from "../config/database";
import { User } from "./userModels";

export class UserRepository {
  async findById(userId: string): Promise<User | null> {
    const query = "SELECT id, username, name, email, avatar_url, settings, created_at, updated_at FROM users WHERE id = $1";
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

  async findAuthById(userId: string): Promise<(User & { password_hash: string }) | null> {
    const query = "SELECT * FROM users WHERE id = $1";
    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  }

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

  async updatePasswordHash(userId: string, passwordHash: string): Promise<number> {
    const uid = String(userId ?? "").trim();
    const hash = String(passwordHash ?? "").trim();
    if (!uid || !hash) return 0;
    const q = "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2";
    const res = await pool.query(q, [hash, uid]);
    return Number(res.rowCount ?? 0);
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

  async upsertExpoPushToken(args: { userId: string; expoPushToken: string; platform?: string | null }): Promise<void> {
    const userId = String(args.userId ?? "").trim();
    const token = String(args.expoPushToken ?? "").trim();
    const platform = args.platform == null ? null : String(args.platform).trim() || null;
    if (!userId || !token) return;

    const q = `
      INSERT INTO user_push_tokens (user_id, expo_push_token, platform, created_at, updated_at)
      VALUES ($1, $2, $3, now(), now())
      ON CONFLICT (user_id, expo_push_token)
      DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()
    `;

    await pool.query(q, [userId, token, platform]);
  }

  async listExpoPushTokensForUserIds(userIds: string[]): Promise<Array<{ user_id: string; expo_push_token: string; platform: string | null }>> {
    const ids = Array.isArray(userIds) ? userIds.map((s) => String(s).trim()).filter(Boolean) : [];
    if (ids.length === 0) return [];

    const q = `SELECT user_id, expo_push_token, platform FROM user_push_tokens WHERE user_id = ANY($1)`;
    const res = await pool.query(q, [ids]);
    return res.rows || [];
  }

  async deleteExpoPushToken(args: { userId: string; expoPushToken: string }): Promise<number> {
    const userId = String(args.userId ?? "").trim();
    const token = String(args.expoPushToken ?? "").trim();
    if (!userId || !token) return 0;

    const q = `DELETE FROM user_push_tokens WHERE user_id = $1 AND expo_push_token = $2`;
    const res = await pool.query(q, [userId, token]);
    return Number(res.rowCount ?? 0);
  }

  async deleteAllExpoPushTokensForUser(args: { userId: string }): Promise<number> {
    const userId = String(args.userId ?? "").trim();
    if (!userId) return 0;

    const q = `DELETE FROM user_push_tokens WHERE user_id = $1`;
    const res = await pool.query(q, [userId]);
    return Number(res.rowCount ?? 0);
  }
}
