// app.js - bootstrap for piece box window
import { initCommChannel } from "./windowManager.js";
import { processImage } from "./imageProcessor.js";
import { generateJigsawPieces } from "./jigsawGenerator.js";
import {
  scatterInitialPieces,
  getPieceElement,
  renderPiecesAtPositions,
} from "./pieceRenderer.js";
// Persistence (lazy-loaded after definitions to avoid circular issues)
// We'll dynamically import persistence so this file can export helpers first.
import { state } from "./gameEngine.js";
import { initI18n, t, applyTranslations } from "./i18n.js";

// ================================
// Module Constants (replacing magic numbers)
// ================================
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const ZOOM_STEP_FACTOR = 1.2; // Button zoom multiplier
const WHEEL_ZOOM_IN_FACTOR = 1.1; // Mouse wheel up (zoom in)
const WHEEL_ZOOM_OUT_FACTOR = 0.9; // Mouse wheel down (zoom out)
const LOG_SCALE_MAX_EXP = 3; // Slider maps 0..100 => 10^0 .. 10^3
const MAX_PIECES = 1000; // Clamp maximum piece count for UI
const BASE_EXPECTED_PIECE_SIZE = 100; // Heuristic size unit for correctness checks
const DEFAULT_CORRECTNESS_SCALE_FALLBACK = 0.35; // Fallback scale if piece.scale missing
const NEIGHBOR_POSITION_TOLERANCE_FACTOR = 0.5; // Fraction of expected size allowed for neighbor deltas
const BLINK_INTERVAL_MS = 300; // Interval between blink frames
const BLINK_HALF_CYCLES = 8; // Half cycles (on/off) => 4 full blinks
const BLINK_START_DELAY_MS = 100; // Delay before starting blink effect

const imageInput = document.getElementById("imageInput");
const pieceSlider = document.getElementById("pieceSlider");
const pieceDisplay = document.getElementById("pieceDisplay");
const progressDisplay = document.getElementById("progressDisplay");
const piecesContainer = document.getElementById("piecesContainer");
const piecesViewport = document.getElementById("piecesViewport");
const checkButton = document.getElementById("checkButton");
const helpButton = document.getElementById("helpButton");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const zoomInButton = document.getElementById("zoomInButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomDisplay = document.getElementById("zoomDisplay");

let currentImage = null;
let isGenerating = false;
let persistence = null; // module ref once loaded

// Zoom and pan state
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;

// Preserve initial left/top screen-space margins of the piece cluster so they don't grow.
let initialMarginLeft = null;
let initialMarginTop = null;

function captureInitialMargins() {
  if (!state.pieces || state.pieces.length === 0) return;
  // Compute bounding box (logical coordinates)
  let minX = Infinity;
  let minY = Infinity;
  for (const p of state.pieces) {
    if (typeof p.displayX === "number" && p.displayX < minX) minX = p.displayX;
    if (typeof p.displayY === "number" && p.displayY < minY) minY = p.displayY;
  }
  if (!isFinite(minX) || !isFinite(minY)) return;
  const screenLeft = panX + minX * zoomLevel;
  const screenTop = panY + minY * zoomLevel;
  initialMarginLeft = screenLeft;
  initialMarginTop = screenTop;
  // console.debug('[viewport] captured initial margins', initialMarginLeft, initialMarginTop);
}

function enforceInitialMargins() {
  if (initialMarginLeft == null || initialMarginTop == null) return;
  if (!state.pieces || state.pieces.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  for (const p of state.pieces) {
    if (typeof p.displayX === "number" && p.displayX < minX) minX = p.displayX;
    if (typeof p.displayY === "number" && p.displayY < minY) minY = p.displayY;
  }
  if (!isFinite(minX) || !isFinite(minY)) return;
  const screenLeft = panX + minX * zoomLevel;
  const screenTop = panY + minY * zoomLevel;
  let adjusted = false;
  if (screenLeft > initialMarginLeft + 0.5) {
    // allow tiny tolerance
    panX -= screenLeft - initialMarginLeft;
    adjusted = true;
  }
  if (screenTop > initialMarginTop + 0.5) {
    panY -= screenTop - initialMarginTop;
    adjusted = true;
  }
  if (adjusted) {
    updateViewportTransform();
  }
}

// Convert slider position (0-100) to piece count using logarithmic scale
function sliderToPieceCount(sliderValue) {
  if (sliderValue === 0) return 0;
  const logValue = (sliderValue / 100) * LOG_SCALE_MAX_EXP;
  const pieces = Math.round(Math.pow(10, logValue));
  return Math.max(1, Math.min(MAX_PIECES, pieces));
}

// Update the piece count display
function updatePieceDisplay() {
  const pieceCount = sliderToPieceCount(parseInt(pieceSlider.value));
  pieceDisplay.textContent = pieceCount;
}

// Zoom and Pan functions
function updateViewportTransform() {
  piecesViewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function updateZoomDisplay() {
  zoomDisplay.textContent = Math.round(zoomLevel * 100) + "%";
}

function setZoom(newZoomLevel, centerX = null, centerY = null) {
  const oldZoom = zoomLevel;
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));

  // If zoom center is provided, adjust pan to zoom to that point
  if (centerX !== null && centerY !== null) {
    const containerRect = piecesContainer.getBoundingClientRect();
    const viewportCenterX = centerX - containerRect.left;
    const viewportCenterY = centerY - containerRect.top;

    // Adjust pan to keep the zoom center point in the same position
    panX = viewportCenterX - (viewportCenterX - panX) * (zoomLevel / oldZoom);
    panY = viewportCenterY - (viewportCenterY - panY) * (zoomLevel / oldZoom);
  }

  updateViewportTransform();
  updateZoomDisplay();
}

function resetZoomAndPan() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  updateViewportTransform();
  updateZoomDisplay();
}

