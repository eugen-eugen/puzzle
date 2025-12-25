// display.js - UI helpers for applying model state to DOM elements
// Initial utility extracted from pieceRenderer to centralize element positioning logic
// and allow future enhancements (e.g., pixel snapping, transform batching).
//
// Contract:
// - Piece position is managed by gameTableController, retrieved via getPiecePosition(id).
// - Silently no-ops if arguments are missing.
// - Returns the element for chaining.

import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import { getPieceElement } from "../piece-renderer.js";
import { Util } from "../utils/numeric-util.js";
import { state } from "../game-engine.js";
import { gameTableController } from "../logic/game-table-controller.js";
import {
  PIECES_GENERATED,
  PIECE_SELECT,
  PIECE_DESELECT,
  PIECE_DETACH_ANIMATION,
  PIECE_LONG_PRESS_START,
  PIECE_LONG_PRESS_END,
} from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";

// Display Constants
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_STEP_FACTOR = 1.2; // Button zoom multiplier
const WHEEL_ZOOM_IN_FACTOR = 1.1; // Mouse wheel up (zoom in)
const WHEEL_ZOOM_OUT_FACTOR = 0.9; // Mouse wheel down (zoom out)

let piecesViewport = null;
let piecesContainer = null;
let zoomDisplay = null;

// Zoom and pan state
let zoomLevel = 1.0;
let panOffset = new Point(0, 0);
let isPanning = false;
let lastPanPosition = new Point(0, 0);

// Piece elements reference for z-index management
let pieceElementsMap = null;

// Cached debug outline width (calculated once per game)
let debugOutlineWidth = 4;

// Listen for pieces generation event to calculate debug outline width
registerGlobalEvent(
  PIECES_GENERATED,
  (event) => {
    const totalPieces = event.detail.totalPieces || 20;
    debugOutlineWidth = 8 * Math.sqrt(Math.sqrt(20 / totalPieces));
  },
  window
);

// Register listeners for piece UI events
registerGlobalEvent(PIECE_SELECT, (event) => {
  const { pieceId } = event.detail;
  const el = pieceElementsMap?.get(pieceId);
  if (el) el.classList.add("selected");
});

registerGlobalEvent(PIECE_DESELECT, (event) => {
  const { pieceId } = event.detail;
  const el = pieceElementsMap?.get(pieceId);
  if (el) el.classList.remove("selected");
});

registerGlobalEvent(PIECE_DETACH_ANIMATION, (event) => {
  const { pieceId } = event.detail;
  const el = pieceElementsMap?.get(pieceId);
  if (el) {
    el.classList.add("detached-piece");
    setTimeout(() => el.classList.remove("detached-piece"), 1000);
  }
});

registerGlobalEvent(PIECE_LONG_PRESS_START, (event) => {
  const { pieceId } = event.detail;
  const el = pieceElementsMap?.get(pieceId);
  if (el) el.classList.add("long-press-active");
});

registerGlobalEvent(PIECE_LONG_PRESS_END, (event) => {
  const { pieceId } = event.detail;
  const el = pieceElementsMap?.get(pieceId);
  if (el) el.classList.remove("long-press-active");
});

// Initialize the viewport element reference
export function initViewport() {
  piecesViewport = document.getElementById("piecesViewport");
  piecesContainer = document.getElementById("piecesContainer");
  zoomDisplay = document.getElementById("zoomDisplay");

  return piecesViewport;
}

// Get the current viewport element
export function getViewport() {
  return piecesViewport;
}

/**
 * Get current viewport state (zoom and pan)
 * @returns {Object} Viewport state with zoomLevel, panX, panY
 */
export function getViewportState() {
  return {
    zoomLevel: zoomLevel,
    panX: panOffset.x,
    panY: panOffset.y,
  };
}

/**
 * Apply viewport state (zoom and pan)
 * @param {Object} v - Viewport state with zoomLevel, panX, panY
 */
export function applyViewportState(v) {
  setZoom(v.zoomLevel);
  panOffset = new Point(v.panX, v.panY);
  updateViewportTransform();
  updateZoomDisplay();
}

/**
 * Clear all piece outlines
 */
export function clearAllPieceOutlines() {
  if (Util.isArrayEmpty(state.pieces)) return;

  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });
}

/**
 * Apply complete piece transformation (position and rotation) to DOM element
 * Adjusts positioning so the visual center of the piece shape aligns with the position
 * @param {Piece} piece - Piece instance with position, rotation, and geometry data
 * @returns {HTMLElement} The element for chaining
 */
