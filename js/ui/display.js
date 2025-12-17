// display.js - UI helpers for applying model state to DOM elements
// Initial utility extracted from pieceRenderer to centralize element positioning logic
// and allow future enhancements (e.g., pixel snapping, transform batching).
//
// Contract:
// - Piece position is managed by gameTableController, retrieved via getPiecePosition(id).
// - Silently no-ops if arguments are missing.
// - Returns the element for chaining.

import { Point } from "../geometry/point.js";
import { getPieceElement } from "../piece-renderer.js";
import { Util } from "../utils/util.js";
import { state } from "../game-engine.js";
import { gameTableController } from "../game-table-controller.js";

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
 * @param {boolean} removeColor - Whether to apply grayscale (true) or remove it (false)
 */
export function applyViewportGrayscaleFilter(removeColor) {
  if (!piecesViewport) return;
  if (removeColor) {
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
  ctx.scale(piece.scale, scapiece.scalele);
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
const DEBUG_OUTLINE_COLOR = "#ff00aa";
const DEBUG_OUTLINE_WIDTH = 1.25;

/**
 * Draw a piece to a canvas using its bounding frame and path.
 * @param {Piece} tempPiece - The piece to draw
 * @param {Point} nw - The northwest corner position in image coordinates
 * @param {HTMLCanvasElement} master - The master canvas containing the full image
 * @returns {HTMLCanvasElement} The canvas with the drawn piece
 */
export function drawPiece(tempPiece, nw, master) {
  const boundingFrame = tempPiece.calculateBoundingFrame();
  const path = tempPiece.path;
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
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d");
  ctx.save();
  // Center the bounding frame in the canvas
  ctx.translate(-boundingFrame.topLeft.x, -boundingFrame.topLeft.y);
  ctx.clip(path);
  ctx.drawImage(master, clipX, clipY, clipW, clipH, dx, dy, clipW, clipH);
  ctx.restore();
  // Debug outline (optional)
  ctx.save();
  ctx.translate(-boundingFrame.topLeft.x, -boundingFrame.topLeft.y);
  ctx.strokeStyle = DEBUG_OUTLINE_COLOR;
  ctx.lineWidth = DEBUG_OUTLINE_WIDTH;
  ctx.stroke(path);
  ctx.restore();
  return canvas;
}

// Optional future ideas:
// - batchApply(ops[]) to reduce layout thrash.
