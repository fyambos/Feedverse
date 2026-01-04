// mobile/data/db/storage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InteractionManager } from "react-native";
import { DB_KEY } from "./keys";
import type { DbV5 } from "./schema";

let writeChain: Promise<void> = Promise.resolve();
function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  const run = writeChain.then(op, op);
  // keep chain alive even if op fails
  writeChain = run.then(() => void 0, () => void 0);
  return run;
}

let cachedDb: DbV5 | null = null;
let cacheLoaded = false;

let flushTimer: any = null;
let flushInFlight: Promise<void> | null = null;

function scheduleFlush() {
  if (!cacheLoaded || !cachedDb) return;

  if (flushTimer) clearTimeout(flushTimer);

  // Debounce so bursts of edits only persist once.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const snapshot = cachedDb;
    if (!snapshot) return;

    flushInFlight = enqueueWrite(async () => {
      // Avoid blocking animations / user interaction.
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      await AsyncStorage.setItem(DB_KEY, JSON.stringify(snapshot));
    }).finally(() => {
      flushInFlight = null;
    });
  }, 800);
}

export async function readDb(): Promise<DbV5 | null> {
  if (cacheLoaded) return cachedDb;

  const raw = await AsyncStorage.getItem(DB_KEY);
  cacheLoaded = true;

  if (!raw) {
    cachedDb = null;
    return null;
  }

  try {
    cachedDb = JSON.parse(raw) as DbV5;
    return cachedDb;
  } catch {
    cachedDb = null;
    return null;
  }
}

export async function writeDb(db: DbV5): Promise<void> {
  cachedDb = db;
  cacheLoaded = true;
  scheduleFlush();

  // Keep behavior similar for callers that await writes.
  if (flushInFlight) await flushInFlight;
}

export async function updateDb(fn: (prev: DbV5) => DbV5): Promise<DbV5> {
  // Ensure we have a cache before applying updates.
  if (!cacheLoaded) {
    await readDb();
  }

  const prev = cachedDb;
  if (!prev) throw new Error("DB not initialized");

  const next = fn(prev);
  cachedDb = next;
  cacheLoaded = true;

  scheduleFlush();

  // Return immediately; persistence is deferred.
  return next;
}