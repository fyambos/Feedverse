import AsyncStorage from "@react-native-async-storage/async-storage";
import { DB_KEY } from "./keys";
import type { DbV1 } from "./schema";

export async function readDb(): Promise<DbV1 | null> {
  const raw = await AsyncStorage.getItem(DB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DbV1;
  } catch {
    return null;
  }
}

export async function writeDb(db: DbV1): Promise<void> {
  await AsyncStorage.setItem(DB_KEY, JSON.stringify(db));
}

export async function updateDb(fn: (prev: DbV1) => DbV1): Promise<DbV1> {
  const prev = await readDb();
  if (!prev) throw new Error("DB not initialized");
  const next = fn(prev);
  await writeDb(next);
  return next;
}