import path from "path";
import dotenv from "dotenv";

function loadEnvFile(file: string) {
  dotenv.config({ path: path.join(__dirname, "..", "..", file), override: false });
}

/**
 * Loads environment variables with a clear dev/prod separation.
 *
 * Precedence (first match wins because override=false):
 * - backend/.env.<NODE_ENV>.local
 * - backend/.env.<NODE_ENV>
 * - backend/.env.local
 * - backend/.env
 */
export function loadEnv() {
  const env = String(process.env.NODE_ENV ?? "").trim() || "development";

  loadEnvFile(`.env.${env}.local`);
  loadEnvFile(`.env.${env}`);
  loadEnvFile(`.env.local`);
  loadEnvFile(`.env`);
}

export function isTestEnv() {
  return String(process.env.NODE_ENV ?? "").toLowerCase() === "test";
}

export function requireEnv(name: string): string {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