function getCurrentZoom() {
  return zoomLevel;
}

/**
 * Ensure a rectangle is fully visible inside the puzzle container viewport.
 *
 * Coordinate Spaces:
 * - (x, y, w, h) are in *viewport (logical puzzle)* coordinates – i.e. the same
 *   coordinate system used for piece.displayX / piece.displayY before the zoom & pan
 *   transform is applied.
 * - Current transform: screenPosition = (viewport * zoomLevel) + pan.
 *
 * Behavior:
 * 1. (Default) Attempts to satisfy visibility by adjusting pan only (no zoom change),
 *    clamping the rectangle so it lies completely within the container.
 * 2. If after panning the rectangle still overflows OR the caller explicitly sets
 *    forceZoom = true (e.g. piece previously marked outside a threshold), it computes
 *    the minimal zoom-out required so the rectangle fits (with a small margin when
 *    forced) and applies that new zoom level (never zooms in – only preserves or
 *    decreases zoom).
 * 3. After any zoom adjustment, pan is re‑clamped so the rectangle is fully on screen.
 *
 * forceZoom rationale:
 * - Drag logic may detect a piece has crossed an "outside threshold" before it is
 *   truly clipped (e.g. early warning). Passing { forceZoom: true } guarantees we
 *   evaluate a margin‑fit zoom instead of relying solely on overflow state.
 *
 * Idempotency & Limits:
 * - Never increases zoomLevel.
 * - Respects MIN_ZOOM.
 * - Performs at most one zoom operation per invocation.
 *
 * Performance Notes:
 * - O(1); no DOM queries beyond existing cached container metrics.
 * - Called at drag/rotation end – not per frame – to keep interaction smooth.
 *
 * @param {number} x Logical left of the rectangle (viewport coordinates, before transform).
 * @param {number} y Logical top of the rectangle (viewport coordinates, before transform).
 * @param {number} w Logical width of the rectangle.
 * @param {number} h Logical height of the rectangle.
 * @param {Object} [options] Optional behavior overrides.
 * @param {boolean} [options.forceZoom=false] If true, always consider a margin fit zoom
 *   (even if current pan could suffice) – used when a piece was previously flagged as
 *   near/over a visibility threshold.
 *
 * @example
 * // After finishing a drag:
 * ensureRectInView(piece.displayX, piece.displayY, el.offsetWidth, el.offsetHeight);
 *
 * @example
 * // Force a slight zoom‑out if piece was flagged outside early warning bounds:
 * ensureRectInView(px, py, pw, ph, { forceZoom: true });
 */
