// persistence.js - localStorage save/load for puzzle state
// Event-driven architecture: listens for persistence:save and persistence:restore events
// Emits persistence:can-resume and persistence:cannot-resume events

import { Piece } from "../model/piece.js";
import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import { boundingFrame } from "../geometry/polygon.js";
import { Util } from "../utils/numeric-util.js";
import { isIndexedDBSupported, loadImageFromDB } from "./indexed-db-storage.js";
import { state } from "../game-engine.js";
import { gameTableController } from "../logic/game-table-controller.js";
import { renderPiecesAtPositions } from "../logic/piece-renderer.js";
import { getViewport } from "../ui/display.js";
import {
  PERSISTENCE_SAVE,
  PERSISTENCE_RESTORE,
  PERSISTENCE_CAN_RESUME,
  PERSISTENCE_CANNOT_RESUME,
  PIECES_CONNECTED,
  DRAG_END,
  PUZZLE_STATE_CHANGED,
} from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";

const LS_KEY = "puzzle.save.v2";
const AUTO_SAVE_DELAY = 1200; // ms debounce
const STORE_BITMAPS = false; // Enable only for debugging tiny puzzles
const MAX_RETRY_LIGHTEN = 1; // Attempts to retry without bitmaps on quota error
const FALLBACK_SIZE_SOFT_LIMIT = 2_500_000; // ~2.5MB soft limit

let dirty = false;
let autoSaveTimer = null;

/**
 * Initialize persistence module
 * Sets up event listeners for persistence events
 */
function initPersistence() {
  // Listen for save requests from core
  registerGlobalEvent(PERSISTENCE_SAVE, () => {
    requestAutoSave();
  });

  // Listen for restore requests from core
  registerGlobalEvent(PERSISTENCE_RESTORE, () => {
    tryOfferResume();
  });

  // Listen for piece connections to trigger auto-save
  registerGlobalEvent(PIECES_CONNECTED, () => {
    requestAutoSave();
  });

  // Listen for drag end to trigger auto-save
  registerGlobalEvent(DRAG_END, () => {
    requestAutoSave();
  });

  // Debug API for manual operations
  window.puzzlePersistence = {
    manualSave: saveNow,
    load: loadGame,
    clear: clearSavedGame,
    stats: () => ({ size: localStorage.getItem(LS_KEY)?.length || 0 }),
  };

  // Save on page unload
  window.addEventListener("beforeunload", () => {
    if (dirty) {
      try {
        saveNow();
      } catch (_) {}
    }
  });

  console.info("[persistence] Initialized with event-driven architecture");
}

/**
 * Mark state as dirty (needs save)
 * @private
 */
function markDirty() {
  dirty = true;
}

/**
 * Request auto-save with debouncing
 * Schedules a save after AUTO_SAVE_DELAY ms
 * @private
 */
function requestAutoSave() {
  dirty = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveNow();
  }, AUTO_SAVE_DELAY);
}

/**
 * Compute grid dimensions from pieces
 * @param {Array<Piece>} pieces - Array of puzzle pieces
 * @returns {{rows: number, cols: number}} Grid dimensions
 * @private
 */