export function applyPieceTransform(piece) {
  if (!piece) return null;

  const element = getPieceElement(piece.id);
  if (!element) return null;

  // Calculate offset to center the actual piece shape within the canvas
  const boundingFrame = piece.calculateBoundingFrame();

  // Calculate how much to offset the element position to center the piece shape
  const canvasCenter = new Point(
    element.offsetWidth,
    element.offsetHeight
  ).scaled(0.5);
  const scaledCenterOffset = boundingFrame.centerOffset.scaled(piece.scale);
  const offset = scaledCenterOffset.sub(canvasCenter);
  const elementPosition = gameTableController
    .getPiecePosition(piece.id)
    .sub(offset);

  // Apply position with centering offset
  element.style.left = elementPosition.x + "px";
  element.style.top = elementPosition.y + "px";
  element.style.transform = `rotate(${piece.rotation}deg)`;

  return element;
}

/**
 * Set the piece elements map for z-index management
 * @param {Map<number, HTMLElement>} pieceElements - Map of piece IDs to elements
 */
export function setPieceElements(pieceElements) {
  pieceElementsMap = pieceElements;
}

/**
 * Apply z-index to a piece element
 * @param {number} pieceId - The piece ID
 * @param {number} zIndex - The z-index value to apply
 */
export function applyPieceZIndex(pieceId, zIndex) {
  const el = pieceElementsMap?.get(pieceId);
  if (el) {
    el.style.zIndex = zIndex.toString();
  }
}

/**
 * Apply grayscale filter to the viewport
 * Reads removeColor setting from state or localStorage
 */
export function applyViewportGrayscaleFilter() {
  if (!piecesViewport) return;
  // Check state first, fallback to localStorage
  const removeColorFromState = state.deepLinkRemoveColor;
  const removeColorFromStorage = localStorage.getItem("removeColor");
  const removeColor = removeColorFromState || removeColorFromStorage;

  if (removeColor === "y") {
    piecesViewport.style.filter = "grayscale(100%)";
  } else {
    piecesViewport.style.filter = "none";
  }
}

// Zoom and pan state getters and setters
export function getZoomLevel() {
  return zoomLevel;
}

export function getPanOffset() {
  return panOffset;
}

export function setPanOffset(newPanOffset) {
  panOffset = newPanOffset;
  updateViewportTransform();
}

export function getIsPanning() {
  return isPanning;
}

export function setIsPanning(panning) {
  isPanning = panning;
}

export function getLastPanPosition() {
  return lastPanPosition;
}

export function setLastPanPosition(position) {
  lastPanPosition = position;
}

// Zoom function with optional center point
export function setZoom(newZoomLevel, center = null) {
  const oldZoom = zoomLevel;
  const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
  zoomLevel = clampedZoom;

  // If zoom center is provided, adjust pan to zoom to that point
  if (center && piecesContainer) {
    const containerRect = piecesContainer.getBoundingClientRect();
    const containerOffset = new Point(containerRect.left, containerRect.top);
    const viewportCenter = center.sub(containerOffset);

    // Adjust pan to keep the zoom center point in the same position
    const zoomRatio = clampedZoom / oldZoom;
    const panDelta = viewportCenter.sub(panOffset).scaled(zoomRatio);
    panOffset = viewportCenter.sub(panDelta);
  }

  updateViewportTransform();
  updateZoomDisplay();
}

// Apply viewport transform (pan and zoom) to the managed viewport element
function updateViewportTransform() {
  if (!Util.isElementValid(piecesViewport) || !panOffset) return;
  piecesViewport.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
}

