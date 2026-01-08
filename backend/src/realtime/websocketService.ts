import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { pool } from "../config/database";
import { AUTH } from "../config/constants";

type WS = WebSocket & { scenarioId?: string; userId?: string };

const clientsByScenario = new Map<string, Set<WS>>();

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
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit("connection", ws, request as any);
    });
  });

  wss.on("connection", async (ws: WS, req) => {
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
      const scenarioId = url.searchParams.get("scenarioId") ?? undefined;
      if (!scenarioId) {
        console.log("WS rejected: missing scenarioId", {
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        ws.close(1008, "scenarioId required");
        return;
      }

      // Extract token: prefer Authorization header, fallback to ?token= query param
      const authHeader = String(req.headers?.authorization ?? "");
      let token = "";
      if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.replace("Bearer ", "");
      if (!token) token = String(url.searchParams.get("token") ?? "");
      if (!token) {
        console.log("WS rejected: token required", {
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        ws.close(1008, "token required");
        return;
      }

      let payload: any = null;
      try {
        payload = jwt.verify(token, AUTH.SECRET_KEY) as any;
      } catch (e) {
        console.log("WS rejected: invalid token", {
          error: (e && (e as any).message) || String(e),
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        ws.close(1008, "invalid token");
        return;
      }

      const userId = String(payload?.user?.id ?? "").trim();
      if (!userId) {
        console.log("WS rejected: invalid token payload", {
          payload,
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        ws.close(1008, "invalid token payload");
        return;
      }

      const member = await isUserInScenario(scenarioId, userId);
      if (!member) {
        console.log("WS rejected: not a scenario member", {
          userId,
          scenarioId,
          remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null,
          url: req.url,
          headers: req.headers,
        });
        ws.close(1008, "not a scenario member");
        return;
      }

      ws.scenarioId = scenarioId;
      ws.userId = userId;

      // console.log("WS connected", { userId, scenarioId, remoteAddr: (req.socket && (req.socket as any).remoteAddress) || null });

      const set = clientsByScenario.get(scenarioId) ?? new Set<WS>();
      set.add(ws);
      clientsByScenario.set(scenarioId, set);

      ws.on("close", () => {
        const s = clientsByScenario.get(scenarioId);
        if (s) {
          s.delete(ws);
          if (s.size === 0) clientsByScenario.delete(scenarioId);
        }
      });
      // Handle incoming client-sent events (e.g., typing)
      ws.on("message", (data: any) => {
        try {
          const raw = typeof data === "string" ? JSON.parse(data) : data;
          const ev = String(raw?.event ?? "");
          const payload = raw?.payload ?? raw?.data ?? null;
          if (!ev || !payload) return;

          // Only allow a limited set of client-emitted events
          if (ev === "typing") {
            // Attach sender user id for consumers
            try {
              (payload as any).userId = ws.userId;
            } catch {}
            // Broadcast to all clients in this scenario
            broadcastScenarioEvent(scenarioId, "typing", payload);
          }
        } catch (e) {
          // ignore malformed
        }
      });
    } catch (e) {
      try {
        console.error("WS connection error", (e && (e as any).stack) || e);
        ws.close(1011, "server error");
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