function ensureRectInView(x, y, w, h, options = {}) {
  const { forceZoom = false } = options;
  if (!piecesContainer) return;
  const contW = piecesContainer.clientWidth;
  const contH = piecesContainer.clientHeight;

  // Helper to compute screen coords under current transform
  function rectOnScreen() {
    const left = panX + x * zoomLevel;
    const top = panY + y * zoomLevel;
    const width = w * zoomLevel;
    const height = h * zoomLevel;
    return { left, top, right: left + width, bottom: top + height };
  }

  // Special overflow-based zoom logic when forceZoom is requested:
  // We intentionally skip the initial pan so the raw overflow drives a proportional zoom-out.
  let r = rectOnScreen();
  if (forceZoom) {
    const overflowLeft = Math.max(0, -r.left);
    const overflowRight = Math.max(0, r.right - contW);
    const overflowTop = Math.max(0, -r.top);
    const overflowBottom = Math.max(0, r.bottom - contH);
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
          zoomLevel = targetZoom;
          updateViewportTransform();
          updateZoomDisplay();
          r = rectOnScreen();
        }
      }
    }
    // After potential zoom, clamp pan to fit the rectangle fully.
    if (r.left < 0) panX += -r.left;
    if (r.top < 0) panY += -r.top;
    if (r.right > contW) panX -= r.right - contW;
    if (r.bottom > contH) panY -= r.bottom - contH;
    updateViewportTransform();
    return; // Done for forceZoom path
  }

  // Normal path (not forceZoom): try panning first, then fallback to simple zoom-fit only if still overflowing.
  let panAdjusted = false;
  if (r.left < 0) {
    panX += -r.left;
    panAdjusted = true;
  }
  if (r.top < 0) {
    panY += -r.top;
    panAdjusted = true;
  }
  if (r.right > contW) {
    panX -= r.right - contW;
    panAdjusted = true;
  }
  if (r.bottom > contH) {
    panY -= r.bottom - contH;
    panAdjusted = true;
  }
  if (panAdjusted) {
    updateViewportTransform();
    r = rectOnScreen();
  }
  const overflow =
    r.left < 0 || r.top < 0 || r.right > contW || r.bottom > contH;
  if (overflow) {
    // Fit logic (piece-centric) — only shrink if needed; no margin here.
    const fitZoomW = contW / w;
    const fitZoomH = contH / h;
    const targetZoom = Math.min(zoomLevel, fitZoomW, fitZoomH);
    if (targetZoom < zoomLevel - 0.0005) {
      zoomLevel = Math.max(MIN_ZOOM, targetZoom);
      updateViewportTransform();
      r = rectOnScreen();
      if (r.left < 0) panX += -r.left;
      if (r.top < 0) panY += -r.top;
      if (r.right > contW) panX -= r.right - contW;
      if (r.bottom > contH) panY -= r.bottom - contH;
      updateViewportTransform();
      updateZoomDisplay();
    } else if (panAdjusted) {
      updateViewportTransform();
    }
  } else if (panAdjusted) {
    updateViewportTransform();
  }
}

function getViewportState() {
  return { zoomLevel, panX, panY };
}

function applyViewportState(v) {
  if (!v) return;
  if (typeof v.zoomLevel === "number") zoomLevel = v.zoomLevel;
  if (typeof v.panX === "number") panX = v.panX;
  if (typeof v.panY === "number") panY = v.panY;
  updateViewportTransform();
  updateZoomDisplay();
}

function getSliderValue() {
  return parseInt(pieceSlider.value, 10) || 0;
}

function setSliderValue(val) {
  pieceSlider.value = String(val);
  updatePieceDisplay();
}

function getCurrentImage() {
  return currentImage;
}

// Coordinate transformation functions
function screenToViewport(screenX, screenY) {
  const containerRect = piecesContainer.getBoundingClientRect();
  const relativeX = screenX - containerRect.left;
  const relativeY = screenY - containerRect.top;

  // Apply inverse zoom and pan transformation
  const viewportX = (relativeX - panX) / zoomLevel;
  const viewportY = (relativeY - panY) / zoomLevel;

  return { x: viewportX, y: viewportY };
}

