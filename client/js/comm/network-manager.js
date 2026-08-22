// network-manager.js - multiplayer transport for puzzle synchronization
// Handles connection lifecycle, state sync, and conflict resolution.

import { state } from "../game-engine.js";
import { gameTableController } from "../logic/game-table-controller.js";
import { groupManager } from "../logic/group-manager.js";
import { Group } from "../model/group.js";
import {
  hasGroupElement,
  getGroupElement,
  updateGroupPosition,
  renderGroup,
  removeGroupElement,
} from "../logic/group-renderer.js";
import { getPieceElement } from "../logic/piece-renderer.js";
import { Point } from "../geometry/point.js";
import { applyPieceTransform } from "../ui/display.js";
import {
  DRAG_END,
  PIECE_NORTH,
  PIECE_ROTATE,
  PIECES_CONNECTED,
  PIECES_DISCONNECTED,
} from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";

// ================================
// Configuration
// ================================
const SERVER_URL = "https://puzzle.jemo-prog.workers.dev";

// ================================
// Module State
// ================================
let client = null;
let room = null;
let isOnline = false;
let localSessionId = null;

const REMOTE_MOVE_EPSILON = 0.01;
const REMOTE_MOVE_ANIMATION_MS = 260;

/** Set of piece IDs currently being dragged locally (immune to remote updates) */
const locallyDraggedPieces = new Set();

/** Set of piece IDs that have been moved by remote players (excluded from local auto-zoom) */
const remotelyMovedPieces = new Set();

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
  return room?.playerCount || 1;
}

/**
 * Fetch the list of recent online game rooms from the server.
 * @returns {Promise<Array<{roomId: string, imageUrl: string|null, pieceCount: number|null, createdAt: number}>>}
 */
