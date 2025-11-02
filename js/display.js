// display.js - UI helpers for applying model state to DOM elements
// Initial utility extracted from pieceRenderer to centralize element positioning logic
// and allow future enhancements (e.g., pixel snapping, transform batching).
//
// Contract:
// - Expects piece.position to be a Point-compatible object with numeric x,y.
// - Silently no-ops if arguments are missing.
// - Returns the element for chaining.

import { Point } from "./geometry/Point.js";
import { getPieceElement } from "./interactionManager.js";
import { Util } from "./utils/Util.js";

let piecesViewport = null;
let piecesContainer = null;

// Initialize the viewport element reference
export function initViewport(
  viewportElementId = "piecesViewport",
  containerId = "piecesContainer"
) {
  piecesViewport = document.getElementById(viewportElementId);
  piecesContainer = document.getElementById(containerId);
  if (!Util.isElementValid(piecesViewport)) {
    console.warn(
      `[display] Viewport element with ID '${viewportElementId}' not found`
    );
  }
  if (!Util.isElementValid(piecesContainer)) {
    console.warn(
      `[display] Container element with ID '${containerId}' not found`
    );
  }
  return piecesViewport;
}

// Get the current viewport element
export function getViewport() {
  return piecesViewport;
}

export function applyPiecePosition(el, piece) {
  if (!el || !piece || !piece.position) return el;
  el.style.left = piece.position.x + "px";
  el.style.top = piece.position.y + "px";
  return el;
}

// Apply viewport transform (pan and zoom) to the managed viewport element
export function updateViewportTransform(panOffset, zoomLevel) {
  if (!Util.isElementValid(piecesViewport) || !panOffset) return;
  piecesViewport.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
}

// Coordinate transformation function - converts screen coordinates to viewport coordinates
export function screenToViewport(screenPoint, panOffset, zoomLevel) {
  if (
    !Util.isElementValid(piecesContainer) ||
    !screenPoint ||
    !panOffset ||
    typeof zoomLevel !== "number"
  ) {
    return new Point(0, 0);
  }

  const containerRect = piecesContainer.getBoundingClientRect();
  const relativeX = screenPoint.x - containerRect.left;
  const relativeY = screenPoint.y - containerRect.top;

  // Apply inverse zoom and pan transformation
  const viewportX = (relativeX - panOffset.x) / zoomLevel;
  const viewportY = (relativeY - panOffset.y) / zoomLevel;

  return new Point(viewportX, viewportY);
}

// Coordinate transformation function - converts viewport coordinates to screen coordinates
export function viewportToScreen(viewportPoint, panOffset, zoomLevel) {
  if (
    !piecesContainer ||
    !viewportPoint ||
    !panOffset ||
    typeof zoomLevel !== "number"
  ) {
    return new Point(0, 0);
  }

  const containerRect = piecesContainer.getBoundingClientRect();

  // Apply zoom and pan transformation
  const relativeX = viewportPoint.x * zoomLevel + panOffset.x;
  const relativeY = viewportPoint.y * zoomLevel + panOffset.y;

  const screenX = relativeX + containerRect.left;
  const screenY = relativeY + containerRect.top;

  return new Point(screenX, screenY);
}

// Function to draw piece outline with specified color
export function drawPieceOutline(piece, color, lineWidth = 3) {
  const element = getPieceElement(piece.id);

  const canvas = element.querySelector("canvas");

  if (!piece.path) {
    console.warn(`[drawPieceOutline] No path found for piece ${piece.id}`);
    return;
  }

  const ctx = canvas.getContext("2d");
  const scale = piece.scale || 0.35;
  const pad = piece.pad || 0;

  console.log(
    `[drawPieceOutline] Drawing with scale=${scale}, pad=${pad}, lineWidth=${lineWidth}`
  );

  // Save current context state
  ctx.save();

  // Clear any previous outline by redrawing the piece
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Redraw the piece bitmap
  ctx.scale(scale, scale);
  ctx.drawImage(piece.bitmap, 0, 0);

  // Draw the outline using centered bounding frame translation (same as jigsawGenerator)
  const boundingFrame = piece.calculateBoundingFrame();
  ctx.translate(pad - boundingFrame.minX, pad - boundingFrame.minY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / scale; // Adjust line width for scale
  ctx.stroke(piece.path);

  console.log(
    `[drawPieceOutline] Successfully drew outline for piece ${piece.id}`
  );

  // Restore context state
  ctx.restore();
}

// Function to clear piece outline (redraw without stroke)
export function clearPieceOutline(piece) {
  console.log(`[clearPieceOutline] Clearing outline for piece ${piece.id}`);

  const element = getPieceElement(piece.id);
  if (!element) {
    console.warn(`[clearPieceOutline] No element found for piece ${piece.id}`);
    return;
  }

  const canvas = element.querySelector("canvas");
  if (!canvas) {
    console.warn(`[clearPieceOutline] No canvas found for piece ${piece.id}`);
    return;
  }

  const ctx = canvas.getContext("2d");
  const scale = piece.scale || 0.35;

  // Save current context state
  ctx.save();

  // Clear and redraw the piece without outline
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(piece.bitmap, 0, 0);

  console.log(
    `[clearPieceOutline] Successfully cleared outline for piece ${piece.id}`
  );

  // Restore context state
  ctx.restore();
}

// Update orientation tip button visibility based on selected piece
export function updateOrientationTipButton(selectedPiece) {
  const orientationTipButton = document.getElementById("orientationTipButton");
  if (!orientationTipButton) return;

  if (selectedPiece) {
    orientationTipButton.style.display = "block";
  } else {
    orientationTipButton.style.display = "none";
  }
}

// Optional future ideas:
// - applyPieceTransform(el, piece) to handle rotation + position via CSS translate/rotate.
// - batchApply(ops[]) to reduce layout thrash.