function viewportToScreen(viewportX, viewportY) {
  const containerRect = piecesContainer.getBoundingClientRect();

  // Apply zoom and pan transformation
  const relativeX = viewportX * zoomLevel + panX;
  const relativeY = viewportY * zoomLevel + panY;

  const screenX = relativeX + containerRect.left;
  const screenY = relativeY + containerRect.top;

  return { x: screenX, y: screenY };
}

function updateProgress() {
  if (state.totalPieces === 0) {
    progressDisplay.textContent = t("status.emptyProgress");
    return;
  }

  // Calculate score using the simplified formula:
  // Score = totalPieces - (numberOfGroups - 1)
  // This ensures 0% at start (all pieces in separate groups) and 100% when all pieces form one group

  const totalPieces = state.totalPieces;

  // Count unique groups (all pieces have groupId now)
  const groupIds = new Set(state.pieces.map((piece) => piece.groupId));
  const numberOfGroups = groupIds.size; // g in the formula

  // Apply the simplified scoring formula
  const score = totalPieces - (numberOfGroups - 1);
  const percentage = ((score / totalPieces) * 100).toFixed(1);

  progressDisplay.textContent = t("status.progressFormat", {
    score,
    total: totalPieces,
    percent: percentage,
  });

  // Show Check button when 100% is reached
  if (percentage === "100.0") {
    checkButton.style.display = "block";
  } else {
    checkButton.style.display = "none";
  }

  // Trigger debounced auto-save if persistence is active
  if (persistence && persistence.requestAutoSave) {
    persistence.requestAutoSave();
  }
}

// Generate puzzle with current slider value
async function generatePuzzle() {
  if (!currentImage || isGenerating) return;

  const pieceCount = sliderToPieceCount(parseInt(pieceSlider.value));

  if (pieceCount === 0) {
    // Show original image when slider is at 0
    piecesViewport.innerHTML = `
      <div class="original-image-container">
        <img src="${currentImage.src}" alt="${t(
      "alt.originalImage"
    )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
      </div>
    `;
    state.pieces = [];
    state.totalPieces = 0;
    updateProgress();
    return;
  }

  isGenerating = true;
  piecesViewport.innerHTML = "";
  progressDisplay.textContent = t("status.generating");

  try {
    const { pieces, rows, cols } = generateJigsawPieces(
      currentImage,
      pieceCount
    );
    state.pieces = pieces;
    state.totalPieces = pieces.length;
    scatterInitialPieces(piecesViewport, pieces);
    captureInitialMargins();
    clearAllPieceOutlines(); // Clear any previous validation feedback
    updateProgress();
    if (persistence && persistence.markDirty) persistence.markDirty();
  } catch (e) {
    console.error(e);
    alert(t("error.generate", { error: e.message }));
    progressDisplay.textContent = t("status.error");
  } finally {
    isGenerating = false;
  }
}

// Handle image upload
imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    progressDisplay.textContent = t("status.loadingImage");
    currentImage = await processImage(file);

    // Reset slider to 0 and show original image
    pieceSlider.value = 0;
    updatePieceDisplay();

    // Show original image
    piecesViewport.innerHTML = `
      <div class="original-image-container">
        <img src="${currentImage.src}" alt="${t(
      "alt.originalImage"
    )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
      </div>
    `;

    state.pieces = [];
    state.totalPieces = 0;
    updateProgress();
    if (persistence && persistence.markDirty) persistence.markDirty();
  } catch (e) {
    console.error(e);
    alert(t("error.loadImage", { error: e.message }));
    progressDisplay.textContent = t("status.error");
  }
});

