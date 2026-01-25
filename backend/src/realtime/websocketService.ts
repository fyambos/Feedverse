import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../config/database";
import { AUTH, WEBSOCKET } from "../config/constants";

type WS = WebSocket & {
  scenarioId?: string;
  userId?: string;
  clientIp?: string;
  isAlive?: boolean;
  rate?: { windowStartMs: number; count: number };
};

const clientsByScenario = new Map<string, Set<WS>>();
const clientsByIp = new Map<string, Set<WS>>();
const clientsByUser = new Map<string, Set<WS>>();

function getClientIp(req: any): string {
  const xff = String(req?.headers?.["x-forwarded-for"] ?? "").trim();
  if (xff) {
    // x-forwarded-for can be a comma-separated list.
    return xff.split(",")[0]?.trim() || "unknown";
  }
  return String(req?.socket?.remoteAddress ?? "unknown").trim() || "unknown";
}

function registerClient(ws: WS, scenarioId: string, userId: string, clientIp: string) {
  const byScenario = clientsByScenario.get(scenarioId) ?? new Set<WS>();
  if (byScenario.size >= WEBSOCKET.MAX_CONNECTIONS_PER_SCENARIO) {
    throw new Error("scenario connection limit reached");
  }

  const byIp = clientsByIp.get(clientIp) ?? new Set<WS>();
  if (byIp.size >= WEBSOCKET.MAX_CONNECTIONS_PER_IP) {
    throw new Error("ip connection limit reached");
  }

  const byUser = clientsByUser.get(userId) ?? new Set<WS>();
  if (byUser.size >= WEBSOCKET.MAX_CONNECTIONS_PER_USER) {
    throw new Error("user connection limit reached");
  }

  byScenario.add(ws);
  clientsByScenario.set(scenarioId, byScenario);

  byIp.add(ws);
  clientsByIp.set(clientIp, byIp);

  byUser.add(ws);
  clientsByUser.set(userId, byUser);
}

function unregisterClient(ws: WS) {
  const scenarioId = ws.scenarioId;
  const userId = ws.userId;
  const clientIp = ws.clientIp;

  if (scenarioId) {
    const s = clientsByScenario.get(scenarioId);
    if (s) {
      s.delete(ws);
      if (s.size === 0) clientsByScenario.delete(scenarioId);
    }
  }
  if (clientIp) {
    const s = clientsByIp.get(clientIp);
    if (s) {
      s.delete(ws);
      if (s.size === 0) clientsByIp.delete(clientIp);
    }
  }
  if (userId) {
    const s = clientsByUser.get(userId);
    if (s) {
      s.delete(ws);
      if (s.size === 0) clientsByUser.delete(userId);
    }
  }
}

const inboundTypingSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(128),
    profileId: z.string().trim().min(1).max(128).optional(),
    isTyping: z.boolean().optional(),
  })
  .strip();

const inboundMessageSchema = z
  .object({
    event: z.literal("typing"),
    payload: inboundTypingSchema,
  })
  .strip();

