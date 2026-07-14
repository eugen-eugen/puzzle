// network-manager.js - Colyseus client for multiplayer puzzle synchronization
// Handles connection lifecycle, state sync, and conflict resolution.

import { Client } from "colyseus.js";
import { state } from "../game-engine.js";
import { gameTableController } from "../logic/game-table-controller.js";
import { groupManager } from "../logic/group-manager.js";
import { Group } from "../model/group.js";
import { hasGroupElement, updateGroupPosition, renderGroup, removeGroupElement } from "../logic/group-renderer.js";
import { getPieceElement } from "../logic/piece-renderer.js";
import { Point } from "../geometry/point.js";
import { DRAG_END, PIECES_CONNECTED, PIECES_DISCONNECTED } from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";

// ================================
// Configuration
// ================================
const SERVER_URL = "ws://localhost:2567";

// ================================
// Module State
// ================================
let client = null;
let room = null;
let isOnline = false;
let localSessionId = null;

/** Set of piece IDs currently being dragged locally (immune to remote updates) */
const locallyDraggedPieces = new Set();

// ================================
// Public API
// ================================

/**
 * Check if we're in online multiplayer mode
 * @returns {boolean}
 */
export function isOnlineMode() {
  return isOnline;
}

/**
 * Get the current room ID (game ID for sharing)
 * @returns {string|null}
 */
export function getRoomId() {
  return room?.id || null;
}

/**
 * Get the current player count
 * @returns {number}
 */
export function getPlayerCount() {
  return room?.state?.playerCount || 1;
}

/**
 * Start a new online game (host). Creates a room on the server.
 * @param {Object} config - Puzzle configuration
 * @param {string} config.imageUrl - Image URL
 * @param {number} config.pieceCount - Number of pieces
 * @param {boolean} config.noRotate - Whether rotation is disabled
 * @param {boolean} config.removeColor - Whether grayscale is enabled
 * @param {string} [config.license] - Image license
 * @returns {Promise<string>} The room/game ID for sharing
 */
export async function startOnlineGame(config) {
  client = new Client(SERVER_URL);

  room = await client.joinOrCreate("puzzle", {
    imageUrl: config.imageUrl,
    pieceCount: config.pieceCount,
    noRotate: config.noRotate || false,
    removeColor: config.removeColor || false,
    license: config.license || null,
  });

  isOnline = true;
  localSessionId = room.sessionId;

  setupRoomListeners();

  console.log(`[NetworkManager] Started online game: ${room.id}`);
  return room.id;
}

/**
 * Join an existing online game by room ID.
 * @param {string} roomId - The game/room ID to join
 * @returns {Promise<Object>} The initial state { config, pieces }
 */
export async function joinOnlineGame(roomId) {
  client = new Client(SERVER_URL);

  room = await client.joinById(roomId);

  isOnline = true;
  localSessionId = room.sessionId;

  // Wait for init_state message
  const initState = await new Promise((resolve) => {
    room.onMessage("init_state", (data) => {
      resolve(data);
    });
  });

  setupRoomListeners();

  console.log(`[NetworkManager] Joined game: ${room.id} (${initState.playerCount} players)`);
  return initState;
}

/**
 * Send the full state to the server (after initial scatter or game generation).
 * Includes full piece geometry so joiners can reconstruct identical pieces.
 * Called once after the puzzle is created/loaded.
 */
export function sendFullState() {
  if (!room || !isOnline) return;

  // Serialize full piece data (geometry + positions, no bitmaps)
  const pieces = state.pieces.map((piece) => piece.serialize(false));

  room.send("full_state", { pieces });
}

/**
 * Send a piece move to the server.
 * @param {Array<Object>} movedPieces - Array of { id, x, y, rotation, groupId, zIndex }
 */
export function sendMove(movedPieces) {
  if (!room || !isOnline) return;

  room.send("move", { pieces: movedPieces });
}

/**
 * Send puzzle config to the server (image URL, piece count, etc.)
 * @param {Object} config
 */
export function sendConfig(config) {
  if (!room || !isOnline) return;
  room.send("config", config);
}

/**
 * Disconnect from the server.
 */
export function disconnect() {
  if (room) {
    room.leave();
    room = null;
  }
  client = null;
  isOnline = false;
  localSessionId = null;
}

/**
 * Mark a piece as being dragged locally (won't accept remote updates for it)
 * @param {number} pieceId
 */
export function markPieceDragging(pieceId) {
  locallyDraggedPieces.add(pieceId);
}