function computeRowsColsFromPieces(pieces) {
  let maxRow = 0,
    maxCol = 0;
  for (const p of pieces) {
    if (p.gridY > maxRow) maxRow = p.gridY;
    if (p.gridX > maxCol) maxCol = p.gridX;
  }
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

/**
 * Serialize current game state to JSON-compatible object
 * @param {boolean} [includeBitmaps=STORE_BITMAPS] - Whether to include piece bitmaps
 * @returns {Object|null} Serialized state or null if no pieces exist
 * @private
 */
function serializeState(includeBitmaps = STORE_BITMAPS) {
  if (Util.isArrayEmpty(state.pieces)) return null;

  const pieces = state.pieces.map((p) => {
    // Use Piece class serialize method if available
    if (typeof p.serialize === "function") {
      return p.serialize(includeBitmaps);
    }

    // Fallback for plain objects
    let bitmapData = null;
    if (includeBitmaps) {
      try {
        bitmapData = p.bitmap?.toDataURL?.();
      } catch (_) {
        bitmapData = null;
      }
    }

    const position =
      gameTableController.getPiecePosition(p.id) || new Point(0, 0);
    return {
      id: p.id,
      gridX: p.gridX,
      gridY: p.gridY,
      rotation: p.rotation,
      displayX: position.x,
      displayY: position.y,
      groupId: p.groupId,
      sPoints: p.sPoints,
      w: p.imgRect.width,
      h: p.imgRect.height,
      scale: p.scale,
      imgX: p.imgRect.position.x,
      imgY: p.imgRect.position.y,
      bitmapData,
    };
  });

  const { rows, cols } = computeRowsColsFromPieces(state.pieces);

  return {
    version: "puzzleStateV2",
    savedAt: Date.now(),
    layout: { rows, cols },
    ui: {
      offsetX: state.viewport.offsetX,
      offsetY: state.viewport.offsetY,
      scale: state.viewport.scale,
      sliderValue: state.puzzleSettings.sliderValue,
      removeColor: state.puzzleSettings.removeColor,
      noRotate: state.noRotate,
    },
    imageSource: {
      source: state.image.source,
      width: state.image.data?.naturalWidth || state.image.data?.width || null,
      height:
        state.image.data?.naturalHeight || state.image.data?.height || null,
      imageId: state.image.id,
      license: state.image.license,
    },
    totalPieces: state.totalPieces,
    pieces,
    light: !includeBitmaps,
  };
}

/**
 * Save current state to localStorage
 */
function saveNow() {
  try {
    let retries = 0;
    let attemptIncludeBitmaps = STORE_BITMAPS;

    while (retries <= MAX_RETRY_LIGHTEN) {
      const payload = serializeState(attemptIncludeBitmaps);
      if (!payload) {
        dirty = false;
        return;
      }

      const json = JSON.stringify(payload);

      if (json.length > FALLBACK_SIZE_SOFT_LIMIT && attemptIncludeBitmaps) {
        console.warn(
          `[persistence] Payload ~${json.length}B above soft limit; retry without bitmaps.`
        );
        attemptIncludeBitmaps = false;
        retries++;
        continue;
      }

      try {
        localStorage.setItem(LS_KEY, json);
        dirty = false;
        console.info("[persistence] Saved successfully", {
          pieces: payload.pieces.length,
          size: `${(json.length / 1024).toFixed(1)}KB`,
        });
        break;
      } catch (err) {
        if (
          attemptIncludeBitmaps &&
          (err.name === "QuotaExceededError" || err.code === 22)
        ) {
          console.warn(
            "[persistence] Quota exceeded with bitmaps; retrying without them."
          );
          attemptIncludeBitmaps = false;
          retries++;
          continue;
        }
        console.warn("[persistence] Save failed", err);
        break;
      }
    }
  } catch (e) {
    console.warn("[persistence] Save failed (outer)", e);
  }
}

/**
 * Check if saved game exists in localStorage
 * @returns {boolean} True if saved game exists
 */
function hasSavedGame() {
  return !!localStorage.getItem(LS_KEY);
}

/**
 * Clear saved game from localStorage
 */
function clearSavedGame() {
  localStorage.removeItem(LS_KEY);
  console.info("[persistence] Cleared save");
}

/**
 * Try to offer resume - emits events based on whether save exists
 * Emits PERSISTENCE_CAN_RESUME with saved state if available,
 * or PERSISTENCE_CANNOT_RESUME if not
 */
function tryOfferResume() {
  const hasGame = hasSavedGame();

  if (hasGame) {
    const raw = localStorage.getItem(LS_KEY);
    try {
      const data = JSON.parse(raw);
      // Emit can-resume event with saved state
      document.dispatchEvent(
        new CustomEvent(PERSISTENCE_CAN_RESUME, {
          detail: { savedState: data },
        })
      );
    } catch (e) {
      console.warn("[persistence] Corrupt save; clearing");
      clearSavedGame();
      document.dispatchEvent(new CustomEvent(PERSISTENCE_CANNOT_RESUME));
    }
  } else {
    // No saved game - emit cannot-resume event
    document.dispatchEvent(new CustomEvent(PERSISTENCE_CANNOT_RESUME));
  }
}

/**
 * Load game from localStorage
 */
function loadGame() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    console.warn("[persistence] No saved game found");
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.warn("[persistence] Corrupt save; clearing");
    clearSavedGame();
    return;
  }

  if (data.version !== "puzzleStateV2" && data.version !== "puzzleStateV1") {
    console.warn("[persistence] Version mismatch:", data.version);
    return;
  }

  // Handle image loading based on source type
  if (data.imageSource?.source) {
    const imgSource = data.imageSource.source;

    // Update state with image metadata
    state.image.source = imgSource;
    state.image.id = data.imageSource.imageId;
    state.image.license = data.imageSource.license;

    const img = new Image();

    img.onload = () => {
      state.image.data = img;
      reconstructPieces(data, img);
    };

    img.onerror = () => {
      console.warn(
        "[persistence] Failed to load image from source:",
        imgSource
      );
      console.warn(
        "[persistence] This may be due to file being moved or URL no longer accessible"
      );
      reconstructPieces(data, null);
    };

    // Handle IndexedDB sources
    if (imgSource.startsWith("idb:") && data.imageSource.imageId) {
      console.log(
        "[persistence] Attempting to load IndexedDB source:",
        data.imageSource.imageId
      );

      if (isIndexedDBSupported()) {
        loadImageFromDB(data.imageSource.imageId)
          .then((imageData) => {
            const url = URL.createObjectURL(imageData.blob);
            img.src = url;
            img.onload = () => {
              URL.revokeObjectURL(url);
              state.image.data = img;
              state.image.id = imageData.id;
              reconstructPieces(data, img);
            };
          })
          .catch((error) => {
            console.warn(
              "[persistence] Failed to load IndexedDB image:",
              error
            );
            reconstructPieces(data, null);
          });
        return;
      } else {
        console.warn("[persistence] IndexedDB not supported");
        reconstructPieces(data, null);
        return;
      }
    }
    // Handle URL sources
    else if (
      imgSource.startsWith("http://") ||
      imgSource.startsWith("https://")
    ) {
      img.crossOrigin = "anonymous";
      img.src = imgSource;
    }
    // Handle local file sources (can't reload)
    else {
      console.warn("[persistence] Cannot reload local file:", imgSource);
      reconstructPieces(data, null);
    }
  }
  // Fallback for old save format with embedded image data
  else if (data.image?.src) {
    const img = new Image();
    img.onload = () => {
      state.image.data = img;
      reconstructPieces(data, img);
    };
    img.onerror = () => {
      console.warn("[persistence] Failed to load embedded image");
      reconstructPieces(data, null);
    };
    img.src = data.image.src;
  } else {
    reconstructPieces(data, null);
  }
}