export async function fetchRecentRooms() {
  try {
    const response = await fetch(`${SERVER_URL}/api/rooms`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.rooms || [];
  } catch {
    return [];
  }
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
  room = await createWorkerRoom({
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
  room = await joinWorkerRoom(roomId);

  isOnline = true;
  localSessionId = room.sessionId;

  const initState = await room.initState;

  setupRoomListeners();

  console.log(
    `[NetworkManager] Joined game: ${room.id} (${initState.playerCount} players)`,
  );
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
  isOnline = false;
  localSessionId = null;
  remotelyMovedPieces.clear();
}

/**
 * Mark a piece as being dragged locally (won't accept remote updates for it)
 * @param {number} pieceId
 */
export function markPieceDragging(pieceId) {
  locallyDraggedPieces.add(pieceId);
  remotelyMovedPieces.delete(pieceId);
}

/**
 * Unmark a piece as dragged (will accept remote updates again)
 * @param {number} pieceId
 */
export function unmarkPieceDragging(pieceId) {
  locallyDraggedPieces.delete(pieceId);
}

/**
 * Get the set of piece IDs moved by remote players
 * @returns {Set<number>}
 */
export function getRemotelyMovedPieces() {
  return remotelyMovedPieces;
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
    const pieceFlightAnimations = [];
    const groupFlightStart = new Map(); // groupId -> { left, top }

    for (const piece of data.pieces) {
      // Skip pieces being dragged locally (local wins during drag)
      if (locallyDraggedPieces.has(piece.id)) continue;

      const localPiece = state.pieces.find((p) => p.id === piece.id);
      if (!localPiece) continue;

      const previousPosition = gameTableController.getPiecePosition(
        localPiece.id,
      );
      const hasIncomingPosition =
        typeof piece.x === "number" && typeof piece.y === "number";
      const didMove =
        hasIncomingPosition &&
        previousPosition &&
        (Math.abs(previousPosition.x - piece.x) > REMOTE_MOVE_EPSILON ||
          Math.abs(previousPosition.y - piece.y) > REMOTE_MOVE_EPSILON);

      const oldGroupId = localPiece.groupId;
      const oldGroupRendered = oldGroupId && hasGroupElement(oldGroupId);

      if (didMove && oldGroupRendered && !groupFlightStart.has(oldGroupId)) {
        const groupEl = getGroupElement(oldGroupId);
        if (groupEl) {
          groupFlightStart.set(oldGroupId, {
            left: parseFloat(groupEl.style.left) || 0,
            top: parseFloat(groupEl.style.top) || 0,
          });
        }
      }

      if (didMove && !oldGroupRendered) {
        const pieceEl = getPieceElement(localPiece.id);
        if (pieceEl) {
          pieceFlightAnimations.push({
            element: pieceEl,
            fromLeft: parseFloat(pieceEl.style.left) || 0,
            fromTop: parseFloat(pieceEl.style.top) || 0,
          });
        }
      }

      // Update position
      gameTableController.setPiecePosition(
        localPiece.id,
        new Point(piece.x, piece.y),
      );
      remotelyMovedPieces.add(localPiece.id);

      // Update rotation
      if (piece.rotation !== undefined) {
        localPiece.setRotation(piece.rotation);

        // For standalone pieces, the transform must be reapplied now.
        // Otherwise a pure rotation update only becomes visible on the next move.
        if (!localPiece.groupId || !hasGroupElement(localPiece.groupId)) {
          applyPieceTransform(localPiece);
        }
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

      const start = groupFlightStart.get(groupId);
      if (!start) continue;

      const groupEl = getGroupElement(groupId);
      if (!groupEl) continue;

      animateRemoteMove(
        groupEl,
        start.left,
        start.top,
        parseFloat(groupEl.style.left) || 0,
        parseFloat(groupEl.style.top) || 0,
      );
    }

    for (const animation of pieceFlightAnimations) {
      const { element, fromLeft, fromTop } = animation;
      animateRemoteMove(
        element,
        fromLeft,
        fromTop,
        parseFloat(element.style.left) || 0,
        parseFloat(element.style.top) || 0,
      );
    }
  });

  // Receive player count updates
  room.onMessage("player_count", (data) => {
    room.playerCount = data.count ?? room.playerCount ?? 1;
    document.dispatchEvent(
      new CustomEvent("online:player_count", { detail: data }),
    );
  });

  // Handle disconnection
  room.onLeave((code) => {
    console.log(`[NetworkManager] Disconnected (code: ${code})`);
    isOnline = false;
    document.dispatchEvent(new CustomEvent("online:disconnected"));
  });
}

function animateRemoteMove(element, fromLeft, fromTop, toLeft, toTop) {
  if (!element) return;

  const dx = Math.abs(fromLeft - toLeft);
  const dy = Math.abs(fromTop - toTop);
  if (dx <= REMOTE_MOVE_EPSILON && dy <= REMOTE_MOVE_EPSILON) return;

  element.classList.add("remote-move-flash");

  if (typeof element.animate === "function") {
    element.animate(
      [
        {
          left: `${fromLeft}px`,
          top: `${fromTop}px`,
          filter: "drop-shadow(0 0 0 rgba(46, 168, 98, 0))",
        },
        {
          left: `${toLeft}px`,
          top: `${toTop}px`,
          filter: "drop-shadow(0 0 10px rgba(46, 168, 98, 0.8))",
          offset: 0.7,
        },
        {
          left: `${toLeft}px`,
          top: `${toTop}px`,
          filter: "drop-shadow(0 0 0 rgba(46, 168, 98, 0))",
        },
      ],
      {
        duration: REMOTE_MOVE_ANIMATION_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  }

  setTimeout(() => {
    element.classList.remove("remote-move-flash");
  }, REMOTE_MOVE_ANIMATION_MS + 30);
}

async function createWorkerRoom(config) {
  const response = await fetch(`${SERVER_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to create room (${response.status})`);
  }

  const { roomId } = await response.json();
  return connectWorkerRoom(roomId);
}

async function joinWorkerRoom(roomId) {
  return connectWorkerRoom(roomId);
}

async function connectWorkerRoom(roomId) {
  const wsUrl = `${SERVER_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:")}/api/rooms/${roomId}`;
  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";

  const listeners = new Map();
  const leaveHandlers = new Set();
  const pending = [];
  let resolveInitState = null;
  const initState = new Promise((resolve) => {
    resolveInitState = resolve;
  });

  const roomLike = {
    id: roomId,
    sessionId: roomId,
    playerCount: 1,
    initState,
    onMessage(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    onLeave(callback) {
      leaveHandlers.add(callback);
    },
    send(type, data) {
      const payload = JSON.stringify({ type, data });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        return;
      }
      pending.push(payload);
    },
    leave() {
      socket.close(1000, "client leave");
    },
  };

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      for (const message of pending.splice(0)) socket.send(message);
      resolve();
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message || typeof message !== "object") return;

      if (message.type === "init_state") {
        roomLike.playerCount = message.payload?.playerCount ?? 1;
        resolveInitState?.(message.payload);
      }

      if (message.type === "player_count") {
        roomLike.playerCount = message.payload?.count ?? roomLike.playerCount;
      }

      const callbacks = listeners.get(message.type);
      if (callbacks) {
        for (const callback of callbacks) callback(message.payload);
      }
    });
    socket.addEventListener("close", (event) => {
      for (const callback of leaveHandlers) callback(event.code);
    });
    socket.addEventListener("error", () =>
      reject(new Error(`Failed to connect to ${wsUrl}`)),
    );
  });

  return roomLike;
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
      (p) => p.groupId === remoteGroupId,
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
    group = new Group(remoteGroupId, allPieces, {
      validateConnectivity: false,
    });
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

