import {
  applyConfig,
  applyFullState,
  applyMove,
  countPlayers,
  createInitState,
  createPuzzleSession,
} from "./shared/puzzle-session.js";

const rooms = new Map();
const DEFAULT_PUBLIC_APP_URL = "https://eugen-eugen.github.io/puzzle/";

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

function buildPublicAppRedirectUrl(requestUrl, publicAppUrl) {
  const target = new URL(publicAppUrl || DEFAULT_PUBLIC_APP_URL);
  const basePath = target.pathname.endsWith("/")
    ? target.pathname
    : `${target.pathname}/`;

  let relativePath = requestUrl.pathname;
  if (relativePath === "/puzzle") {
    relativePath = "";
  } else if (relativePath.startsWith("/puzzle/")) {
    relativePath = relativePath.slice("/puzzle/".length);
  } else if (relativePath.startsWith("/")) {
    relativePath = relativePath.slice(1);
  }

  target.pathname = `${basePath}${relativePath}`;
  target.search = requestUrl.search;

  return target.toString();
}

function getRoom(roomId, options = null) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      session: createPuzzleSession(options || {}),
      clients: new Set(),
    };
    rooms.set(roomId, room);
  }

  if (options) {
    applyConfig(room.session, options);
  }

  return room;
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

function broadcast(room, type, payload, except = null) {
  for (const ws of room.clients) {
    if (ws === except) continue;
    send(ws, type, payload);
  }
}

function attachWebSocket(room, request) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.clientId = crypto.randomUUID();
  room.clients.add(server);

  const playerCount = countPlayers(room.clients);
  send(
    server,
    "init_state",
    createInitState(room.session, room.id, playerCount),
  );
  broadcast(room, "player_count", { count: playerCount }, server);

  server.addEventListener("message", async (event) => {
    let message;

    try {
      message = parseJsonMessage(event.data);
    } catch {
      return;
    }

    if (!message || typeof message !== "object") return;

    const type = message.type;
    const data = message.data || {};

    if (type === "move") {
      applyMove(room.session, data.pieces);
      broadcast(
        room,
        "state_update",
        { pieces: data.pieces || [], fromClient: server.clientId },
        server,
      );
      return;
    }

    if (type === "full_state") {
      applyFullState(room.session, data.pieces || []);
      return;
    }

    if (type === "config") {
      applyConfig(room.session, data);
      broadcast(room, "config_update", room.session.config);
    }
  });

  server.addEventListener("close", () => {
    room.clients.delete(server);
    broadcast(room, "player_count", { count: countPlayers(room.clients) });
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function createRoom(requestBody = {}) {
  const roomId = createRoomId();
  getRoom(roomId, requestBody);
  return roomId;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const publicAppUrl = env?.PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL;

    if (request.method === "OPTIONS") {
      return optionsResponse(request);
    }

    if (url.pathname !== "/health" && !url.pathname.startsWith("/api/")) {
      return Response.redirect(
        buildPublicAppRedirectUrl(url, publicAppUrl),
        302,
      );
    }

    if (url.pathname === "/health") {
      return jsonResponse(request, { ok: true, runtime: "worker" });
    }

    if (url.pathname === "/api/rooms" && request.method === "GET") {
      return jsonResponse(request, {
        rooms: Array.from(rooms.values()).map((room) => ({
          roomId: room.id,
          playerCount: countPlayers(room.clients),
          config: room.session.config,
        })),
        count: rooms.size,
      });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const roomId = createRoom(body);
      return jsonResponse(request, { roomId });
    }

    if (url.pathname === "/api/rooms/new" && request.method === "GET") {
      const roomId = createRoom({});
      return jsonResponse(request, { roomId });
    }

    if (url.pathname.startsWith("/api/rooms/")) {
      const roomId = url.pathname.split("/").pop();
      const room = rooms.get(roomId);

      if (!room) {
        return jsonResponse(
          request,
          { error: "Room not found" },
          { status: 404 },
        );
      }

      if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        return attachWebSocket(room, request);
      }

      return jsonResponse(request, {
        roomId: room.id,
        playerCount: countPlayers(room.clients),
        config: room.session.config,
      });
    }

    return jsonResponse(request, { error: "Not found" }, { status: 404 });
  },
};
