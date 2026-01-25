import { pool } from "./src/config/database";

export default async function globalTeardown() {
  try {
    await pool.end();
  } catch {
    // ignore
  }
}