// Function to draw piece outline with specified color
export function drawPieceOutline(piece, color, lineWidth = 3) {
  if (!piece.path) {
    console.warn(`[drawPieceOutline] No path found for piece ${piece.id}`);
    return;
  }

  // Clear any previous outline by redrawing the piece
  clearPieceOutline(piece);

  // Add the outline on top
  const element = getPieceElement(piece.id);
  const canvas = element.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const scale = piece.scale;

  ctx.save();
  // Draw the outline using centered bounding frame translation (same as jigsawGenerator)
  const boundingFrame = piece.calculateBoundingFrame();
  ctx.scale(scale, scale);
  ctx.translate(-boundingFrame.topLeft.x, -boundingFrame.topLeft.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / scale; // Adjust line width for scale
  ctx.stroke(piece.path);
  ctx.restore();
}

// Function to clear piece outline (redraw without stroke)
export function clearPieceOutline(piece) {
  const element = getPieceElement(piece.id);
  if (!element) {
    return;
  }

  const canvas = element.querySelector("canvas");
  if (!canvas) {
    console.warn(`[clearPieceOutline] No canvas found for piece ${piece.id}`);
    return;
  }

  const ctx = canvas.getContext("2d");

  // Save current context state
  ctx.save();

  // Clear and redraw the piece without outline
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(piece.scale, piece.scale);
  ctx.drawImage(piece.bitmap, 0, 0);

  // Restore context state
  ctx.restore();
}

// Update orientation tip button visibility based on selected piece
export function updateOrientationTipButton(selectedPiece) {
  const orientationTipButton = document.getElementById("orientationTipButton");
  if (!orientationTipButton) return;

  // Hide button if rotation is disabled or no piece is selected
  if (state.noRotate || !selectedPiece) {
    orientationTipButton.style.display = "none";
  } else if (selectedPiece) {
    orientationTipButton.style.display = "block";
  }
}

// Update zoom display to show current zoom percentage
export function updateZoomDisplay() {
  if (!zoomDisplay) return;
  zoomDisplay.textContent = Math.round(zoomLevel * 100) + "%";
}

// Apply visual feedback using shape outlines based on piece correctness
export function applyPieceCorrectnessVisualFeedback(piece, isCorrect) {
  if (isCorrect) {
    drawPieceOutline(piece, "#2ea862", 4); // Green outline for correct pieces
  } else {
    drawPieceOutline(piece, "#c94848", 4); // Red outline for incorrect pieces
  }
}

// Export zoom constants for use by other modules
export {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP_FACTOR,
  WHEEL_ZOOM_IN_FACTOR,
  WHEEL_ZOOM_OUT_FACTOR,
};

/**
 * Apply highlight to piece(s)
 * @param {string|Array<string>|null} pieceId - Single piece ID, array of IDs, or null to clear
 */
export function applyHighlight(pieceId) {
  if (!pieceElementsMap) return;

  pieceElementsMap.forEach((el) => el.classList.remove("candidate-highlight"));
  if (pieceId == null) return;

  // Handle both single ID and array of IDs
  const pieceIds = Array.isArray(pieceId) ? pieceId : [pieceId];

  pieceIds.forEach((id) => {
    const el = pieceElementsMap.get(id);
    if (el) el.classList.add("candidate-highlight");
  });
}

// Drawing Constants
const DEBUG_OUTLINE_COLOR = "#D2691E"; // Ahorn (maple) autumn color

/**
 * Darken a hex color by a given amount
 * @param {string} color - Hex color string (e.g., "#ff00aa")
 * @param {number} amount - Amount to darken (0-1)
 * @returns {string} RGB color string
 */
function darkenColor(color, amount) {
  const hex = color.replace("#", "");
  const r = Math.max(0, parseInt(hex.substring(0, 2), 16) * (1 - amount));
  const g = Math.max(0, parseInt(hex.substring(2, 4), 16) * (1 - amount));
  const b = Math.max(0, parseInt(hex.substring(4, 6), 16) * (1 - amount));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * Lighten a hex color by a given amount
 * @param {string} color - Hex color string (e.g., "#ff00aa")
 * @param {number} amount - Amount to lighten (0-1)
 * @returns {string} RGB color string
 */
function lightenColor(color, amount) {
  const hex = color.replace("#", "");
  const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + 255 * amount);
  const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + 255 * amount);
  const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + 255 * amount);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * Draw a piece to a canvas using its bounding frame and path.
 * @param {Rectangle} boundingFrame - The bounding frame of the piece
 * @param {Path2D} path - The piece path
 * @param {Point} nw - The northwest corner position in image coordinates
 * @param {HTMLCanvasElement} master - The master canvas containing the full image
 * @returns {HTMLCanvasElement} The canvas with the drawn piece
 */
