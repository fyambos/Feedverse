import { createPostForScenario, deletePost, updatePost, uploadPostImages } from "../../posts/postRepositories";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

jest.mock("../../config/cloudflare/r2Service", () => ({
  r2Service: {
    uploadPostImage: jest.fn(async () => "https://example.invalid/post-image.jpg"),
    deleteByPublicUrl: jest.fn(async () => true),
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

jest.mock("../../realtime/realtimeService", () => ({
  __esModule: true,
  default: { emitScenarioEvent: jest.fn() },
}));

jest.mock("../../realtime/websocketService", () => ({
  __esModule: true,
  default: { broadcastScenarioEvent: jest.fn() },
}));

type MockClientCfg = {
  userId: string;
  scenarioId: string;
  actorProfileId: string;
  actorOwnerUserId: string | null;
  actorIsPublic: boolean;
};

function makeClient(cfg: MockClientCfg) {
  let postCounter = 0;

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

      // userCanActAsAuthor
      if (q.includes("FROM profiles") && q.includes("AND scenario_id = $2") && q.includes("is_public")) {
        return {
          rows: [
            {
              id: cfg.actorProfileId,
              owner_user_id: cfg.actorOwnerUserId,
              is_public: cfg.actorIsPublic,
              scenario_id: cfg.scenarioId,
            },
          ],
          rowCount: 1,
        };
      }

      // validate parent/quote within scenario
      if (q.includes("SELECT 1 FROM posts") && q.includes("AND scenario_id = $2") && q.includes("LIMIT 1")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // create post (upsert)
      if (q.includes("INSERT INTO posts") && q.includes("RETURNING")) {
        postCounter += 1;
        const id = `post-${postCounter}`;
        const author = String(params?.[2] ?? cfg.actorProfileId);
        const text = String(params?.[3] ?? "hello");
        const imageUrls = Array.isArray(params?.[4]) ? params?.[4] : [];
        const parent = params?.[8] ? String(params?.[8]) : null;

        return {
          rows: [
            {
              id,
              scenario_id: cfg.scenarioId,
              author_profile_id: author,
              text,
              image_urls: imageUrls,
              reply_count: 0,
              repost_count: 0,
              like_count: 0,
              parent_post_id: parent,
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

      // update post: load existing
      if (q.startsWith("SELECT scenario_id, author_profile_id FROM posts") && q.includes("WHERE id = $1")) {
        return { rows: [{ scenario_id: cfg.scenarioId, author_profile_id: cfg.actorProfileId }], rowCount: 1 };
      }

      // delete post: load existing
      if (q.startsWith("SELECT scenario_id, author_profile_id, parent_post_id FROM posts") && q.includes("WHERE id = $1")) {
        return { rows: [{ scenario_id: cfg.scenarioId, author_profile_id: cfg.actorProfileId, parent_post_id: null }], rowCount: 1 };
      }

      // delete post: collect images
      if (q.includes("SELECT id, image_urls FROM posts") && q.includes("OR parent_post_id")) {
        return { rows: [{ id: params?.[0] ?? "post-1", image_urls: ["https://example.invalid/a.jpg"] }], rowCount: 1 };
      }

      // update post returning
      if (/^\s*UPDATE posts\s*/i.test(q) && q.includes("RETURNING")) {
        return {
          rows: [
            {
              id: cfg.actorProfileId + "-post",
              scenario_id: cfg.scenarioId,
              author_profile_id: cfg.actorProfileId,
              text: "edited",
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

      // delete post
      if (/^\s*DELETE FROM posts\s+WHERE id = \$1/i.test(q)) {
        return { rows: [], rowCount: 1 };
      }

      // misc updates/deletes we don't assert on
      if (/^\s*UPDATE posts\s+SET reply_count/i.test(q)) return { rows: [], rowCount: 1 };
      if (/^\s*UPDATE posts\s+SET like_count/i.test(q)) return { rows: [], rowCount: 1 };
      if (/^\s*UPDATE posts\s+SET repost_count/i.test(q)) return { rows: [], rowCount: 1 };
      if (/^\s*DELETE FROM likes\b/i.test(q)) return { rows: [], rowCount: 1 };
      if (/^\s*DELETE FROM reposts\b/i.test(q)) return { rows: [], rowCount: 1 };

      // reply push helpers (best-effort; keep it from throwing if it runs)
      if (q.startsWith("SELECT author_profile_id FROM posts")) {
        return { rows: [{ author_profile_id: cfg.actorProfileId }], rowCount: 1 };
      }
      if (q.includes("SELECT parent_post_id FROM posts")) {
        return { rows: [{ parent_post_id: null }], rowCount: 1 };
      }
      if (q.includes("SELECT id, owner_user_id") && q.includes("FROM profiles") && q.includes("ANY($1::uuid[])")) {
        return {
          rows: [
            { id: cfg.actorProfileId, owner_user_id: cfg.actorOwnerUserId, handle: null, display_name: null },
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

describe("post capabilities as owned vs public profiles", () => {
  const { pool } = require("../../config/database");

  afterEach(() => {
    jest.clearAllMocks();
  });

  const scenarioId = "sid-1";

  async function runSuite(label: string, cfg: Omit<MockClientCfg, "scenarioId">) {
    it(`${label}: can create a post`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await createPostForScenario({
        scenarioId,
        userId: cfg.userId,
        input: { authorProfileId: cfg.actorProfileId, text: "hello" },
      });

      expect(res && "post" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });

    it(`${label}: can reply`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await createPostForScenario({
        scenarioId,
        userId: cfg.userId,
        input: { authorProfileId: cfg.actorProfileId, text: "reply", parentPostId: "post-parent" },
      });

      expect(res && "post" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });

    it(`${label}: can edit a post`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await updatePost({ postId: "post-1", userId: cfg.userId, patch: { text: "edited" } });
      expect(res && "post" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });

    it(`${label}: can delete a post`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await deletePost({ postId: "post-1", userId: cfg.userId });
      expect(res).toEqual({ ok: true });
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });

    it(`${label}: can upload post images`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const fakeFile = { originalname: "a.jpg", buffer: Buffer.from("x") } as any;
      const res = await uploadPostImages({ postId: "post-1", userId: cfg.userId, files: [fakeFile] });
      expect(res && "post" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });
  }

  runSuite("owned profile", {
    userId: "user-1",
    actorProfileId: "pid-owned",
    actorOwnerUserId: "user-1",
    actorIsPublic: false,
  });

  runSuite("public non-owned profile", {
    userId: "user-1",
    actorProfileId: "pid-public",
    actorOwnerUserId: "other-user",
    actorIsPublic: true,
  });
});
