import AsyncStorage from "@react-native-async-storage/async-storage";
import { DB_KEY } from "./keys";
import type { DbV3 } from "./schema";

export async function readDb(): Promise<DbV3 | null> {
  const raw = await AsyncStorage.getItem(DB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DbV3;
  } catch {
    return null;
  }
}

export async function writeDb(db: DbV3): Promise<void> {
  await AsyncStorage.setItem(DB_KEY, JSON.stringify(db));
}

export async function updateDb(fn: (prev: DbV3) => DbV3): Promise<DbV3> {
  const prev = await readDb();
  if (!prev) throw new Error("DB not initialized");
  const next = fn(prev);
  await writeDb(next);
  return next;
}