// app/_debug/printScenariosFromFeeds.ts (or wherever you keep it)

import { MOCK_FEEDS } from "@/mocks/posts";
import { MOCK_PROFILES } from "@/mocks/profiles";
import { MOCK_USERS } from "@/mocks/users";
import AsyncStorage from "@react-native-async-storage/async-storage";


export async function clearAllStorageWithVerify() {
  const before = await AsyncStorage.getAllKeys();
  console.log("🧾 AsyncStorage keys BEFORE clear:", before);

  await AsyncStorage.clear();

  const after = await AsyncStorage.getAllKeys();
  console.log("🧾 AsyncStorage keys AFTER clear:", after);

  console.log(after.length === 0 ? "✅ AsyncStorage cleared" : "⚠️ Still has keys");
}

type AnyPost = Record<string, any>;
/**
 * Pretty-print the entire AsyncStorage content.
 * - Groups keys
 * - JSON-parses values when possible
 * - Prints readable output in console
 */
export async function printAsyncStoragePretty() {
  try {
    const keys = await AsyncStorage.getAllKeys();

    if (!keys.length) {
      console.log("📦 AsyncStorage is empty");
      return;
    }

    const entries = await AsyncStorage.multiGet(keys);

    const parsed: Record<string, any> = {};

    for (const [key, value] of entries) {
      if (value == null) {
        parsed[key] = null;
        continue;
      }

      try {
        parsed[key] = JSON.parse(value);
      } catch {
        parsed[key] = value;
      }
    }

    console.log(
      "📦 AsyncStorage (pretty)\n",
      JSON.stringify(parsed, null, 2)
    );
  } catch (err) {
    console.error("❌ Failed to read AsyncStorage", err);
  }
}
function pickAuthorProfileId(p: AnyPost): string | null {
  const candidates = [
    p.authorProfileId,
    p.profileId,
    p.authorId,
    p.author?.profileId,
    p.author?.id,
    p.profile?.id,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/**
 * Create Scenario[] rows derived from:
 * - scenario ids in MOCK_FEEDS
 * - authors in those posts -> profiles -> ownerUserId
 */
export function buildScenarioTableFromFeeds(): Array<{
  id: string;
  name: string;
  cover: string;
  playerIds: string[];
}> {
  const profileById = Object.fromEntries(
    MOCK_PROFILES.map((p: any) => [String(p.id), p])
  );

  // If you want to sanity check usernames later
  const userById = Object.fromEntries(
    MOCK_USERS.map((u: any) => [String(u.id), u])
  );

  // Optional: pretty names/covers (fallbacks if not provided)
  const FALLBACK_META: Record<string, { name: string; cover: string }> = {
    "demo-kpop": {
      name: "K-pop College AU",
      cover: "https://picsum.photos/600/400?random=1",
    },
    "demo-royalty": {
      name: "Modern Royalty AU",
      cover: "https://picsum.photos/600/400?random=2",
    },
    "demo-mafia": {
      name: "Mafia Heist AU",
      cover: "https://loremflickr.com/800/400/castle",
    },
  };

  return Object.entries(MOCK_FEEDS).map(([scenarioId, posts]) => {
    const usedUsers = new Set<string>();

    for (const post of (posts ?? []) as AnyPost[]) {
      const profileId = pickAuthorProfileId(post);
      if (!profileId) continue;

      const profile = profileById[String(profileId)];
      if (!profile) continue;

      usedUsers.add(String(profile.ownerUserId));
    }

    const meta = FALLBACK_META[String(scenarioId)] ?? {
      name: String(scenarioId),
      cover: `https://picsum.photos/600/400?random=${Math.abs(hashString(String(scenarioId))) % 1000}`,
    };

    return {
      id: String(scenarioId),
      name: meta.name,
      cover: meta.cover,
      playerIds: Array.from(usedUsers),
    };
  });
}

/** Small deterministic hash for stable random cover fallback */
function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
