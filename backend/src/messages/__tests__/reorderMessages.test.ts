import { reorderMessagesInConversation } from "../messageRepositories";
import { pool } from "../../config/database";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

describe("messages: reorder", () => {
  const makeMockClient = (opts: { isOwnerOrGm: boolean; ownsAnyProfile: boolean; hasAllMessages: boolean }) => {
    const client: any = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (/^BEGIN/.test(sql) || /^COMMIT/.test(sql) || /^ROLLBACK/.test(sql)) return { rows: [], rowCount: 0 };

        // getConversationScenarioId
        if (sql.includes("SELECT scenario_id FROM conversations")) {
          return { rows: [{ scenario_id: "sid-1" }], rowCount: 1 };
        }

        // scenarioAccess
        if (sql.includes("FROM scenarios s") && sql.includes("LEFT JOIN scenario_players")) {
          return { rows: [{ "1": 1 }], rowCount: 1 };
        }

        // isScenarioOwnerOrGm
        if (sql.includes("FROM scenarios") && sql.includes("owner_user_id") && sql.includes("gm_user_ids")) {
          return { rows: opts.isOwnerOrGm ? [{ "1": 1 }] : [], rowCount: opts.isOwnerOrGm ? 1 : 0 };
        }

        // userOwnsAnyProfileInConversationOwned
        if (sql.includes("FROM conversation_participants") && sql.includes("JOIN profiles") && sql.includes("p.owner_user_id = $2") && !sql.includes("p.is_public")) {
          return { rows: opts.ownsAnyProfile ? [{ "1": 1 }] : [], rowCount: opts.ownsAnyProfile ? 1 : 0 };
        }

        // existing messages lookup
        if (sql.includes("FROM messages") && sql.includes("conversation_id = $1") && sql.includes("id = ANY")) {
          const ids = Array.isArray(params?.[1]) ? params?.[1] : [];
          const rows = opts.hasAllMessages
            ? ids.map((id: string, i: number) => ({ id, created_at: new Date(1700000000000 + i * 1000).toISOString() }))
            : ids.slice(0, Math.max(0, ids.length - 1)).map((id: string, i: number) => ({ id, created_at: new Date(1700000000000 + i * 1000).toISOString() }));
          return { rows, rowCount: rows.length };
        }

        // update messages
        if (sql.includes("WITH ordered AS") && sql.includes("UPDATE messages")) {
          return { rows: [], rowCount: 1 };
        }

        // update conversations
        if (sql.includes("UPDATE conversations") && sql.includes("last_message_at")) {
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };

    return client;
  };

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("persists reorder when requester is owner/gm", async () => {
    const client = makeMockClient({ isOwnerOrGm: true, ownsAnyProfile: false, hasAllMessages: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await reorderMessagesInConversation({
      conversationId: "cid-1",
      userId: "user-1",
      orderedMessageIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
    });

    expect(res).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("persists reorder when requester owns a participating profile", async () => {
    const client = makeMockClient({ isOwnerOrGm: false, ownsAnyProfile: true, hasAllMessages: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await reorderMessagesInConversation({
      conversationId: "cid-1",
      userId: "user-1",
      orderedMessageIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
    });

    expect(res).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("denies reorder when requester is not owner/gm and owns no participating profile", async () => {
    const client = makeMockClient({ isOwnerOrGm: false, ownsAnyProfile: false, hasAllMessages: true });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await reorderMessagesInConversation({
      conversationId: "cid-1",
      userId: "user-1",
      orderedMessageIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
    });

    expect(res).toEqual({ error: "Not allowed", status: 403 });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("returns 404 when some ids are missing", async () => {
    const client = makeMockClient({ isOwnerOrGm: true, ownsAnyProfile: false, hasAllMessages: false });
    (pool.connect as jest.Mock).mockResolvedValue(client);

    const res = await reorderMessagesInConversation({
      conversationId: "cid-1",
      userId: "user-1",
      orderedMessageIds: ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
    });

    expect(res).toEqual({ error: "One or more messages not found in conversation", status: 404 });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