export function drawPiece(boundingFrame, path, nw, master) {
  // Use bounding frame dimensions directly for canvas
  const pw = Math.ceil(boundingFrame.width);
  const ph = Math.ceil(boundingFrame.height);
  // Compute source rect based on actual piece boundaries
  const minPoint = boundingFrame.topLeft.add(nw);
  const maxPoint = boundingFrame.bottomRight.add(nw);

  let srcX = minPoint.x;
  let srcY = minPoint.y;
  let srcW = maxPoint.x - minPoint.x;
  let srcH = maxPoint.y - minPoint.y;

  // Clamp to master image bounds
  const clipX = Math.max(0, srcX);
  const clipY = Math.max(0, srcY);
  const clipW = Math.min(srcW, master.width - clipX);
  const clipH = Math.min(srcH, master.height - clipY);

  // Adjust destination offset to align clipped region correctly with centered frame
  // After translation, coordinate system is offset by (-boundingFrame.topLeft.x, -boundingFrame.topLeft.y)
  // So destination should be relative to the piece's corner position
  const dx = clipX - nw.x;
  const dy = clipY - nw.y;
  const canvas = document.createElement("canvas");
  canvas.width = pw + 2 * debugOutlineWidth;
  canvas.height = ph + 2 * debugOutlineWidth;
  const ctx = canvas.getContext("2d");
  ctx.translate(
    -boundingFrame.topLeft.x + debugOutlineWidth,
    -boundingFrame.topLeft.y + debugOutlineWidth
  );
  ctx.save();
  // Center the bounding frame in the canvas
  ctx.clip(path);
  ctx.drawImage(master, clipX, clipY, clipW, clipH, dx, dy, clipW, clipH);
  ctx.restore();

  // Round the path vertices
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Dark shadow/bottom edge
  ctx.strokeStyle = darkenColor(DEBUG_OUTLINE_COLOR, 0.4);
  ctx.lineWidth = debugOutlineWidth;
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.stroke(path);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Main color
  ctx.strokeStyle = DEBUG_OUTLINE_COLOR;
  ctx.lineWidth = debugOutlineWidth;
  ctx.stroke(path);

  // Light highlight/top edge
  ctx.strokeStyle = lightenColor(DEBUG_OUTLINE_COLOR, 0.3);
  ctx.lineWidth = debugOutlineWidth / 2;
  ctx.stroke(path);

  ctx.restore();
  return canvas;
}

/**
 * Ensure a rectangle (position + size) is visible in the viewport
 * Adjusts zoom and pan as needed to fit the rectangle
 * @param {Point} position - Top-left position of the rectangle in world coordinates
 * @param {Point} size - Size of the rectangle
 * @param {Object} options - Options including forceZoom flag
 */
