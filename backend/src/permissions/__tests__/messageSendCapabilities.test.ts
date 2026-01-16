import { sendMessage, sendMessageWithImages } from "../../messages/messageRepositories";

jest.mock("../../config/database", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

jest.mock("../../config/cloudflare/r2Service", () => ({
  r2Service: {
    uploadMessageImage: jest.fn(async () => "https://example.invalid/message-image.jpg"),
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

      if (q.startsWith("SELECT scenario_id FROM conversations")) {
        return { rows: [{ scenario_id: cfg.scenarioId }], rowCount: 1 };
      }

      // scenarioAccess
      if (q.includes("FROM scenarios s") && q.includes("LEFT JOIN scenario_players")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // participant check
      if (q.includes("FROM conversation_participants") && q.includes("conversation_id = $1") && q.includes("profile_id = $2") && q.includes("SELECT 1")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // userCanActAsSender
      if (q.includes("FROM profiles") && q.includes("WHERE id = $1") && q.includes("AND scenario_id = $2") && q.includes("is_public")) {
        return {
          rows: [
            {
              id: cfg.senderProfileId,
              owner_user_id: cfg.senderOwnerUserId,
              is_public: cfg.senderIsPublic,
              is_private: false,
              scenario_id: cfg.scenarioId,
            },
          ],
          rowCount: 1,
        };
      }

      // send message
      if (q.includes("INSERT INTO messages") && q.includes("RETURNING")) {
        return {
          rows: [
            {
              id: "msg-1",
              scenario_id: cfg.scenarioId,
              conversation_id: cfg.conversationId,
              sender_profile_id: cfg.senderProfileId,
              text: String(params?.[3] ?? "hi"),
              kind: String(params?.[4] ?? "text"),
              image_urls: [],
              created_at: new Date(),
              updated_at: new Date(),
              edited_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      // send with images: UPDATE image_urls
      if (/^\s*UPDATE messages\s+SET\s+image_urls/i.test(q) && q.includes("RETURNING")) {
        return {
          rows: [
            {
              id: params?.[0] ?? "msg-1",
              scenario_id: cfg.scenarioId,
              conversation_id: cfg.conversationId,
              sender_profile_id: cfg.senderProfileId,
              text: "",
              kind: "text",
              image_urls: params?.[1] ?? ["https://example.invalid/message-image.jpg"],
              created_at: new Date(),
              updated_at: new Date(),
              edited_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      // canSee check in sendMessageWithImages
      if (q.includes("FROM conversation_participants") && q.includes("JOIN profiles") && q.includes("p.is_public")) {
        return { rows: [{ "1": 1 }], rowCount: 1 };
      }

      // push helper queries (stop quickly)
      if (q.includes("FROM conversation_participants") && q.includes("JOIN profiles") && q.includes("SELECT p.owner_user_id")) {
        // sender owner only; then removed -> no pushes
        return { rows: [{ owner_user_id: cfg.userId, profile_id: cfg.senderProfileId }], rowCount: 1 };
      }
      if (q.includes("SELECT owner_user_id FROM profiles")) {
        return { rows: [{ owner_user_id: cfg.userId }], rowCount: 1 };
      }
      if (q.includes("SELECT display_name FROM profiles")) {
        return { rows: [{ display_name: "Sender" }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };

  return client;
}

describe("message send capabilities as owned vs public profiles", () => {
  const { pool } = require("../../config/database");

  afterEach(() => {
    jest.clearAllMocks();
  });

  const scenarioId = "sid-1";
  const conversationId = "cid-1";

  async function runSuite(label: string, cfg: Omit<MockClientCfg, "scenarioId" | "conversationId">) {
    it(`${label}: can send a dm`, async () => {
      const client = makeClient({ ...cfg, scenarioId, conversationId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const res = await sendMessage({ conversationId, userId: cfg.userId, senderProfileId: cfg.senderProfileId, text: "hello" });
      expect(res && "message" in res).toBe(true);
      expect(client.query).toHaveBeenCalledWith("COMMIT");
    });

    it(`${label}: can send a dm with pictures`, async () => {
      const client = makeClient({ ...cfg, scenarioId, conversationId });
      (pool.connect as jest.Mock).mockResolvedValue(client);

      const fakeFile = { originalname: "a.jpg", buffer: Buffer.from("x") } as any;
      const res = await sendMessageWithImages({
        conversationId,
        userId: cfg.userId,
        senderProfileId: cfg.senderProfileId,
        text: "",
        files: [fakeFile],
        kind: "text",
      });
      expect(res && "message" in res).toBe(true);
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
