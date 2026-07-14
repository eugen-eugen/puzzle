// Colyseus Puzzle Server - Entry point
import Colyseus from "colyseus";
import WsTransport from "@colyseus/ws-transport";
import { createServer } from "http";
import { PuzzleRoom } from "./rooms/PuzzleRoom.js";

const { Server } = Colyseus;
const { WebSocketTransport } = WsTransport;

const port = parseInt(process.env.PORT || "2567");

const server = new Server({
  transport: new WebSocketTransport({
    server: createServer(),
    maxPayload: 16 * 1024 * 1024, // 16 MB - full piece geometry can be large
  }),
});

server.define("puzzle", PuzzleRoom);

server.listen(port).then(() => {
  console.log(`[PuzzleServer] Listening on ws://localhost:${port}`);
});
