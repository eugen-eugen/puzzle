// PuzzleRoom - Colyseus room for multiplayer puzzle games
import Colyseus from "colyseus";
const { Room } = Colyseus;
import {
  applyConfig,
  applyFullState,
  applyMove,
  countPlayers,
  createInitState,
  createPuzzleSession,
} from "../shared/puzzle-session.js";

/**
 * Room state structure:
 * {
 *   config: { imageUrl, pieceCount, noRotate, removeColor, license },
 *   pieces: { [id]: { x, y, rotation, groupId, zIndex } },
 *   startedAt: timestamp
 * }
 */
export class PuzzleRoom extends Room {
  onCreate(options) {
    // Use plain properties instead of Schema-based setState
    // (we handle all sync manually via messages)
    this.session = createPuzzleSession(options);

    this.maxClients = 10;

    console.log(`[PuzzleRoom] Created room ${this.roomId}`);

    // Handle piece move messages
    this.onMessage("move", (client, data) => {
      // data: { pieces: [{ id, x, y, rotation, groupId, zIndex }] }
      if (!data.pieces || !Array.isArray(data.pieces)) return;

      applyMove(this.session, data.pieces);

      // Broadcast updated pieces to all OTHER clients
      this.broadcast(
        "state_update",
        {
          pieces: data.pieces,
          fromClient: client.sessionId,
        },
        { except: client },
      );
    });

    // Handle full state sync (sent after initial scatter or on join)
    this.onMessage("full_state", (client, data) => {
      // data: { pieces: [ serialized piece objects ] }
      if (!data.pieces) return;

      applyFullState(this.session, data.pieces);

      console.log(
        `[PuzzleRoom] Full state received from ${client.sessionId}, ${Array.isArray(data.pieces) ? data.pieces.length : 0} pieces`,
      );
    });

    // Handle config update (image URL, piece count, etc.)
    this.onMessage("config", (client, data) => {
      applyConfig(this.session, data);

      // Broadcast config to all clients
      this.broadcast("config_update", this.session.config);
    });
  }

  _getClientCount() {
    return countPlayers(this.clients) || countPlayers(this._clients);
  }

  onJoin(client, options) {
    const count = this._getClientCount();
    console.log(`[PuzzleRoom] ${client.sessionId} joined (${count} players)`);

    // Send current full state to the joining client
    client.send("init_state", {
      ...createInitState(this.session, this.roomId, count),
      playerCount: count,
    });

    // Notify all clients of player count change
    this.broadcast("player_count", { count });
  }

  onLeave(client, consented) {
    const count = this._getClientCount();
    console.log(
      `[PuzzleRoom] ${client.sessionId} left (${count} players remaining)`,
    );
    this.broadcast("player_count", { count });
  }

  onDispose() {
    console.log(`[PuzzleRoom] Room ${this.roomId} disposed`);
  }
}
