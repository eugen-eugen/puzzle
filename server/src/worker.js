import { DurableObject } from "cloudflare:workers";
import {
  applyConfig,
  applyFullState,
  applyMove,
  createInitState,
  createPuzzleSession,
} from "./shared/puzzle-session.js";

const EMPTY_ROOM_LIST = {
  rooms: [],
  count: 0,
};

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: {
      ...getCorsHeaders(request),
      ...(init.headers || {}),
    },
  });
}

function optionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

function createRoomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function parseJsonMessage(data) {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data));
  }
  if (ArrayBuffer.isView(data)) {
    return JSON.parse(new TextDecoder().decode(data.buffer));
  }
  return null;
}

function send(ws, type, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, payload }));
}

function broadcast(sockets, type, payload, except = null) {
  for (const ws of sockets) {
    if (ws === except) continue;
    send(ws, type, payload);
  }
}

function withCorsHeaders(request, response) {
  const headers = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(request);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function initRoom(env, roomId, requestBody = {}) {
  const stub = env.PUZZLE_ROOM.getByName(roomId);
  await stub.fetch(
    new Request(`https://room.internal/init/${roomId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );
  return roomId;
}

async function getRoomResponse(env, roomId, request) {
  const stub = env.PUZZLE_ROOM.getByName(roomId);
  const response = await stub.fetch(request);
  return withCorsHeaders(request, response);
}

export class PuzzleRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.session = createPuzzleSession();
    this.initialized = false;

    this.ctx.blockConcurrencyWhile(async () => {
      const [session, initialized] = await Promise.all([
        this.ctx.storage.get("session"),
        this.ctx.storage.get("initialized"),
      ]);

      if (session) this.session = session;
      this.initialized = initialized === true;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/init/") && request.method === "POST") {
      const options = await request.json().catch(() => ({}));
      this.session = createPuzzleSession(options);
      this.initialized = true;
      await this.persistState();
      return Response.json({ ok: true });
    }

    if (!this.initialized) {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const roomId = url.pathname.split("/").pop();
      return this.handleWebSocket(roomId);
    }

    const roomId = url.pathname.split("/").pop();
    return Response.json({
      roomId,
      playerCount: this.getConnectedSockets().length,
      config: this.session.config,
    });
  }

  getConnectedSockets() {
    return this.ctx
      .getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN);
  }

  async persistState() {
    await this.ctx.storage.put("session", this.session);
    await this.ctx.storage.put("initialized", this.initialized);
  }

  handleWebSocket(roomId) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const clientId = crypto.randomUUID();

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ clientId });

    const playerCount = this.getConnectedSockets().length;
    send(
      server,
      "init_state",
      createInitState(this.session, roomId, playerCount),
    );
    broadcast(
      this.getConnectedSockets(),
      "player_count",
      { count: playerCount },
      server,
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws, message) {
    let envelope;

    try {
      envelope = parseJsonMessage(message);
    } catch {
      return;
    }

    if (!envelope || typeof envelope !== "object") return;

    const type = envelope.type;
    const data = envelope.data || {};
    const attachment = ws.deserializeAttachment() || {};

    if (type === "move") {
      applyMove(this.session, data.pieces);
      await this.persistState();
      broadcast(
        this.getConnectedSockets(),
        "state_update",
        {
          pieces: data.pieces || [],
          fromClient: attachment.clientId || null,
        },
        ws,
      );
      return;
    }

    if (type === "full_state") {
      applyFullState(this.session, data.pieces || []);
      await this.persistState();
      return;
    }

    if (type === "config") {
      applyConfig(this.session, data);
      await this.persistState();
      broadcast(
        this.getConnectedSockets(),
        "config_update",
        this.session.config,
      );
    }
  }

  async webSocketClose(ws, code, reason) {
    const remainingSockets = this.getConnectedSockets().filter(
      (socket) => socket !== ws,
    );
    broadcast(remainingSockets, "player_count", {
      count: remainingSockets.length,
    });
    ws.close(code, reason);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return optionsResponse(request);
    }

    if (url.pathname === "/health") {
      return jsonResponse(request, { ok: true, runtime: "worker" });
    }

    if (url.pathname === "/api/rooms" && request.method === "GET") {
      return jsonResponse(request, EMPTY_ROOM_LIST);
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const roomId = await initRoom(env, createRoomId(), body);
      return jsonResponse(request, { roomId });
    }

    if (url.pathname === "/api/rooms/new" && request.method === "GET") {
      const roomId = await initRoom(env, createRoomId(), {});
      return jsonResponse(request, { roomId });
    }

    if (url.pathname.startsWith("/api/rooms/")) {
      const roomId = url.pathname.split("/").pop();
      return getRoomResponse(env, roomId, request);
    }

    return jsonResponse(request, { error: "Not found" }, { status: 404 });
  },
};
