import { setLikeState } from "../../likes/likeRepositories";
import { toggleRepost } from "../../reposts/repostRepositories";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

jest.mock("../../push/expoPush", () => ({
  sendExpoPush: jest.fn(async () => ({ ok: true })),
}));

jest.mock("../../users/userRepositories", () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    listExpoPushTokensForUserIds: jest.fn(async () => []),
  })),
}));

type MockClientCfg = {
  userId: string;
  scenarioId: string;
  actorProfileId: string;
};

function makeClient(cfg: MockClientCfg) {
  const likeState = new Map<string, boolean>();
  const repostState = new Map<string, boolean>();

  const client: any = {
    query: jest.fn(async (sql: string, params?: any[]) => {
      const q = String(sql);

      if (/^BEGIN\b/i.test(q) || /^COMMIT\b/i.test(q) || /^ROLLBACK\b/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }

      // scenarioAccess
      if (q.includes("FROM scenarios s") && q.includes("LEFT JOIN scenario_players")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // likes/reposts: allow acting as any profile in scenario
      if (q.includes("FROM profiles") && q.includes("WHERE id = $1") && q.includes("AND scenario_id = $2") && q.includes("SELECT 1")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // post scenario check
      if (q.startsWith("SELECT scenario_id FROM posts")) {
        return { rows: [{ scenario_id: cfg.scenarioId }], rowCount: 1 };
      }

      // like existence
      if (q.startsWith("SELECT id FROM likes")) {
        const key = `${params?.[0]}|${params?.[1]}|${params?.[2]}`;
        return likeState.get(key) ? { rows: [{ id: "like-1" }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      // insert like
      if (q.includes("INSERT INTO likes") && q.includes("RETURNING")) {
        const sid = params?.[0];
        const pid = params?.[1];
        const postId = params?.[2];
        const key = `${sid}|${pid}|${postId}`;
        likeState.set(key, true);
        return {
          rows: [{ id: "like-1", scenario_id: sid, profile_id: pid, post_id: postId, created_at: new Date() }],
          rowCount: 1,
        };
      }

      // delete like
      if (q.startsWith("DELETE FROM likes")) {
        const sid = params?.[0];
        const pid = params?.[1];
        const postId = params?.[2];
        const key = `${sid}|${pid}|${postId}`;
        likeState.set(key, false);
        return { rows: [], rowCount: 1 };
      }

      // repost existence
      if (q.startsWith("SELECT id FROM reposts")) {
        const key = `${params?.[0]}|${params?.[1]}`;
        return repostState.get(key) ? { rows: [{ id: key }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      // insert repost
      if (q.includes("INSERT INTO reposts") && q.includes("RETURNING")) {
        const id = params?.[0];
        repostState.set(id, true);
        return {
          rows: [{ id, scenario_id: params?.[1], profile_id: params?.[2], post_id: params?.[3], created_at: new Date() }],
          rowCount: 1,
        };
      }

      // delete repost
      if (q.startsWith("DELETE FROM reposts")) {
        const id = `${params?.[0]}|${params?.[1]}`;
        repostState.set(id, false);
        return { rows: [], rowCount: 1 };
      }

      // post after (for like/repost response + potential push)
      if (q.includes("FROM posts") && q.includes("author_profile_id") && q.includes("WHERE id = $1")) {
        return {
          rows: [
            {
              id: params?.[0] ?? "post-1",
              scenario_id: cfg.scenarioId,
              author_profile_id: cfg.actorProfileId,
              text: "hi",
              image_urls: [],
              reply_count: 0,
              repost_count: 0,
              like_count: 0,
              parent_post_id: null,
              quoted_post_id: null,
              inserted_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              post_type: "rp",
              meta: null,
              is_pinned: false,
              pin_order: null,
              updated_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        };
      }

      // count updates
      if (/^\s*UPDATE posts\s+SET like_count/i.test(q)) return { rows: [], rowCount: 1 };
      if (/^\s*UPDATE posts\s+SET repost_count/i.test(q)) return { rows: [], rowCount: 1 };

      // push helper profile lookup (exit early via same-owner)
      if (q.includes("FROM profiles") && q.includes("ANY($1::uuid[])")) {
        return {
          rows: [
            { id: cfg.actorProfileId, owner_user_id: cfg.userId, handle: null, display_name: null },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };

  return client;
}

describe("like/repost capabilities as any scenario profile", () => {
  const { pool } = require("../../config/database");

  afterEach(() => {
    jest.clearAllMocks();
  });

  const scenarioId = "sid-1";
  const postId = "post-1";

  async function runSuite(label: string, cfg: Omit<MockClientCfg, "scenarioId">) {
    it(`${label}: can like and unlike`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const liked = await setLikeState({ userId: cfg.userId, scenarioId, profileId: cfg.actorProfileId, postId, ensureLiked: true });
      expect(liked && "liked" in liked).toBe(true);

      const unliked = await setLikeState({ userId: cfg.userId, scenarioId, profileId: cfg.actorProfileId, postId, ensureLiked: false });
      expect(unliked && "liked" in unliked).toBe(true);
    });

    it(`${label}: can repost and unrepost`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const r1 = await toggleRepost({ userId: cfg.userId, scenarioId, profileId: cfg.actorProfileId, postId });
      expect(r1 && "reposted" in r1).toBe(true);

      const r2 = await toggleRepost({ userId: cfg.userId, scenarioId, profileId: cfg.actorProfileId, postId });
      expect(r2 && "reposted" in r2).toBe(true);
    });
  }

  runSuite("owned profile", { userId: "user-1", actorProfileId: "pid-owned" });
  runSuite("public non-owned profile", { userId: "user-1", actorProfileId: "pid-public" });
});
