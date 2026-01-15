import { upsertCharacterSheetForProfile } from "../../characterSheets/characterSheetRepositories";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

type MockClientCfg = {
  userId: string;
  profileId: string;
  scenarioId: string;
  profileOwnerUserId: string;
  scenarioOwnerUserId: string;
  gmUserIds: string[];
};

function makeClient(cfg: MockClientCfg) {
  const client: any = {
    query: jest.fn(async (sql: string, params?: any[]) => {
      const q = String(sql);

      if (/^BEGIN\b/i.test(q) || /^COMMIT\b/i.test(q) || /^ROLLBACK\b/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }

      // getProfileContext
      if (q.includes("FROM profiles p") && q.includes("JOIN scenarios s") && q.includes("profile_owner_user_id")) {
        return {
          rows: [
            {
              scenario_id: cfg.scenarioId,
              profile_owner_user_id: cfg.profileOwnerUserId,
              scenario_owner_user_id: cfg.scenarioOwnerUserId,
              gm_user_ids: cfg.gmUserIds,
            },
          ],
          rowCount: 1,
        };
      }

      // scenarioAccess
      if (q.includes("FROM scenarios s") && q.includes("LEFT JOIN scenario_players")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // seed row
      if (q.startsWith("INSERT INTO character_sheets") && q.includes("ON CONFLICT")) {
        return { rows: [], rowCount: 1 };
      }

      // UPDATE character_sheets ... RETURNING
      if (/^\s*UPDATE character_sheets\s*/i.test(q) && q.includes("RETURNING")) {
        return {
          rows: [
            {
              profile_id: cfg.profileId,
              scenario_id: cfg.scenarioId,
              name: "Hero",
              race: null,
              class: null,
              level: null,
              alignment: null,
              background: null,
              strength: null,
              dexterity: null,
              constitution: null,
              intelligence: null,
              wisdom: null,
              charisma: null,
              hp_current: null,
              hp_max: null,
              hp_temp: null,
              status: null,
              inventory: null,
              equipment: null,
              spells: null,
              abilities: null,
              public_notes: null,
              private_notes: null,
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

describe("character sheet capabilities", () => {
  const { pool } = require("../../config/database");

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("owned profile: can create/update character sheet", async () => {
    const client = makeClient({
      userId: "user-1",
      profileId: "pid-owned",
      scenarioId: "sid-1",
      profileOwnerUserId: "user-1",
      scenarioOwnerUserId: "owner-2",
      gmUserIds: [],
    });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await upsertCharacterSheetForProfile({
      userId: "user-1",
      profileId: "pid-owned",
      patch: { name: "Hero" },
    });

    expect(res && "sheet" in res).toBe(true);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("public non-owned profile: currently cannot edit character sheet (only owner/GM)", async () => {
    const client = makeClient({
      userId: "user-1",
      profileId: "pid-public",
      scenarioId: "sid-1",
      profileOwnerUserId: "other-user",
      scenarioOwnerUserId: "owner-2",
      gmUserIds: [],
    });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await upsertCharacterSheetForProfile({
      userId: "user-1",
      profileId: "pid-public",
      patch: { name: "Hero" },
    });

    expect(res).toEqual({ error: "Not allowed", status: 403 });
  });

  it.todo("campaign mode: once created, character sheet cannot be edited again");
});
