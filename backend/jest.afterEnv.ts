import { pool } from "./src/config/database";

// Each test file runs in its own Jest runtime. Closing the pg pool
// after each file prevents worker processes from hanging.
afterAll(async () => {
  try {
    await pool.end();
  } catch {
    // ignore
  }
});