// Function to draw piece outline with specified color
function drawPieceOutline(piece, color, lineWidth = 3) {
  console.log(
    `[drawPieceOutline] Drawing piece ${piece.id} with color ${color}`
  );

  const element = getPieceElement(piece.id);
  if (!element) {
    console.warn(`[drawPieceOutline] No element found for piece ${piece.id}`);
    return;
  }

  const canvas = element.querySelector("canvas");
  if (!canvas) {
    console.warn(`[drawPieceOutline] No canvas found for piece ${piece.id}`);
    return;
  }

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

  // Draw the outline
  ctx.translate(pad, pad);
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
function clearPieceOutline(piece) {
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

// Function to clear all piece outlines
function clearAllPieceOutlines() {
  if (!state.pieces) return;

  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });
}

// Check if pieces are in correct positions
function checkPuzzleCorrectness() {
  console.log(
    "[checkPuzzleCorrectness] Starting check with",
    state.pieces?.length,
    "pieces"
  );

  if (!state.pieces || state.pieces.length === 0) {
    console.log("[checkPuzzleCorrectness] No pieces to check");
    return;
  }

  // Clear previous validation outlines
  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });

  let correctCount = 0;
  let incorrectCount = 0;

  // Since pieces can be rotated and moved freely, we need to check if they form
  // a valid puzzle configuration based on their connections and relative positions

  // For a piece to be "correct", it must meet these criteria:
  // 1. Be in correct rotation (0 degrees)
  // 2. Be connected to all expected neighbors
  // 3. Have reasonable relative positioning to neighbors
  state.pieces.forEach((piece) => {
    let isCorrect = true;
    let reasons = [];

    // Check rotation first - pieces should be in original orientation (0 degrees) for "correct"
    if (piece.rotation !== 0) {
      isCorrect = false;
      reasons.push(`Wrong rotation: ${piece.rotation}° (should be 0°)`);
    }

    // Get pieces that should be neighbors based on grid coordinates
    const expectedNeighbors = {
      north: state.pieces.find(
        (p) => p.gridX === piece.gridX && p.gridY === piece.gridY - 1
      ),
      east: state.pieces.find(
        (p) => p.gridX === piece.gridX + 1 && p.gridY === piece.gridY
      ),
      south: state.pieces.find(
        (p) => p.gridX === piece.gridX && p.gridY === piece.gridY + 1
      ),
      west: state.pieces.find(
        (p) => p.gridX === piece.gridX - 1 && p.gridY === piece.gridY
      ),
    };

    // For a more strict check, we'll examine positioning relative to neighbors
    // If all pieces are just connected in one blob but wrong positions, we should catch this
    let hasCorrectNeighborPositioning = true;

    Object.entries(expectedNeighbors).forEach(
      ([direction, expectedNeighbor]) => {
        if (expectedNeighbor) {
          // Check if they're in the same group (connected)
          if (piece.groupId !== expectedNeighbor.groupId) {
            isCorrect = false;
            reasons.push(
              `Not connected to expected neighbor at (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY})`
            );
          } else {
            // Additionally check relative positioning
            const pieceX = piece.displayX || 0;
            const pieceY = piece.displayY || 0;
            const neighborX = expectedNeighbor.displayX || 0;
            const neighborY = expectedNeighbor.displayY || 0;

            const deltaX = neighborX - pieceX;
            const deltaY = neighborY - pieceY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Expected piece dimensions (rough estimate)
            const expectedPieceSize =
              BASE_EXPECTED_PIECE_SIZE *
              (piece.scale || DEFAULT_CORRECTNESS_SCALE_FALLBACK);

            // Check if the relative positioning makes sense for the direction
            let positionIsCorrect = false;
            const tolerance =
              expectedPieceSize * NEIGHBOR_POSITION_TOLERANCE_FACTOR; // Allow some tolerance

            switch (direction) {
              case "north":
                // North neighbor should be above (negative Y) and roughly same X
                positionIsCorrect =
                  deltaY < -tolerance && Math.abs(deltaX) < tolerance;
                break;
              case "south":
                // South neighbor should be below (positive Y) and roughly same X
                positionIsCorrect =
                  deltaY > tolerance && Math.abs(deltaX) < tolerance;
                break;
              case "east":
                // East neighbor should be to the right (positive X) and roughly same Y
                positionIsCorrect =
                  deltaX > tolerance && Math.abs(deltaY) < tolerance;
                break;
              case "west":
                // West neighbor should be to the left (negative X) and roughly same Y
                positionIsCorrect =
                  deltaX < -tolerance && Math.abs(deltaY) < tolerance;
                break;
            }

            if (!positionIsCorrect) {
              hasCorrectNeighborPositioning = false;
              reasons.push(
                `Neighbor ${direction} (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY}) is not positioned correctly relative to this piece`
              );
            }
          }
        }
      }
    );

    // If neighbor positioning is wrong, mark as incorrect
    if (!hasCorrectNeighborPositioning) {
      isCorrect = false;
    }

    console.log(
      `[checkPuzzleCorrectness] Piece ${piece.id} at (${piece.gridX}, ${piece.gridY}):`,
      isCorrect ? "CORRECT" : "INCORRECT",
      isCorrect ? "" : `- Reasons: ${reasons.join(", ")}`
    );

    // Apply visual feedback using shape outlines
    if (isCorrect) {
      drawPieceOutline(piece, "#2ea862", 4); // Green outline for correct pieces
      correctCount++;
    } else {
      drawPieceOutline(piece, "#c94848", 4); // Red outline for incorrect pieces
      incorrectCount++;
    }
  });

  console.log(
    `[checkPuzzleCorrectness] Results: ${correctCount} correct, ${incorrectCount} incorrect`
  );

  // Add blinking effect for incorrect pieces
  setTimeout(() => {
    console.log(
      "[checkPuzzleCorrectness] Starting blink effect for incorrect pieces"
    );
    let blinkingPieces = 0;

    state.pieces.forEach((piece) => {
      let isCorrect = true;

      // Repeat the same correctness check as above
      if (piece.rotation !== 0) {
        isCorrect = false;
      }

      const expectedNeighbors = {
        north: state.pieces.find(
          (p) => p.gridX === piece.gridX && p.gridY === piece.gridY - 1
        ),
        east: state.pieces.find(
          (p) => p.gridX === piece.gridX + 1 && p.gridY === piece.gridY
        ),
        south: state.pieces.find(
          (p) => p.gridX === piece.gridX && p.gridY === piece.gridY + 1
        ),
        west: state.pieces.find(
          (p) => p.gridX === piece.gridX - 1 && p.gridY === piece.gridY
        ),
      };

      let hasCorrectNeighborPositioning = true;

      Object.entries(expectedNeighbors).forEach(
        ([direction, expectedNeighbor]) => {
          if (expectedNeighbor) {
            if (piece.groupId !== expectedNeighbor.groupId) {
              isCorrect = false;
            } else {
              // Check relative positioning
              const pieceX = piece.displayX || 0;
              const pieceY = piece.displayY || 0;
              const neighborX = expectedNeighbor.displayX || 0;
              const neighborY = expectedNeighbor.displayY || 0;

              const deltaX = neighborX - pieceX;
              const deltaY = neighborY - pieceY;
              const expectedPieceSize =
                BASE_EXPECTED_PIECE_SIZE *
                (piece.scale || DEFAULT_CORRECTNESS_SCALE_FALLBACK);
              const tolerance =
                expectedPieceSize * NEIGHBOR_POSITION_TOLERANCE_FACTOR;

              let positionIsCorrect = false;
              switch (direction) {
                case "north":
                  positionIsCorrect =
                    deltaY < -tolerance && Math.abs(deltaX) < tolerance;
                  break;
                case "south":
                  positionIsCorrect =
                    deltaY > tolerance && Math.abs(deltaX) < tolerance;
                  break;
                case "east":
                  positionIsCorrect =
                    deltaX > tolerance && Math.abs(deltaY) < tolerance;
                  break;
                case "west":
                  positionIsCorrect =
                    deltaX < -tolerance && Math.abs(deltaY) < tolerance;
                  break;
              }

              if (!positionIsCorrect) {
                hasCorrectNeighborPositioning = false;
              }
            }
          }
        }
      );

      if (!hasCorrectNeighborPositioning) {
        isCorrect = false;
      }

      // Create blinking effect for incorrect pieces
      if (!isCorrect) {
        blinkingPieces++;
        console.log(
          `[checkPuzzleCorrectness] Starting blink for piece ${piece.id}`
        );

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
            console.log(
              `[checkPuzzleCorrectness] Finished blinking for piece ${piece.id}`
            );
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

// Handle Check button click
checkButton.addEventListener("click", () => {
  checkPuzzleCorrectness();
});

// Handle Help button click
helpButton.addEventListener("click", () => {
  helpModal.style.display = "flex";
});

// Handle closing help modal
closeHelp.addEventListener("click", () => {
  helpModal.style.display = "none";
});

// Close modal when clicking outside of it
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) {
    helpModal.style.display = "none";
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && helpModal.style.display === "flex") {
    helpModal.style.display = "none";
  }
});

// Handle slider changes - generate puzzle in real-time
pieceSlider.addEventListener("input", () => {
  updatePieceDisplay();
  generatePuzzle();
});

// Zoom button event listeners
zoomInButton.addEventListener("click", () => {
  setZoom(zoomLevel * ZOOM_STEP_FACTOR);
});

zoomOutButton.addEventListener("click", () => {
  setZoom(zoomLevel / ZOOM_STEP_FACTOR);
});

zoomResetButton.addEventListener("click", () => {
  resetZoomAndPan();
});

// Mouse wheel zoom
piecesContainer.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomFactor =
    e.deltaY > 0 ? WHEEL_ZOOM_OUT_FACTOR : WHEEL_ZOOM_IN_FACTOR;
  setZoom(zoomLevel * zoomFactor, e.clientX, e.clientY);
});