/**
 * Reconstruct pieces from saved data
 * Creates Piece instances, registers positions, restores viewport, and renders
 * @param {Object} data - Saved game state
 * @param {HTMLImageElement|null} masterImage - Master image for bitmap generation
 * @private
 */
function reconstructPieces(data, masterImage) {
  const pieces = data.pieces.map((sp) => {
    const master = document.createElement("canvas");
    master.width = masterImage.width;
    master.height = masterImage.height;
    const mctx = master.getContext("2d");
    mctx.drawImage(masterImage, 0, 0);

    const allPoints = Object.values(sp.corners);
    if (sp.sPoints.north) allPoints.push(sp.sPoints.north);
    if (sp.sPoints.east) allPoints.push(sp.sPoints.east);
    if (sp.sPoints.south) allPoints.push(sp.sPoints.south);
    if (sp.sPoints.west) allPoints.push(sp.sPoints.west);
    const nw = new Point(sp.imgX, sp.imgY);

    // Recreate geometry by adding nw offset to corners and sPoints
    const geometryCorners = {};
    for (const [key, corner] of Object.entries(sp.corners)) {
      geometryCorners[key] = new Point(corner.x + nw.x, corner.y + nw.y);
    }

    const geometrySidePoints = {};
    for (const [key, sPoint] of Object.entries(sp.sPoints)) {
      if (sPoint) {
        geometrySidePoints[key] = new Point(sPoint.x + nw.x, sPoint.y + nw.y);
      }
    }

    const piece = new Piece({ ...sp, master });

    state.pieces.push(piece);
    gameTableController.setPiecePosition(
      piece.id,
      new Point(sp.displayX || 0, sp.displayY || 0)
    );
    return piece;
  });

  // Update state
  //state.pieces = pieces;
  state.totalPieces = pieces.length;
  state.noRotate = data.ui?.noRotate || false;

  // If noRotate is enabled, reset all piece rotations to 0
  if (state.noRotate) {
    state.pieces.forEach((piece) => {
      piece.setRotation(0);
    });
  }

  // Restore viewport state
  if (data.ui) {
    if (typeof data.ui.offsetX === "number")
      state.viewport.offsetX = data.ui.offsetX;
    if (typeof data.ui.offsetY === "number")
      state.viewport.offsetY = data.ui.offsetY;
    if (typeof data.ui.scale === "number") state.viewport.scale = data.ui.scale;
    if (typeof data.ui.sliderValue === "number")
      state.puzzleSettings.sliderValue = data.ui.sliderValue;
    if (typeof data.ui.removeColor === "boolean")
      state.puzzleSettings.removeColor = data.ui.removeColor;
  }

  // Render pieces
  const viewport = getViewport();
  if (viewport) {
    viewport.innerHTML = "";
    renderPiecesAtPositions(viewport, state.pieces);
  }

  // Sync controller (updates internal state, doesn't change positions)
  gameTableController.syncAllPositions();

  // Dispatch state changed event
  document.dispatchEvent(
    new CustomEvent(PUZZLE_STATE_CHANGED, {
      detail: { action: "loaded" },
    })
  );

  console.info("[persistence] Loaded game", {
    pieces: pieces.length,
    light: data.light,
  });

  dirty = false;
}

export {
  initPersistence,
  saveNow,
  requestAutoSave,
  markDirty,
  hasSavedGame,
  tryOfferResume,
  clearSavedGame,
  loadGame,
};