async function isUserInScenario(scenarioId: string, userId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT 1
      FROM scenarios s
      LEFT JOIN scenario_players sp ON sp.scenario_id = s.id AND sp.user_id = $2
      WHERE s.id = $1
        AND (
          s.owner_user_id = $2
          OR ($2 = ANY(COALESCE(s.gm_user_ids, '{}'::uuid[])))
          OR sp.user_id IS NOT NULL
        )
      LIMIT 1
    `,
      [scenarioId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({
    noServer: true,
    // Prevent compressed payload bombs and constrain memory usage.
    perMessageDeflate: false,
    maxPayload: WEBSOCKET.MAX_PAYLOAD_BYTES,
  });

  // Heartbeat to terminate dead connections.
  const interval = setInterval(() => {
    for (const ws of wss.clients as any as Set<WS>) {
      try {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      } catch {
        try {
          ws.terminate();
        } catch {}
      }
    }
  }, WEBSOCKET.HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(interval);
  });

  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit("connection", ws, request as any);
    });
  });

  wss.on("connection", async (ws: WS, req) => {
    try {
      const clientIp = getClientIp(req);

      const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
      const scenarioId = url.searchParams.get("scenarioId") ?? undefined;
      if (!scenarioId) {
        /*
        console.log("WS rejected: missing scenarioId", {
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        */
        ws.close(1008, "scenarioId required");
        return;
      }

      // Extract token: prefer Authorization header, fallback to ?token= query param
      const authHeader = String(req.headers?.authorization ?? "");
      let token = "";
      if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.replace("Bearer ", "");
      if (!token) token = String(url.searchParams.get("token") ?? "");
      if (!token) {
        /*
        console.log("WS rejected: token required", {
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        */
        ws.close(1008, "token required");
        return;
      }

      let payload: any = null;
      try {
        payload = jwt.verify(token, AUTH.SECRET_KEY) as any;
      } catch (e) {
        /*
        console.log("WS rejected: invalid token", {
          error: (e && (e as any).message) || String(e),
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        */
        ws.close(1008, "invalid token");
        return;
      }

      const userId = String(payload?.user?.id ?? "").trim();
      if (!userId) {
        /*
        console.log("WS rejected: invalid token payload", {
          payload,
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        */
        ws.close(1008, "invalid token payload");
        return;
      }

      // Track identity for cleanup and enforcing limits.
      ws.clientIp = clientIp;
      ws.scenarioId = scenarioId;
      ws.userId = userId;
      ws.isAlive = true;
      ws.rate = { windowStartMs: Date.now(), count: 0 };

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      // Apply connection caps early (before DB query).
      try {
        registerClient(ws, scenarioId, userId, clientIp);
      } catch (e: any) {
        ws.close(1013, String(e?.message ?? "connection limit reached"));
        return;
      }

      // Ensure cleanup happens even if we close early later.
      ws.on("close", () => {
        unregisterClient(ws);
      });

      const member = await isUserInScenario(scenarioId, userId);
      if (!member) {
        /*
        console.log("WS rejected: not a scenario member", {
          userId,
          scenarioId,
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        */
        ws.close(1008, "not a scenario member");
        return;
      }
      // Handle incoming client-sent events (e.g., typing)
      ws.on("message", (data: any) => {
        try {
          // Basic per-connection rate limiting.
          const now = Date.now();
          const rate = ws.rate ?? { windowStartMs: now, count: 0 };
          if (now - rate.windowStartMs > 10_000) {
            rate.windowStartMs = now;
            rate.count = 0;
          }
          rate.count += 1;
          ws.rate = rate;
          if (rate.count > WEBSOCKET.MAX_MESSAGES_PER_10S) {
            ws.close(1013, "rate limited");
            return;
          }

          // In `ws`, incoming client messages are commonly Buffer/ArrayBuffer.
          // Normalize to string before JSON parsing.
          let text: string | null = null;
          if (typeof data === "string") {
            text = data;
          } else if (Buffer.isBuffer(data)) {
            text = data.toString("utf8");
          } else if (data instanceof ArrayBuffer) {
            text = Buffer.from(data).toString("utf8");
          } else if (Array.isArray(data) && data.every((x) => Buffer.isBuffer(x))) {
            text = Buffer.concat(data).toString("utf8");
          } else {
            // Unknown message type; ignore
            return;
          }

          const raw = JSON.parse(text);
          const normalized = {
            event: raw?.event,
            payload: raw?.payload ?? raw?.data,
          };

          const parsed = inboundMessageSchema.safeParse(normalized);
          if (!parsed.success) return;

          const safePayload: any = {
            ...parsed.data.payload,
            userId: ws.userId,
          };

          // Broadcast to all clients in this scenario
          broadcastScenarioEvent(scenarioId, parsed.data.event, safePayload);
        } catch (e) {
          // ignore malformed
        }
      });
    } catch (e) {
      try {
        console.error("WS connection error", (e && (e as any).stack) || e);
        ws.close(1011, "server error");
      } catch {}

      try {
        unregisterClient(ws);
      } catch {}
    }
  });
}

export function broadcastScenarioEvent(scenarioId: string, event: string, payload: unknown) {
  const set = clientsByScenario.get(scenarioId);
  if (!set || set.size === 0) return;

  const message = JSON.stringify({ event, payload });
  for (const ws of Array.from(set)) {
    try {
      if (ws.readyState === ws.OPEN) ws.send(message);
    } catch (e) {
      try {
        ws.close();
      } catch {}
      set.delete(ws);
    }
  }
}

export default { attachWebSocketServer, broadcastScenarioEvent };
