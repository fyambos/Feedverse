import { pool } from "../config/database";
import type { GlobalTagApi, GlobalTagRow } from "./globalTagModels";
import { mapGlobalTagRowToApi } from "./globalTagModels";

async function tableExists(tableName: string): Promise<boolean> {
  const res = await pool.query(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  );
  return Boolean(res.rows?.[0]?.exists);
}

export async function listGlobalTags(args?: { q?: string }): Promise<GlobalTagApi[]> {
  const exists = await tableExists("global_tags");
  if (!exists) return [];

  const q = String(args?.q ?? "").trim();
  const hasQ = q.length > 0;

  const res = await pool.query<GlobalTagRow>(
    hasQ
      ? `
        SELECT key, name, color, created_at, updated_at
        FROM global_tags
        WHERE key ILIKE $1 OR name ILIKE $1
        ORDER BY key
        LIMIT 200
      `
      : `
        SELECT key, name, color, created_at, updated_at
        FROM global_tags
        ORDER BY key
        LIMIT 500
      `,
    hasQ ? [`%${q}%`] : [],
  );

  return (res.rows ?? []).map(mapGlobalTagRowToApi);
}