// Pan functionality
piecesContainer.addEventListener("mousedown", (e) => {
  // Only pan with middle mouse button or Ctrl+left mouse button, and only if not clicking on a piece
  if (
    (e.button === 1 || (e.button === 0 && e.ctrlKey)) &&
    e.target === piecesContainer
  ) {
    e.preventDefault();
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    piecesContainer.style.cursor = "grabbing";
  }
});

document.addEventListener("mousemove", (e) => {
  if (isPanning) {
    e.preventDefault();
    const deltaX = e.clientX - lastPanX;
    const deltaY = e.clientY - lastPanY;
    panX += deltaX;
    panY += deltaY;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    updateViewportTransform();
  }
});

document.addEventListener("mouseup", (e) => {
  if (isPanning) {
    isPanning = false;
    piecesContainer.style.cursor = "grab";
  }
  if (persistence && persistence.requestAutoSave) persistence.requestAutoSave();
});

// Keyboard shortcuts for zoom and pan
document.addEventListener("keydown", (e) => {
  // Only if not in modal and not typing in input
  if (helpModal.style.display === "flex" || e.target.tagName === "INPUT")
    return;

  switch (e.key) {
    case "+":
    case "=":
      e.preventDefault();
      setZoom(zoomLevel * ZOOM_STEP_FACTOR);
      break;
    case "-":
      e.preventDefault();
      setZoom(zoomLevel / ZOOM_STEP_FACTOR);
      break;
    case "0":
      e.preventDefault();
      resetZoomAndPan();
      break;
  }
});

