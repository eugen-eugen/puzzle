// online-game.js - Orchestrates online multiplayer game initialization
// Handles the ?online=new and ?online=<roomId> URL parameter flows.

import { state } from "../game-engine.js";
import {
  startOnlineGame,
  joinOnlineGame,
  sendFullState,
  sendConfig,
  isOnlineMode,
  getRoomId,
} from "./network-manager.js";

let pendingInitialSync = false;

function syncInitialStateNow() {
  sendFullState();
  sendConfig({
    imageUrl: state.deepLinkImageUrl || state.image?.source,
    pieceCount: state.totalPieces,
    noRotate: state.noRotate,
    removeColor: state.puzzleSettings?.removeColor || false,
    license: state.image?.license || null,
  });
}

/**
 * Initialize online game mode based on URL parameters.
 * Should be called after parseDeepLinkParams() has set state.onlineMode.
 *
 * For "host" mode: waits until the puzzle is generated, then sends state to server.
 * For "join" mode: connects to room, receives config, triggers puzzle load.
 *
 * @param {Object} callbacks
 * @param {Function} callbacks.onJoinReceiveConfig - Called with config when joining an existing game
 * @param {Function} callbacks.onRoomCreated - Called with roomId after creating a room
 * @param {Function} callbacks.onError - Called with error message on failure
 */
export async function initOnlineMode(callbacks) {
  if (!state.onlineMode) return;

  try {
    if (state.onlineMode === "host") {
      // Host creates a room. The puzzle config comes from deep link params.
      const config = {
        imageUrl: state.deepLinkImageUrl,
        pieceCount: state.deepLinkPieceCount,
        noRotate: state.noRotate,
        removeColor: state.deepLinkRemoveColor === "y",
        license: state.deepLinkLicense,
      };

      const roomId = await startOnlineGame(config);
      state.onlineRoomId = roomId;

      if (callbacks.onRoomCreated) {
        callbacks.onRoomCreated(roomId);
      }

      if (pendingInitialSync && isOnlineMode()) {
        syncInitialStateNow();
        pendingInitialSync = false;
      }

      console.log(`[OnlineGame] Room created: ${roomId}`);
      console.log(`[OnlineGame] Share URL: ${buildJoinUrl(roomId)}`);
    } else if (state.onlineMode === "join") {
      // Join an existing room
      const initState = await joinOnlineGame(state.onlineRoomId);

      if (callbacks.onJoinReceiveConfig) {
        callbacks.onJoinReceiveConfig(initState);
      }
    }
  } catch (err) {
    console.error("[OnlineGame] Failed to initialize:", err);
    if (callbacks.onError) {
      callbacks.onError(err.message || "Connection failed");
    }
  }
}

/**
 * Called after puzzle is generated/scattered to sync initial state to server.
 * Only relevant for the host.
 */
export function onPuzzleReady() {
  if (state.onlineMode !== "host") return;

  if (isOnlineMode()) {
    syncInitialStateNow();
    pendingInitialSync = false;
  } else {
    pendingInitialSync = true;
  }
}

/**
 * Build a shareable URL for joining the game.
 * @param {string} roomId
 * @returns {string}
 */
export function buildJoinUrl(roomId) {
  const url = new URL(window.location.href);

  // Ensure the share link always points to the public puzzle app, not the current query string.
  url.search = "";

  const pathname = url.pathname.endsWith("/")
    ? url.pathname
    : `${url.pathname}/`;
  url.pathname = pathname;
  url.searchParams.set("online", roomId);

  return url.toString();
}
