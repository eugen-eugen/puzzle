// PuzzleRoom - Colyseus room for multiplayer puzzle games
import Colyseus from "colyseus";
const { Room } = Colyseus;

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
    this.puzzleConfig = {
      imageUrl: options.imageUrl || null,
      pieceCount: options.pieceCount || 20,
      noRotate: options.noRotate || false,
      removeColor: options.removeColor || false,
      license: options.license || null,
    };
    this.puzzlePieces = {}; // Map of id -> {x, y, rotation, groupId, zIndex} for incremental updates
    this.puzzlePiecesFullState = null; // Full serialized piece array for joiners

    this.maxClients = 10;

    console.log(`[PuzzleRoom] Created room ${this.roomId}`);

    // Handle piece move messages
    this.onMessage("move", (client, data) => {
      // data: { pieces: [{ id, x, y, rotation, groupId, zIndex }] }
      if (!data.pieces || !Array.isArray(data.pieces)) return;

      for (const piece of data.pieces) {
        if (piece.id == null) continue;
        this.puzzlePieces[piece.id] = {
          x: piece.x,
          y: piece.y,
          rotation: piece.rotation ?? 0,
          groupId: piece.groupId ?? null,
          zIndex: piece.zIndex ?? 0,
        };
      }

      // Broadcast updated pieces to all OTHER clients
      this.broadcast("state_update", {
        pieces: data.pieces,
        fromClient: client.sessionId,
      }, { except: client });
    });

    // Handle full state sync (sent after initial scatter or on join)
    this.onMessage("full_state", (client, data) => {
      // data: { pieces: [ serialized piece objects ] }
      if (!data.pieces) return;

      // Store full serialized state for joiners
      this.puzzlePiecesFullState = data.pieces;

      // Also update the incremental piece positions map
      if (Array.isArray(data.pieces)) {
        for (const p of data.pieces) {
          if (p.id == null) continue;
          const pos = p.position || {};
          this.puzzlePieces[p.id] = {
            x: pos.x ?? p.displayX ?? 0,
            y: pos.y ?? p.displayY ?? 0,
            rotation: p.rotation ?? 0,
            groupId: p.groupId ?? null,
            zIndex: p.zIndex ?? 0,
          };
        }
      }

      console.log(`[PuzzleRoom] Full state received from ${client.sessionId}, ${Array.isArray(data.pieces) ? data.pieces.length : 0} pieces`);
    });

    // Handle config update (image URL, piece count, etc.)
    this.onMessage("config", (client, data) => {
      if (data.imageUrl !== undefined) this.puzzleConfig.imageUrl = data.imageUrl;
      if (data.pieceCount !== undefined) this.puzzleConfig.pieceCount = data.pieceCount;
      if (data.noRotate !== undefined) this.puzzleConfig.noRotate = data.noRotate;
      if (data.removeColor !== undefined) this.puzzleConfig.removeColor = data.removeColor;
      if (data.license !== undefined) this.puzzleConfig.license = data.license;

      // Broadcast config to all clients
      this.broadcast("config_update", this.puzzleConfig);
    });
  }

  _getClientCount() {
    // Colyseus client collection varies by version — handle both
    if (this.clients && typeof this.clients.size === "number") return this.clients.size;
    if (this.clients && typeof this.clients.length === "number") return this.clients.length;
    if (this._clients) return this._clients.size || this._clients.length || 0;
    return 0;
  }

  onJoin(client, options) {
    const count = this._getClientCount();
    console.log(`[PuzzleRoom] ${client.sessionId} joined (${count} players)`);

    // Send current full state to the joining client
    client.send("init_state", {
      config: this.puzzleConfig,
      pieces: this.puzzlePiecesFullState, // Full serialized piece data with geometry
      piecePositions: this.puzzlePieces, // Current positions (may be more up-to-date)
      roomId: this.roomId,
      playerCount: count,
    });

    // Notify all clients of player count change
    this.broadcast("player_count", { count });
  }

  onLeave(client, consented) {
    const count = this._getClientCount();
    console.log(`[PuzzleRoom] ${client.sessionId} left (${count} players remaining)`);
    this.broadcast("player_count", { count });
  }

  onDispose() {
    console.log(`[PuzzleRoom] Room ${this.roomId} disposed`);
  }
}