/**
 * Unmark a piece as dragged (will accept remote updates again)
 * @param {number} pieceId
 */
export function unmarkPieceDragging(pieceId) {
  locallyDraggedPieces.delete(pieceId);
}

// ================================
// Internal
// ================================

function setupRoomListeners() {
  // Receive incremental state updates from other players
  room.onMessage("state_update", (data) => {
    if (!data.pieces) return;

    const updatedGroupIds = new Set();
    const newGroupAssignments = new Map(); // groupId -> [pieces]
    const groupsLosingPieces = new Map(); // oldGroupId -> [pieces leaving]

    for (const piece of data.pieces) {
      // Skip pieces being dragged locally (local wins during drag)
      if (locallyDraggedPieces.has(piece.id)) continue;

      const localPiece = state.pieces.find((p) => p.id === piece.id);
      if (!localPiece) continue;

      // Update position
      gameTableController.setPiecePosition(localPiece.id, new Point(piece.x, piece.y));

      // Update rotation
      if (piece.rotation !== undefined) {
        localPiece.setRotation(piece.rotation);
      }

      // Update z-index
      if (piece.zIndex !== undefined) {
        localPiece.zIndex = piece.zIndex;
      }

      // Track group changes
      if (piece.groupId !== undefined && piece.groupId !== localPiece.groupId) {
        const oldGroupId = localPiece.groupId;

        if (piece.groupId) {
          // Track that this piece is leaving its old group
          if (oldGroupId && oldGroupId !== piece.groupId) {
            if (!groupsLosingPieces.has(oldGroupId)) {
              groupsLosingPieces.set(oldGroupId, []);
            }
            groupsLosingPieces.get(oldGroupId).push(localPiece);
          }
          // Track that this piece is joining a new group
          if (!newGroupAssignments.has(piece.groupId)) {
            newGroupAssignments.set(piece.groupId, []);
          }
          newGroupAssignments.get(piece.groupId).push(localPiece);
        } else if (!piece.groupId && oldGroupId) {
          // Piece removed from group entirely (no new group)
          if (!groupsLosingPieces.has(oldGroupId)) {
            groupsLosingPieces.set(oldGroupId, []);
          }
          groupsLosingPieces.get(oldGroupId).push(localPiece);
          localPiece._setGroupId(null);
        }
      }

      // Track which existing groups need position updates
      if (localPiece.groupId && hasGroupElement(localPiece.groupId)) {
        updatedGroupIds.add(localPiece.groupId);
      }
    }

    // Remove pieces from old groups and re-render them
    for (const [oldGroupId, pieces] of groupsLosingPieces) {
      removeFromGroupAndRerender(oldGroupId, pieces);
    }

    // Apply group membership changes (add to new groups)
    for (const [remoteGroupId, pieces] of newGroupAssignments) {
      applyRemoteGroupMembership(remoteGroupId, pieces);
    }

    // Update group element positions for all affected groups
    for (const groupId of updatedGroupIds) {
      updateGroupPosition(groupId);
    }
  });

  // Receive player count updates
  room.onMessage("player_count", (data) => {
    document.dispatchEvent(
      new CustomEvent("online:player_count", { detail: data })
    );
  });

  // Handle disconnection
  room.onLeave((code) => {
    console.log(`[NetworkManager] Disconnected (code: ${code})`);
    isOnline = false;
    document.dispatchEvent(new CustomEvent("online:disconnected"));
  });
}

/**
 * Apply remote group membership: merge pieces into the specified group.
 * Creates the group if it doesn't exist locally, or merges into existing group.
 * Bypasses connectivity validation since we trust the server.
 */
function applyRemoteGroupMembership(remoteGroupId, piecesToAdd) {
  let group = groupManager.getGroup(remoteGroupId);

  if (!group) {
    // Group doesn't exist locally yet — create it with all pieces that should be in it
    // First, collect ALL pieces that have this groupId (including ones already set from earlier updates)
    const allGroupPieces = state.pieces.filter(
      (p) => p.groupId === remoteGroupId
    );

    // Add the new pieces
    const allPieces = [...new Set([...allGroupPieces, ...piecesToAdd])];

    // Remove pieces from their current groups first
    for (const p of allPieces) {
      if (p.groupId && p.groupId !== remoteGroupId) {
        const oldGroup = groupManager.getGroup(p.groupId);
        if (oldGroup) {
          oldGroup.removePieces([p]);
        }
      }
      p._setGroupId(remoteGroupId);
    }

    // Create the group without connectivity validation (trust server)
    group = new Group(remoteGroupId, allPieces, { validateConnectivity: false });
    groupManager.registerGroup(group);
  } else {
    // Group exists — add the new pieces to it
    for (const p of piecesToAdd) {
      if (p.groupId && p.groupId !== remoteGroupId) {
        const oldGroup = groupManager.getGroup(p.groupId);
        if (oldGroup) {
          oldGroup.removePieces([p]);
        }
      }
      p._setGroupId(remoteGroupId);
    }
    // Re-add pieces to the group's piece list
    const currentPieces = new Set(group.pieces.map((p) => p.id));
    const newPieces = piecesToAdd.filter((p) => !currentPieces.has(p.id));
    if (newPieces.length > 0) {
      group.pieces = [...group.pieces, ...newPieces];
      group._updateBorderPieces();
    }
  }

  // Render the group visually
  renderGroup(remoteGroupId);
}

