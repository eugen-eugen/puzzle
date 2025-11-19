// persistence.js - localStorage save/load for puzzle state
// Avoids quota issues by default (does NOT store per-piece bitmap data URLs unless enabled).
// Regenerates piece bitmaps from the original image + geometry on load.

import { Piece } from "./model/piece.js";
import { Point } from "./geometry/point.js";
import { Rectangle } from "./geometry/rectangle.js";
import { Util } from "./utils/util.js";
import { isIndexedDBSupported, loadImageFromDB } from "./indexedDBStorage.js";

const LS_KEY = "puzzle.save.v2";
const AUTO_SAVE_DELAY = 1200; // ms debounce (SAVE_DEBOUNCE_MS)
const STORE_BITMAPS = false; // Enable only for debugging tiny puzzles
const MAX_RETRY_LIGHTEN = 1; // Attempts to retry without bitmaps on quota error
const FALLBACK_SIZE_SOFT_LIMIT = 2_500_000; // ~2.5MB soft limit before auto-lighten (approx localStorage comfort threshold)

let dirty = false;
let autoSaveTimer = null;
let api = null; // injected callbacks from app.js

function initPersistence(callbacks) {
  api = callbacks;
  window.puzzlePersistence = {
    manualSave: saveNow,
    load: loadGame,
    clear: clearSavedGame,
    stats: () => ({ size: localStorage.getItem(LS_KEY)?.length || 0 }),
  };
  window.addEventListener("beforeunload", () => {
    if (dirty) {
      try {
        saveNow();
      } catch (_) {}
    }
  });
}

function markDirty() {
  dirty = true;
}

function requestAutoSave() {
  dirty = true;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveNow();
  }, AUTO_SAVE_DELAY);
}

