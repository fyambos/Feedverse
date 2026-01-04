// mobile/data/db/storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DB_KEY } from "./keys";
import type { DbV5 } from "./schema";

let writeChain: Promise<void> = Promise.resolve();
function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  const run = writeChain.then(op, op);
  // keep chain alive even if op fails
  writeChain = run.then(() => void 0, () => void 0);
  return run;
}

export async function readDb(): Promise<DbV5 | null> {
  const raw = await AsyncStorage.getItem(DB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DbV5;
  } catch {
    return null;
  }
}

export async function writeDb(db: DbV5): Promise<void> {
  await enqueueWrite(async () => {
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(db));
  });
}

export async function updateDb(fn: (prev: DbV5) => DbV5): Promise<DbV5> {
  return enqueueWrite(async () => {
    const prev = await readDb();
    if (!prev) throw new Error("DB not initialized");
    const next = fn(prev);
    await AsyncStorage.setItem(DB_KEY, JSON.stringify(next));
    return next;
  });
}