export function ensureRectInView(position, size, options = {}) {
  const { forceZoom = false } = options;
  if (!Util.isElementValid(piecesContainer)) return;
  const contW = piecesContainer.clientWidth;
  const contH = piecesContainer.clientHeight;

  // Helper to compute screen coords under current transform
  function rectOnScreen() {
    const scaledPosition = position.scaled(zoomLevel);
    const screenPosition = panOffset.add(scaledPosition);
    const scaledSize = size.scaled(zoomLevel);

    const topLeft = screenPosition;
    const bottomRight = screenPosition.add(scaledSize);
    return { topLeft, bottomRight };
  }

  // Special overflow-based zoom logic when forceZoom is requested:
  // We intentionally skip the initial pan so the raw overflow drives a proportional zoom-out.
  let r = rectOnScreen();
  if (forceZoom) {
    const overflowLeft = Math.max(0, -r.topLeft.x);
    const overflowRight = Math.max(0, r.bottomRight.x - contW);
    const overflowTop = Math.max(0, -r.topLeft.y);
    const overflowBottom = Math.max(0, r.bottomRight.y - contH);
    const horizOverflow = overflowLeft + overflowRight;
    const vertOverflow = overflowTop + overflowBottom;
    const anyOverflow = horizOverflow > 0 || vertOverflow > 0;

    if (anyOverflow) {
      // Compute shrink factors based on total span = visible + overflow
      const factorH = horizOverflow > 0 ? contW / (contW + horizOverflow) : 1;
      const factorV = vertOverflow > 0 ? contH / (contH + vertOverflow) : 1;
      const minFactor = Math.min(factorH, factorV);
      if (minFactor < 0.999) {
        // avoid micro adjustments
        const targetZoom = Math.max(MIN_ZOOM, zoomLevel * minFactor);
        if (targetZoom < zoomLevel - 0.0001) {
          setZoom(targetZoom);
          r = rectOnScreen();
        }
      }
    }
    // After potential zoom, clamp pan to fit the rectangle fully.
    if (r.topLeft.x < 0) panOffset = panOffset.add(new Point(-r.topLeft.x, 0));
    if (r.topLeft.y < 0) panOffset = panOffset.add(new Point(0, -r.topLeft.y));
    if (r.bottomRight.x > contW)
      panOffset = panOffset.sub(new Point(r.bottomRight.x - contW, 0));
    if (r.bottomRight.y > contH)
      panOffset = panOffset.sub(new Point(0, r.bottomRight.y - contH));
    updateViewportTransform();
    return; // Done for forceZoom path
  }

  // Normal path (not forceZoom): try panning first, then fallback to simple zoom-fit only if still overflowing.
  let panAdjusted = false;
  if (r.topLeft.x < 0) {
    panOffset = panOffset.add(new Point(-r.topLeft.x, 0));
    panAdjusted = true;
  }
  if (r.topLeft.y < 0) {
    panOffset = panOffset.add(new Point(0, -r.topLeft.y));
    panAdjusted = true;
  }
  if (r.bottomRight.x > contW) {
    panOffset = panOffset.sub(new Point(r.bottomRight.x - contW, 0));
    panAdjusted = true;
  }
  if (r.bottomRight.y > contH) {
    panOffset = panOffset.sub(new Point(0, r.bottomRight.y - contH));
    panAdjusted = true;
  }
  if (panAdjusted) {
    updateViewportTransform();
    r = rectOnScreen();
  }
  const overflow =
    r.topLeft.x < 0 ||
    r.topLeft.y < 0 ||
    r.bottomRight.x > contW ||
    r.bottomRight.y > contH;
  if (overflow) {
    // Fit logic (piece-centric) — only shrink if needed; no margin here.
    const fitZoomW = contW / size.x;
    const fitZoomH = contH / size.y;
    const targetZoom = Math.min(zoomLevel, fitZoomW, fitZoomH);
    if (targetZoom < zoomLevel - 0.0005) {
      setZoom(Math.max(MIN_ZOOM, targetZoom));
      r = rectOnScreen();
      if (r.topLeft.x < 0)
        panOffset = panOffset.add(new Point(-r.topLeft.x, 0));
      if (r.topLeft.y < 0)
        panOffset = panOffset.add(new Point(0, -r.topLeft.y));
      if (r.bottomRight.x > contW)
        panOffset = panOffset.sub(new Point(r.bottomRight.x - contW, 0));
      if (r.bottomRight.y > contH)
        panOffset = panOffset.sub(new Point(0, r.bottomRight.y - contH));
      updateViewportTransform();
      updateZoomDisplay();
    }
  }
}

/**
 * Fit ALL current pieces into the visible viewport by:
 * 1. Computing the bounding rectangle R of every piece's (position.x, position.y, width, height)
 *    (rotation is ignored; we use the element's unrotated box which is usually adequate).
 * 2. Determining the zoom that allows R to fully fit (preserving aspect ratio) inside the container.
 *    This zoom may increase or decrease the current zoom but is clamped to [MIN_ZOOM, MAX_ZOOM].
 * 3. Applying that zoom.
 * 4. Positioning (pan) so that the top‑left of R aligns exactly with the top‑left of the viewport
 *    (i.e. R.left = 0, R.top = 0 in screen coordinates).
 * 5. Resetting the preserved initial margins so subsequent margin enforcement does not undo this alignment.
 *
 * Typical trigger: a moved piece exits the visible window bounds and the caller wants to refocus
 * the entire puzzle instead of only the moved piece.
 */
export function fitAllPiecesInView() {
  if (Util.isArrayEmpty(state.pieces)) return;
  const contW = piecesContainer?.clientWidth || 0;
  const contH = piecesContainer?.clientHeight || 0;
  if (contW === 0 || contH === 0) return;

  const bounds = gameTableController.calculatePiecesBounds(state.pieces);

  if (!bounds) return;
  const minX = bounds.topLeft.x;
  const minY = bounds.topLeft.y;
  const maxX = bounds.bottomRight.x;
  const maxY = bounds.bottomRight.y;

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY))
    return;
  const rectW = Math.max(1, maxX - minX);
  const rectH = Math.max(1, maxY - minY);

  // Compute zoom to fit entire rectangle.
  const fitZoom = Math.min(contW / rectW, contH / rectH);
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
  setZoom(newZoom);

  // Align top-left of bounding rect with viewport origin.
  panOffset = new Point(-minX * newZoom, -minY * newZoom);
  updateViewportTransform();
}

// Optional future ideas:
// - batchApply(ops[]) to reduce layout thrash.