function collectPieceOrGroupState(pieceId) {
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return [];

  const group = piece.groupId ? groupManager.getGroup(piece.groupId) : null;
  const groupPieces = group ? group.allPieces : [piece];

  return groupPieces.map((p) => {
    const pos = gameTableController.getPiecePosition(p.id);
    return {
      id: p.id,
      x: pos.x,
      y: pos.y,
      rotation: p.rotation,
      groupId: p.groupId,
      zIndex: p.zIndex,
    };
  });
}

function sendRotationUpdate(pieceId) {
  if (!isOnline || !room || pieceId == null) return;

  const piecesToSend = collectPieceOrGroupState(pieceId);
  if (piecesToSend.length === 0) return;

  sendMove(piecesToSend);
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

// Rotation must sync immediately; otherwise remotes only see it on a later move event.
registerGlobalEvent(PIECE_ROTATE, (event) => {
  const { pieceId } = event.detail;
  // Defer one tick so local rotate handlers update model + group positions first.
  setTimeout(() => sendRotationUpdate(pieceId), 0);
});

// The "orient north" action rotates to absolute 0deg via a different event path.
registerGlobalEvent(PIECE_NORTH, (event) => {
  const { pieceId } = event.detail || {};
  setTimeout(() => sendRotationUpdate(pieceId), 0);
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

  const { pieceId, fromGroupId, newGroupId, fragmentGroupIds } = event.detail;
  if (pieceId == null) return;

  const affectedGroupIds = new Set(
    [fromGroupId, newGroupId, ...(fragmentGroupIds || [])].filter(Boolean),
  );

  const piecesToSync = [];
  const syncedPieceIds = new Set();

  for (const groupId of affectedGroupIds) {
    const group = groupManager.getGroup(groupId);
    if (!group) continue;

    for (const p of group.allPieces) {
      if (syncedPieceIds.has(p.id)) continue;
      const pos = gameTableController.getPiecePosition(p.id);
      piecesToSync.push({
        id: p.id,
        x: pos.x,
        y: pos.y,
        rotation: p.rotation,
        groupId: p.groupId,
        zIndex: p.zIndex,
      });
      syncedPieceIds.add(p.id);
    }
  }

  // Fallback for older event payloads or unexpected state: at least sync detached piece.
  if (piecesToSync.length === 0) {
    const piece = state.pieces.find((p) => p.id === pieceId);
    if (!piece) return;

    const pos = gameTableController.getPiecePosition(piece.id);
    piecesToSync.push({
      id: piece.id,
      x: pos.x,
      y: pos.y,
      rotation: piece.rotation,
      groupId: piece.groupId,
      zIndex: piece.zIndex,
    });
  }

  sendMove(piecesToSync);
});