/**
 * Remove pieces from an old group and re-render or remove the group element.
 * Called when pieces move to a different group remotely.
 */
function removeFromGroupAndRerender(oldGroupId, piecesLeaving) {
  const group = groupManager.getGroup(oldGroupId);
  if (!group) return;

  // Remove pieces from the group's internal list
  const leavingIds = new Set(piecesLeaving.map((p) => p.id));
  group.pieces = group.pieces.filter((p) => !leavingIds.has(p.id));
  group._updateBorderPieces();

  // Remove the old group visual element
  removeGroupElement(oldGroupId);

  // Show canvases for leaving pieces
  for (const p of piecesLeaving) {
    const el = getPieceElement(p.id);
    if (el) {
      const canvas = el.querySelector("canvas");
      if (canvas) canvas.style.visibility = "";
    }
  }

  // Re-render the remaining group if it has 2+ pieces
  if (group.size() > 1) {
    // Show remaining piece canvases temporarily
    group.allPieces.forEach((p) => {
      const el = getPieceElement(p.id);
      if (el) {
        const canvas = el.querySelector("canvas");
        if (canvas) canvas.style.visibility = "";
      }
    });
    renderGroup(oldGroupId);
  } else if (group.size() === 1) {
    // Single piece remaining — show its canvas, no group element needed
    group.allPieces.forEach((p) => {
      const el = getPieceElement(p.id);
      if (el) {
        const canvas = el.querySelector("canvas");
        if (canvas) canvas.style.visibility = "";
      }
    });
  } else {
    // Empty group — clean up
    const g = groupManager.getGroup(oldGroupId);
    if (g && g.isEmpty()) {
      // Group will be cleaned up naturally
    }
  }
}

// ================================
// Auto-send moves on drag end
// ================================

registerGlobalEvent(DRAG_END, (event) => {
  if (!isOnline || !room) return;

  const { pieceId } = event.detail;
  if (pieceId == null) return;

  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return;

  // Collect the piece and all pieces in its group
  const piecesToSend = [];
  const group = piece.groupId ? groupManager.getGroup(piece.groupId) : null;
  const groupPieces = group ? group.allPieces : [piece];

  for (const p of groupPieces) {
    const pos = gameTableController.getPiecePosition(p.id);
    piecesToSend.push({
      id: p.id,
      x: pos.x,
      y: pos.y,
      rotation: p.rotation,
      groupId: p.groupId,
      zIndex: p.zIndex,
    });
    unmarkPieceDragging(p.id);
  }

  sendMove(piecesToSend);
});

// When pieces connect (merge groups), send updated state for all pieces in the new group
registerGlobalEvent(PIECES_CONNECTED, (event) => {
  if (!isOnline || !room) return;

  const { groupId } = event.detail;
  if (!groupId) return;

  const group = groupManager.getGroup(groupId);
  if (!group) return;

  const piecesToSend = [];
  for (const p of group.allPieces) {
    const pos = gameTableController.getPiecePosition(p.id);
    piecesToSend.push({
      id: p.id,
      x: pos.x,
      y: pos.y,
      rotation: p.rotation,
      groupId: p.groupId,
      zIndex: p.zIndex,
    });
  }

  sendMove(piecesToSend);
});

// When a piece is detached, send its updated state
registerGlobalEvent(PIECES_DISCONNECTED, (event) => {
  if (!isOnline || !room) return;

  const { pieceId } = event.detail;
  if (pieceId == null) return;

  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return;

  const pos = gameTableController.getPiecePosition(piece.id);
  sendMove([{
    id: piece.id,
    x: pos.x,
    y: pos.y,
    rotation: piece.rotation,
    groupId: piece.groupId,
    zIndex: piece.zIndex,
  }]);
});