// Bootstrap with i18n before initializing UI & persistence
async function bootstrap() {
  await initI18n();
  applyTranslations();
  updatePieceDisplay();
  updateZoomDisplay();
  initCommChannel(updateProgress);

  // Late-load persistence module and attempt auto-resume AFTER i18n so modal is translated
  import("./persistence.js")
    .then((mod) => {
      persistence = mod;
      mod.initPersistence({
        getViewportState,
        applyViewportState,
        getSliderValue,
        setSliderValue,
        getCurrentImage,
        setImage: (img) => (currentImage = img),
        regenerate: generatePuzzle,
        getState: () => state,
        setPieces: (pieces) => {
          state.pieces = pieces;
          state.totalPieces = pieces.length;
        },
        redrawPiecesContainer: () => {
          piecesViewport.innerHTML = "";
          scatterInitialPieces(piecesViewport, state.pieces);
          captureInitialMargins();
          updateProgress();
        },
        renderPiecesFromState: () => {
          piecesViewport.innerHTML = "";
          renderPiecesAtPositions(piecesViewport, state.pieces);
          captureInitialMargins();
          updateProgress();
        },
        markDirtyHook: () => updateProgress(),
        showResumePrompt: createResumeModal,
        afterDiscard: () => {
          updateProgress();
        },
      });
      mod.tryOfferResume();
    })
    .catch((err) => console.warn("Persistence module load failed", err));
}

