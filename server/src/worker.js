import {
	applyConfig,
	applyFullState,
	applyMove,
	countPlayers,
	createInitState,
	createPuzzleSession,
} from "./shared/puzzle-session.js";

const rooms = new Map();

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

function jsonResponse(body, init = {}) {
	return Response.json(body, init);
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
	send(server, "init_state", createInitState(room.session, room.id, playerCount));
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
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return jsonResponse({ ok: true, runtime: "worker" });
		}

		if (url.pathname === "/api/rooms" && request.method === "POST") {
			const body = await request.json().catch(() => ({}));
			const roomId = createRoom(body);
			return jsonResponse({ roomId });
		}

		if (url.pathname === "/api/rooms/new" && request.method === "GET") {
			const roomId = createRoom({});
			return jsonResponse({ roomId });
		}

		if (url.pathname.startsWith("/api/rooms/")) {
			const roomId = url.pathname.split("/").pop();
			const room = rooms.get(roomId);

			if (!room) {
				return jsonResponse({ error: "Room not found" }, { status: 404 });
			}

			if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
				return attachWebSocket(room, request);
			}

			return jsonResponse({
				roomId: room.id,
				playerCount: countPlayers(room.clients),
				config: room.session.config,
			});
		}

		return jsonResponse({ error: "Not found" }, { status: 404 });
	},
};