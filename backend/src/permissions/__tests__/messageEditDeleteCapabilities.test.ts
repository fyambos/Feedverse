import { updateMessage, deleteMessage } from "../../messages/messageRepositories";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

jest.mock("../../config/cloudflare/r2Service", () => ({
  r2Service: {
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
  conversationId: string;
  senderProfileId: string;
  senderOwnerUserId: string | null;
  senderIsPublic: boolean;
};

function makeClient(cfg: MockClientCfg) {
  const client: any = {
    query: jest.fn(async (sql: string, params?: any[]) => {
      const q = String(sql);

      if (/^BEGIN\b/i.test(q) || /^COMMIT\b/i.test(q) || /^ROLLBACK\b/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }

      // updateMessage/deleteMessage: message context
      if (q.includes("FROM messages") && q.includes("WHERE id = $1") && q.includes("sender_profile_id")) {
        return {
          rows: [
            {
              scenario_id: cfg.scenarioId,
              conversation_id: cfg.conversationId,
              sender_profile_id: cfg.senderProfileId,
              image_urls: ["https://example.invalid/msg.jpg"],
            },
          ],
          rowCount: 1,
        };
      }

      // scenarioAccess (messages repo uses scenarios table, owner/gm only)
      if (q.includes("FROM scenarios") && q.includes("gm_user_ids")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // userOwnsAnyProfileInConversation: allow if any participant is owned OR public
      if (q.includes("FROM conversation_participants") && q.includes("JOIN profiles") && q.includes("p.is_public")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // conversation participant membership check when changing sender
      if (q.includes("FROM conversation_participants") && q.includes("profile_id = $2") && q.includes("SELECT 1")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // userCanActAsSender profile fetch
      if (q.includes("SELECT id, owner_user_id, is_public") && q.includes("FROM profiles") && q.includes("WHERE id = $1") && q.includes("scenario_id = $2")) {
        return {
          rows: [
            {
              id: String(params?.[0] ?? cfg.senderProfileId),
              owner_user_id: cfg.senderOwnerUserId,
              is_public: cfg.senderIsPublic,
              is_private: false,
              scenario_id: cfg.scenarioId,
            },
          ],
          rowCount: 1,
        };
      }

      // updateMessage
      if (/^\s*UPDATE messages\s*/i.test(q) && q.includes("RETURNING")) {
        return {
          rows: [
            {
              id: params?.[0] ?? "msg-1",
              scenario_id: cfg.scenarioId,
              conversation_id: cfg.conversationId,
              sender_profile_id: params?.[2] ?? cfg.senderProfileId,
              text: String(params?.[1] ?? "edited"),
              kind: "text",
              image_urls: [],
              created_at: new Date(),
              updated_at: new Date(),
              edited_at: new Date(),
            },
          ],
          rowCount: 1,
        };
      }

      // deleteMessage
      if (q.startsWith("DELETE FROM messages")) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };

  return client;
}

describe("dm edit/delete capabilities as owned vs public profiles", () => {
  const { pool } = require("../../config/database");

  afterEach(() => {
    jest.clearAllMocks();
  });

  const scenarioId = "sid-1";
  const conversationId = "cid-1";

  async function runSuite(label: string, cfg: Omit<MockClientCfg, "scenarioId" | "conversationId">) {
    it(`${label}: can edit a dm (as sender profile owned or public)`, async () => {
      const client = makeClient({ ...cfg, scenarioId, conversationId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await updateMessage({ messageId: "msg-1", userId: cfg.userId, text: "edited" });
      expect(res && "message" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });

    it(`${label}: can delete a dm (as sender profile owned or public)`, async () => {
      const client = makeClient({ ...cfg, scenarioId, conversationId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await deleteMessage({ messageId: "msg-1", userId: cfg.userId });
      expect(res).toEqual({ ok: true });
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });
  }

  runSuite("owned profile", {
    userId: "user-1",
    senderProfileId: "pid-owned",
    senderOwnerUserId: "user-1",
    senderIsPublic: false,
  });

  runSuite("public non-owned profile", {
    userId: "user-1",
    senderProfileId: "pid-public",
    senderOwnerUserId: "other-user",
    senderIsPublic: true,
  });
});
