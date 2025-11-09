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

// Margin enforcement state
let initialMargins = null;

// Initialize the viewport element reference
export function initViewport(
  viewportElementId = "piecesViewport",
  containerId = "piecesContainer"
) {
  piecesViewport = document.getElementById(viewportElementId);
  piecesContainer = document.getElementById(containerId);
  zoomDisplay = document.getElementById("zoomDisplay");

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
  if (!Util.isElementValid(zoomDisplay)) {
    console.warn(
      `[display] Zoom display element with ID 'zoomDisplay' not found`
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
  el.style.transform = `rotate(${piece.rotation}deg)`;
  return el;
}

/**
 * Apply complete piece transformation (position and rotation) to DOM element
 * Adjusts positioning so the visual center of the piece shape aligns with the position
 * @param {HTMLElement} element - Target DOM element
 * @param {Piece} piece - Piece instance with position, rotation, and geometry data
 * @returns {HTMLElement} The element for chaining
 */
export function applyPieceTransform(element, piece) {
  if (!element || !piece) return element;

  // Calculate offset to center the actual piece shape within the canvas
  const boundingFrame = piece.calculateBoundingFrame();
  const scale = piece.scale || 0.35;

  // Calculate how much to offset the element position to center the piece shape
  const canvasCenter = new Point(
    (element.offsetWidth || piece.bitmap.width * scale) / 2,
    (element.offsetHeight || piece.bitmap.height * scale) / 2
  );
  const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
  const offset = scaledCenterOffset.sub(canvasCenter);
  const elementPosition = piece.position.sub(offset);

  // Apply position with centering offset
  element.style.left = elementPosition.x + "px";
  element.style.top = elementPosition.y + "px";
  element.style.transform = `rotate(${piece.rotation}deg)`;

  return element;
}

// Zoom and pan state getters and setters
export function getZoomLevel() {
  return zoomLevel;
}

export function setZoomLevel(newZoomLevel) {
  zoomLevel = newZoomLevel;
}

export function getPanOffset() {
  return panOffset;
}

export function setPanOffset(newPanOffset) {
  panOffset = Point.from(newPanOffset);
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
  lastPanPosition = Point.from(position);
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
    const viewportCenter = center.subtract(containerOffset);

    // Adjust pan to keep the zoom center point in the same position
    const zoomRatio = clampedZoom / oldZoom;
    const panDelta = viewportCenter.subtract(panOffset).scaled(zoomRatio);
    panOffset = viewportCenter.subtract(panDelta);
  }

  updateViewportTransform();
  updateZoomDisplay();
}

// Apply viewport transform (pan and zoom) to the managed viewport element
export function updateViewportTransform(
  panOffsetParam = null,
  zoomLevelParam = null
) {
  // Use parameters if provided, otherwise use internal state
  const currentPanOffset = panOffsetParam || panOffset;
  const currentZoomLevel = zoomLevelParam !== null ? zoomLevelParam : zoomLevel;

  // Update internal state if parameters were provided
  if (panOffsetParam) panOffset = Point.from(panOffsetParam);
  if (zoomLevelParam !== null) zoomLevel = zoomLevelParam;

  if (!Util.isElementValid(piecesViewport) || !currentPanOffset) return;
  piecesViewport.style.transform = `translate(${currentPanOffset.x}px, ${currentPanOffset.y}px) scale(${currentZoomLevel})`;
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

  console.log(
    `[drawPieceOutline] Drawing with scale=${scale}, lineWidth=${lineWidth}`
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
  ctx.translate(-boundingFrame.minX, -boundingFrame.minY);
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

// Update zoom display to show current zoom percentage
export function updateZoomDisplay() {
  if (!zoomDisplay) return;
  zoomDisplay.textContent = Math.round(zoomLevel * 100) + "%";
}

export function setInitialMargins(margins) {
  initialMargins = margins;
}

export function enforceInitialMargins(piecesBounds) {
  if (!initialMargins) {
    return;
  }

  const margin = 50;
  const minX = piecesBounds.left - margin;
  const maxX = piecesBounds.right + margin;
  const minY = piecesBounds.top - margin;
  const maxY = piecesBounds.bottom + margin;

  // Adjust pan offset to keep pieces within margins
  const currentX = panOffset.x;
  const currentY = panOffset.y;

  let newX = currentX;
  let newY = currentY;

  if (minX < -window.innerWidth / 2) {
    newX = currentX + (-window.innerWidth / 2 - minX);
  }
  if (maxX > window.innerWidth / 2) {
    newX = currentX + (window.innerWidth / 2 - maxX);
  }
  if (minY < -window.innerHeight / 2) {
    newY = currentY + (-window.innerHeight / 2 - minY);
  }
  if (maxY > window.innerHeight / 2) {
    newY = currentY + (window.innerHeight / 2 - maxY);
  }

  if (newX !== currentX || newY !== currentY) {
    panOffset = new Point(newX, newY);
    updateViewportTransform();
  }
}

// Apply visual feedback using shape outlines based on piece correctness
export function applyPieceCorrectnessVisualFeedback(piece, isCorrect) {
  if (isCorrect) {
    drawPieceOutline(piece, "#2ea862", 4); // Green outline for correct pieces
    return "correct";
  } else {
    drawPieceOutline(piece, "#c94848", 4); // Red outline for incorrect pieces
    return "incorrect";
  }
}

// Apply blinking effect for incorrect pieces
export function applyBlinkingEffectForIncorrectPieces(pieces, constants) {
  const { BLINK_INTERVAL_MS, BLINK_HALF_CYCLES, BLINK_START_DELAY_MS } =
    constants;

  // Add blinking effect for incorrect pieces
  setTimeout(() => {
    let blinkingPieces = 0;

    pieces.forEach((piece) => {
      let isCorrect = true;

      // Repeat the same correctness check as above
      if (piece.rotation !== 0) {
        isCorrect = false;
      }

      const expectedNeighbors = {
        north: pieces.find(
          (p) => p.gridX === piece.gridX && p.gridY === piece.gridY - 1
        ),
        east: pieces.find(
          (p) => p.gridX === piece.gridX + 1 && p.gridY === piece.gridY
        ),
        south: pieces.find(
          (p) => p.gridX === piece.gridX && p.gridY === piece.gridY + 1
        ),
        west: pieces.find(
          (p) => p.gridX === piece.gridX - 1 && p.gridY === piece.gridY
        ),
      };

      Object.entries(expectedNeighbors).forEach(
        ([direction, expectedNeighbor]) => {
          if (expectedNeighbor) {
            if (piece.groupId !== expectedNeighbor.groupId) {
              isCorrect = false;
            } else {
              // Check if neighbor is correctly positioned by comparing corner alignment
              const positionIsCorrect = piece.isNeighbor(
                expectedNeighbor,
                direction
              );

              if (!positionIsCorrect) {
                isCorrect = false;
              }
            }
          }
        }
      );

      // Create blinking effect for incorrect pieces
      if (!isCorrect) {
        blinkingPieces++;

        // Cycle between clear and red outline for blinking effect
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
          console.log(
            `[checkPuzzleCorrectness] Blink ${blinkCount} for piece ${piece.id}`
          );

          if (blinkCount % 2 === 0) {
            clearPieceOutline(piece);
          } else {
            drawPieceOutline(piece, "#c94848", 4);
          }
          blinkCount++;

          if (blinkCount >= BLINK_HALF_CYCLES) {
            // Blink 4 times (8 half-cycles)
            clearInterval(blinkInterval);
            drawPieceOutline(piece, "#c94848", 4); // End with red outline
          }
        }, BLINK_INTERVAL_MS); // intervals for blinking
      }
    });

    console.log(
      `[checkPuzzleCorrectness] Started blinking for ${blinkingPieces} pieces`
    );
  }, BLINK_START_DELAY_MS); // Small delay before starting blink effect
}

// Export zoom constants for use by other modules
export {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP_FACTOR,
  WHEEL_ZOOM_IN_FACTOR,
  WHEEL_ZOOM_OUT_FACTOR,
};

// Optional future ideas:
// - applyPieceTransform(el, piece) to handle rotation + position via CSS translate/rotate.
// - batchApply(ops[]) to reduce layout thrash.
