import path from "path";
import fs from "fs";
import dotenv from "dotenv";

function candidateEnvDirs(): string[] {
  const dirs = new Set<string>();

  // 1) Most reliable: where the process was started from.
  dirs.add(process.cwd());

  // 2) If started from repo root, backend envs live in ./backend
  dirs.add(path.join(process.cwd(), "backend"));

  // 3) Relative to this file (works in src and in dist, depending on build output).
  dirs.add(path.resolve(__dirname, "..", ".."));
  dirs.add(path.resolve(__dirname, "..", "..", "..", ".."));

  return Array.from(dirs);
}

function loadEnvFile(file: string) {
  const dirs = candidateEnvDirs();
  for (const dir of dirs) {
    const fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) continue;

    const parsed = dotenv.parse(fs.readFileSync(fullPath));
    for (const [key, value] of Object.entries(parsed)) {
      const current = process.env[key];
      const currentIsMissing = current == null || String(current).trim() === "";
      const newIsMissing = String(value).trim() === "";

      // Apply the first *non-empty* value we find across all files.
      // This prevents `JWT_SECRET=` (empty) in a higher-precedence file from
      // blocking a valid secret present in a fallback file.
      if (currentIsMissing && !newIsMissing) {
        process.env[key] = value;
      }
    }
  }
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