bootstrap();

// Create and show a custom modal dialog for resuming a saved game
function createResumeModal({ onResume, onDiscard, onCancel }) {
  // Avoid duplicate modal
  const existing = document.getElementById("resume-modal-overlay");
  if (existing) existing.remove();

  // Inject styles once
  if (!document.getElementById("resume-modal-styles")) {
    const style = document.createElement("style");
    style.id = "resume-modal-styles";
    style.textContent = `
      #resume-modal-overlay { position: fixed; inset:0; background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:10000; }
      .resume-modal { background:#1f1f1f; color:#f5f5f5; padding:24px 28px 30px; width: min(420px, 90%); border-radius:12px; box-shadow:0 10px 32px rgba(0,0,0,0.4); font-family: system-ui, sans-serif; animation: fadeIn 160ms ease-out; }
      .resume-modal h2 { margin:0 0 12px; font-size:1.35rem; letter-spacing:0.5px; }
      .resume-modal p { margin:0 0 20px; line-height:1.45; font-size:0.95rem; color:#d0d0d0; }
      .resume-actions { display:flex; gap:12px; flex-wrap:wrap; }
      .resume-actions button { flex:1 1 auto; cursor:pointer; border:none; border-radius:8px; padding:12px 14px; font-size:0.9rem; font-weight:600; letter-spacing:0.4px; transition: background 140ms, transform 120ms; }
      .resume-primary { background:#2d7ef7; color:#fff; }
      .resume-primary:hover { background:#1f6bd8; }
      .resume-warn { background:#444; color:#eee; }
      .resume-warn:hover { background:#555; }
      .resume-danger { background:#c44545; color:#fff; }
      .resume-danger:hover { background:#b23838; }
      .resume-actions button:active { transform: translateY(1px); }
      .resume-meta { margin-top:16px; font-size:0.7rem; text-transform:uppercase; opacity:0.6; letter-spacing:1px; text-align:right; }
      @keyframes fadeIn { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform: translateY(0);} }
      @media (max-width:520px){ .resume-actions { flex-direction:column; } }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.id = "resume-modal-overlay";
  overlay.innerHTML = `
    <div class="resume-modal" role="dialog" aria-modal="true" aria-labelledby="resume-modal-title">
      <h2 id="resume-modal-title">${t("resume.title")}</h2>
      <p>${t("resume.message")}</p>
      <div class="resume-actions">
        <button class="resume-primary" data-action="resume">${t(
          "resume.resume"
        )}</button>
        <button class="resume-warn" data-action="cancel">${t(
          "resume.cancel"
        )}</button>
        <button class="resume-danger" data-action="discard">${t(
          "resume.discard"
        )}</button>
      </div>
      <div class="resume-meta">${t("resume.meta")}</div>
    </div>`;
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") {
      close();
      onCancel && onCancel();
    }
  }
  document.addEventListener("keydown", onKey);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
      onCancel && onCancel();
    }
  });
  overlay.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "resume") {
        close();
        onResume && onResume();
      } else if (action === "discard") {
        // Direct discard without extra confirm (user requested removal of alert)
        close();
        onDiscard && onDiscard();
      } else if (action === "cancel") {
        close();
        onCancel && onCancel();
      }
    });
  });

  // Focus first button for accessibility
  const firstBtn = overlay.querySelector("button[data-action='resume']");
  firstBtn && firstBtn.focus();
}

// (Persistence dynamic import moved into bootstrap())

// Export functions for use by other modules
export {
  updateProgress,
  clearAllPieceOutlines,
  screenToViewport,
  viewportToScreen,
  getCurrentZoom,
  setZoom,
  getViewportState,
  applyViewportState,
  getSliderValue,
  setSliderValue,
  getCurrentImage,
  ensureRectInView,
  captureInitialMargins,
  enforceInitialMargins,
};