function computeRowsColsFromPieces(pieces) {
  let maxRow = 0,
    maxCol = 0;
  for (const p of pieces) {
    if (p.gridY > maxRow) maxRow = p.gridY;
    if (p.gridX > maxCol) maxCol = p.gridX;
  }
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

function serializeState(includeBitmaps = STORE_BITMAPS) {
  if (!api) return null;
  const s = api.getState();
  if (Util.isArrayEmpty(s.pieces)) return null;
  const pieces = s.pieces.map((p) => {
    // Use Piece class serialize method if available, otherwise fall back to manual serialization
    if (typeof p.serialize === "function") {
      return p.serialize(includeBitmaps);
    } else {
      // Legacy fallback for plain objects
      let bitmapData = null;
      if (includeBitmaps) {
        try {
          bitmapData = p.bitmap?.toDataURL?.();
        } catch (_) {
          bitmapData = null;
        }
      }
      return {
        id: p.id,
        gridX: p.gridX,
        gridY: p.gridY,
        rotation: p.rotation,
        displayX: p.position.x,
        displayY: p.position.y,
        groupId: p.groupId,
        edges: p.edges,
        sPoints: p.sPoints,
        w: p.w,
        h: p.h,
        scale: p.scale,
        imgX: p.imgX,
        imgY: p.imgY,
        bitmapData,
      };
    }
  });
  const { rows, cols } = computeRowsColsFromPieces(s.pieces);
  return {
    version: "puzzleStateV2",
    savedAt: Date.now(),
    layout: { rows, cols },
    ui: { ...api.getViewportState(), sliderValue: api.getSliderValue() },
    totalPieces: s.totalPieces,
    pieces,
    light: !includeBitmaps,
  };
}

function saveNow() {
  if (!api) return;
  try {
    const img = api.getCurrentImage();
    const imgSource = api.getCurrentImageSource();

    let attemptIncludeBitmaps = STORE_BITMAPS;
    let retries = 0;
    while (retries <= MAX_RETRY_LIGHTEN) {
      const payload = serializeState(attemptIncludeBitmaps);
      if (!payload) return;

      // Save image source information instead of image data
      if (imgSource) {
        payload.imageSource = {
          source: imgSource, // filename or URL
          width: (img?.naturalWidth || img?.width) ?? null,
          height: (img?.naturalHeight || img?.height) ?? null,
        };

        // Store image ID if using IndexedDB
        if (typeof api.getCurrentImageId === "function") {
          const imageId = api.getCurrentImageId();
          if (imageId) {
            payload.imageSource.imageId = imageId;
            console.log(
              "[persistence] Stored image ID for IndexedDB source:",
              imageId
            );
          }
        }
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

function hasSavedGame() {
  return !!localStorage.getItem(LS_KEY);
}
function clearSavedGame() {
  localStorage.removeItem(LS_KEY);
  console.info("[persistence] Cleared save");
}

function tryOfferResume() {
  if (!hasSavedGame()) return;
  if (api && typeof api.showResumePrompt === "function") {
    api.showResumePrompt({
      onResume: () => loadGame(),
      onDiscard: () => {
        clearSavedGame();
        if (api.afterDiscard) api.afterDiscard();
      },
      onCancel: () => {},
    });
  } else if (window.confirm("Resume previous puzzle session?")) {
    loadGame();
  }
}

function loadGame() {
  if (!api) return;
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return;
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

  // Handle new image source format
  if (data.imageSource?.source) {
    const imgSource = data.imageSource.source;
    api.setImageSource(imgSource);

    // Try to load the image from the source
    const img = new Image();
    img.onload = () => {
      api.setImage(img);
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
      // Proceed without the image - pieces will be rendered as gray rectangles
      reconstructPieces(data, null);
    };

    // Check if this is an IndexedDB source
    if (imgSource.startsWith("idb:") && data.imageSource.imageId) {
      console.log(
        "[persistence] Attempting to load IndexedDB source:",
        data.imageSource.imageId
      );
      if (isIndexedDBSupported()) {
        try {
          loadImageFromDB(data.imageSource.imageId)
            .then((imageData) => {
              const url = URL.createObjectURL(imageData.blob);
              img.src = url;
              // Restore the image ID for continued use
              api.setImageId(imageData.id);
              // Clean up the blob URL after the image loads
              img.onload = () => {
                URL.revokeObjectURL(url);
                api.setImage(img);
                reconstructPieces(data, img);
              };
            })
            .catch((error) => {
              console.warn(
                "[persistence] Failed to load IndexedDB image:",
                error
              );
              console.warn(
                "[persistence] Image may have been deleted from browser storage"
              );
              reconstructPieces(data, null);
            });
          return; // Exit early to avoid executing other loading paths
        } catch (error) {
          console.warn("[persistence] IndexedDB loading failed:", error);
        }
      } else {
        console.warn("[persistence] IndexedDB not supported in this browser");
      }
      // Fallback to showing warning about missing image
      console.warn("[persistence] Cannot reload IndexedDB image");
      reconstructPieces(data, null);
      return;
    }
    // Determine if source is a URL or filename and handle accordingly
    else if (
      imgSource.startsWith("http://") ||
      imgSource.startsWith("https://")
    ) {
      // It's a URL, try to load it directly
      img.crossOrigin = "anonymous";
      img.src = imgSource;
    } else {
      // It's a filename - we can't reload it, but we should inform the user
      console.warn("[persistence] Cannot reload local file:", imgSource);
      console.warn(
        "[persistence] Please select the file again if you want to see the image"
      );
      reconstructPieces(data, null);
    }
  }
  // Fallback for old save format with embedded image data
  else if (data.image?.src) {
    const img = new Image();
    img.onload = () => {
      api.setImage(img);
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

function reconstructPieces(data, masterImage) {
  const pieces = data.pieces.map((sp) => {
    // Create temporary piece to generate path and calculate bounding frame
    const tempPiece = new Piece({
      id: -1,
      gridY: sp.gridY || 0,
      gridX: sp.gridX || 0,
      corners: sp.corners || {
        nw: { x: 0, y: 0 },
        ne: { x: sp.w, y: 0 },
        se: { x: sp.w, y: sp.h },
        sw: { x: 0, y: sp.h },
      },
      sPoints: sp.sPoints || {},
      w: sp.w,
      h: sp.h,
    });
    const path = tempPiece.generatePath();
    // Use bounding frame to determine canvas size
    const boundingFrame = tempPiece.calculateBoundingFrame();
    const cw = Math.ceil(boundingFrame.width);
    const ch = Math.ceil(boundingFrame.height);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (sp.bitmapData) {
      const img = new Image();
      img.src = sp.bitmapData;
      img.onload = () => ctx.drawImage(img, 0, 0);
    } else if (masterImage) {
      ctx.save();
      // Use same translation logic as generateJigsawPieces
      ctx.translate(-boundingFrame.topLeft.x, -boundingFrame.topLeft.y);
      ctx.clip(path);

      // Compute source rect based on actual piece boundaries
      // Use stored imgX/imgY which represent the actual corner positions (equivalent to c_nw.x, c_nw.y from generation)
      const imgX = sp.imgX ?? 0; // Fallback to 0 if missing (shouldn't happen in normal cases)
      const imgY = sp.imgY ?? 0; // Fallback to 0 if missing (shouldn't happen in normal cases)
      const imgPoint = new Point(imgX, imgY);
      const min = boundingFrame.topLeft.add(imgPoint);
      const max = boundingFrame.bottomRight.add(imgPoint);
      const srcRect = new Rectangle(min.x, min.y, max.x - min.x, max.y - min.y);

      let srcW = max.x - min.x;
      let srcH = max.y - min.y;

      const imgW = masterImage.naturalWidth || masterImage.width;
      const imgH = masterImage.naturalHeight || masterImage.height;
      const clipX = Math.max(0, srcRect.x);
      const clipY = Math.max(0, srcRect.y);
      const clipW = Math.min(srcW, imgW - clipX);
      const clipH = Math.min(srcH, imgH - clipY);

      // Adjust destination offset to align clipped region correctly with centered frame
      // After translation, coordinate system is offset by (-boundingFrame.minX, -boundingFrame.minY)
      // So destination should be relative to the piece's corner position
      const dx = clipX - imgX;
      const dy = clipY - imgY;
      ctx.drawImage(
        masterImage,
        clipX,
        clipY,
        clipW,
        clipH,
        dx,
        dy,
        clipW,
        clipH
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, cw, ch);
    }
    // Create Piece instance from deserialized data
    return new Piece({
      id: sp.id,
      gridX: sp.gridX,
      gridY: sp.gridY,
      rotation: sp.rotation,
      position: new Point(sp.displayX || 0, sp.displayY || 0),
      groupId: sp.groupId,
      edges: sp.edges,
      sPoints: sp.sPoints,
      w: sp.w,
      h: sp.h,
      scale: sp.scale,
      imgX: sp.imgX,
      imgY: sp.imgY,
      bitmap: canvas,
      path,
      corners: sp.corners || {
        nw: { x: 0, y: 0 },
        ne: { x: sp.w, y: 0 },
        se: { x: sp.w, y: sp.h },
        sw: { x: 0, y: sp.h },
      },
    });
  });
  // Assign semantic & mark legacy top-left positions for later conversion in renderer
  // Legacy support removed: assume all saved positions are internal storage coordinates.
  api.setPieces(pieces);
  if (api.renderPiecesFromState) {
    api.renderPiecesFromState();
  } else {
    api.redrawPiecesContainer();
  }
  if (
    data.ui &&
    typeof data.ui.zoomLevel === "number" &&
    typeof data.ui.panX === "number" &&
    typeof data.ui.panY === "number"
  ) {
    api.applyViewportState(data.ui);
  }
  if (data.ui?.sliderValue != null) api.setSliderValue(data.ui.sliderValue);
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
};
