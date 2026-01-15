import { updateProfile } from "../../profiles/profileRepositories";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

type MockClientCfg = {
  userId: string;
  scenarioId: string;
  profileId: string;
  profileOwnerUserId: string | null;
  profileIsPublic: boolean;
};

function makeClient(cfg: MockClientCfg) {
  const client: any = {
    query: jest.fn(async (sql: string, params?: any[]) => {
      const q = String(sql);

      if (/^BEGIN\b/i.test(q) || /^COMMIT\b/i.test(q) || /^ROLLBACK\b/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }

      // existing profile lookup
      if (q.includes("FROM profiles") && q.includes("WHERE id = $1") && q.includes("display_name") && q.includes("owner_user_id")) {
        return {
          rows: [
            {
              id: cfg.profileId,
              scenario_id: cfg.scenarioId,
              owner_user_id: cfg.profileOwnerUserId,
              display_name: "Old",
              handle: "old",
              avatar_url: null,
              header_url: null,
              bio: null,
              is_public: cfg.profileIsPublic,
              is_private: false,
              joined_date: null,
              location: null,
              link: null,
              follower_count: 0,
              following_count: 0,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
          rowCount: 1,
        };
      }

      // handleTaken check
      if (q.includes("SELECT 1") && q.includes("FROM profiles") && q.includes("handle") && q.includes("scenario_id")) {
        return { rows: [], rowCount: 0 };
      }

      // UPDATE profiles RETURNING
      if (/^\s*UPDATE profiles\s*/i.test(q) && q.includes("RETURNING")) {
        return {
          rows: [
            {
              id: cfg.profileId,
              scenario_id: cfg.scenarioId,
              owner_user_id: cfg.profileOwnerUserId,
              display_name: "New",
              handle: "new",
              avatar_url: null,
              header_url: null,
              bio: null,
              is_public: cfg.profileIsPublic,
              is_private: false,
              joined_date: null,
              location: null,
              link: null,
              follower_count: 0,
              following_count: 0,
              created_at: new Date(),
              updated_at: new Date(),
            },
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

describe("profile edit capabilities as owned vs public profiles", () => {
  const { pool } = require("../../config/database");

  afterEach(() => {
    jest.clearAllMocks();
  });

  const scenarioId = "sid-1";

  async function runSuite(label: string, cfg: Omit<MockClientCfg, "scenarioId">) {
    it(`${label}: can edit profile if owned or public`, async () => {
      const client = makeClient({ ...cfg, scenarioId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await updateProfile({
        profileId: cfg.profileId,
        userId: cfg.userId,
        patch: { displayName: "New", handle: "new" },
      });

      expect(res && "profile" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });
  }

  runSuite("owned profile", {
    userId: "user-1",
    profileId: "pid-owned",
    profileOwnerUserId: "user-1",
    profileIsPublic: false,
  });

  runSuite("public non-owned profile", {
    userId: "user-1",
    profileId: "pid-public",
    profileOwnerUserId: "other-user",
    profileIsPublic: true,
  });
});
