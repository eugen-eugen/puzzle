// app.js - bootstrap for piece box window
import { initCommChannel } from "./windowManager.js";
import { processImage } from "./imageProcessor.js";
import { generateJigsawPieces } from "./jigsawGenerator.js";
import {
  scatterInitialPieces,
  renderPiecesAtPositions,
} from "./pieceRenderer.js";
import {
  getPieceElement,
  getSelectedPiece,
  fixSelectedPieceOrientation,
  setSelectionChangeCallback,
} from "./interactionManager.js";
// Persistence (lazy-loaded after definitions to avoid circular issues)
// We'll dynamically import persistence so this file can export helpers first.
import { state } from "./gameEngine.js";
import { initI18n, t, applyTranslations } from "./i18n.js";
import { Point } from "./geometry/Point.js";
import {
  updateViewportTransform,
  initViewport,
  getViewport,
  screenToViewport,
  viewportToScreen,
  clearPieceOutline,
  drawPieceOutline,
  updateOrientationTipButton,
} from "./display.js";

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
const checkButton = document.getElementById("checkButton");
const orientationTipButton = document.getElementById("orientationTipButton");
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
let deepLinkActive = false; // true when URL provides image & pieces params

// Zoom and pan state
let zoomLevel = 1.0;
let panOffset = new Point(0, 0);
let isPanning = false;
let lastPanPosition = new Point(0, 0);

// Preserve initial left/top screen-space margins of the piece cluster so they don't grow.
let initialMargins = null;

function captureInitialMargins() {
  if (!state.pieces || state.pieces.length === 0) return;
  // Compute bounding box (logical coordinates)
  const bounds = Point.computeBounds(state.pieces);
  if (!bounds) return;
  const minPoint = bounds.min;
  const screenMargins = panOffset.add(minPoint.scaled(zoomLevel));
  initialMargins = screenMargins;
  // console.debug('[viewport] captured initial margins', initialMargins.toString());
}

function enforceInitialMargins() {
  if (!initialMargins) return;
  if (!state.pieces || state.pieces.length === 0) return;
  const bounds = Point.computeBounds(state.pieces);
  if (!bounds) return;
  const minPoint = bounds.min;
  const currentScreenMargins = panOffset.add(minPoint.scaled(zoomLevel));

  // Check if current margins exceed initial margins (with tolerance)
  const tolerance = 0.5;
  const excess = currentScreenMargins.subtract(initialMargins);
  let adjusted = false;

  if (excess.x > tolerance) {
    panOffset = panOffset.subtract(excess.x, 0);
    adjusted = true;
  }
  if (excess.y > tolerance) {
    panOffset = panOffset.subtract(0, excess.y);
    adjusted = true;
  }

  if (adjusted) {
    updateViewportTransform(panOffset, zoomLevel);
  }
}

// Convert slider position (0-100) to piece count using logarithmic scale
function sliderToPieceCount(sliderValue) {
  if (sliderValue === 0) return 0;
  const logValue = (sliderValue / 100) * LOG_SCALE_MAX_EXP;
  const pieces = Math.round(Math.pow(10, logValue));
  return Math.max(1, Math.min(MAX_PIECES, pieces));
}

// Inverse mapping: approximate slider value for a desired piece count.
function pieceCountToSlider(pieces) {
  const clamped = Math.max(1, Math.min(MAX_PIECES, pieces));
  const logValue = Math.log10(clamped); // in range 0..LOG_SCALE_MAX_EXP roughly
  const slider = (logValue / LOG_SCALE_MAX_EXP) * 100;
  return Math.round(Math.max(0, Math.min(100, slider)));
}

// Update the piece count display
function updatePieceDisplay() {
  const pieceCount = sliderToPieceCount(parseInt(pieceSlider.value));
  pieceDisplay.textContent = pieceCount;
}

// Zoom and Pan functions
function updateZoomDisplay() {
  zoomDisplay.textContent = Math.round(zoomLevel * 100) + "%";
}

function setZoom(newZoomLevel, center = null) {
  const oldZoom = zoomLevel;
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));

  // If zoom center is provided, adjust pan to zoom to that point
  if (center) {
    const containerRect = piecesContainer.getBoundingClientRect();
    const containerOffset = new Point(containerRect.left, containerRect.top);
    const viewportCenter = center.subtract(containerOffset);

    // Adjust pan to keep the zoom center point in the same position
    const zoomRatio = zoomLevel / oldZoom;
    const panDelta = viewportCenter.subtract(panOffset).scaled(zoomRatio);
    panOffset = viewportCenter.subtract(panDelta);
  }

  updateViewportTransform(panOffset, zoomLevel);
  updateZoomDisplay();
}

function resetZoomAndPan() {
  zoomLevel = 1.0;
  panOffset = new Point(0, 0);
  updateViewportTransform(panOffset, zoomLevel);
  updateZoomDisplay();
}

function getCurrentZoom() {
  return zoomLevel;
}

/**
 * Ensure a rectangle (piece bounding box in logical / viewport coordinates) is fully
 * visible in the container, optionally shrinking zoom when necessary.
 *
 * Coordinate spaces:
 * - Inputs are in logical viewport units (pre‑transform piece position).
 * - Screen position = pan + logical * zoomLevel.
 *
 * Two execution paths:
 * 1. Normal mode (forceZoom = false):
 *    a. Attempt to fix visibility by panning only (clamp left/top/right/bottom).
 *    b. If any side still overflows, compute the maximum zoom that would fit THIS
 *       rectangle alone (piece‑centric): targetZoom = min(currentZoom, contW / w, contH / h),
 *       apply if it is a reduction, then re‑clamp pan.
 * 2. Force mode (forceZoom = true):
 *    a. Skip the initial pan so we retain the raw overflow distances.
 *    b. Measure horizontal & vertical overflow in screen pixels.
 *       shrinkFactorH = contW / (contW + overflowXTotal) when overflow exists
 *       shrinkFactorV = contH / (contH + overflowYTotal)
 *       minFactor = min(shrinkFactorH, shrinkFactorV) (ignoring factors = 1).
 *    c. If minFactor < ~0.999, zoomLevel *= minFactor (bounded by MIN_ZOOM); never increases zoom.
 *    d. Finally clamp pan so the (possibly still same‑sized) rect is entirely on screen.
 *
 * Differences vs earlier version:
 * - No margin / padding is added in force mode anymore; zoom reduction is proportional
 *   to actual overflow (cont / (cont + overflow)).
 * - forceZoom path does NOT pan first; normal path always tries pan before zoom.
 *
 * Guarantees:
 * - Zoom only decreases or stays the same.
 * - At most one zoom adjustment per call.
 * - O(1) operations (no DOM queries beyond pre‑captured container dimensions).
 *
 * When to use forceZoom:
 * - Caller detected a threshold condition (e.g., piece moved beyond a soft boundary) and wants
 *   proportional zoom‑out even if a pan could have hidden the overflow.
 *
 * @param {Point} position Top-left logical position as a Point.
 * @param {Point} size Logical size (width -> x, height -> y) as a Point.
 * @param {Object} [options]
 * @param {boolean} [options.forceZoom=false] Use overflow‑proportional shrink (skip initial pan).
 *
 * @example // Basic usage after drag end
 * ensureRectInView(piece.position, new Point(el.offsetWidth, el.offsetHeight));
 *
 * @example // Enforce zoom out if piece flagged as outside threshold
 * ensureRectInView(new Point(px, py), new Point(pw, ph), { forceZoom: true });
 */
function ensureRectInView(position, size, options = {}) {
  const { forceZoom = false } = options;
  if (!piecesContainer) return;
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
          zoomLevel = targetZoom;
          updateViewportTransform(panOffset, zoomLevel);
          updateZoomDisplay();
          r = rectOnScreen();
        }
      }
    }
    // After potential zoom, clamp pan to fit the rectangle fully.
    if (r.topLeft.x < 0) panOffset = panOffset.add(-r.topLeft.x, 0);
    if (r.topLeft.y < 0) panOffset = panOffset.add(0, -r.topLeft.y);
    if (r.bottomRight.x > contW)
      panOffset = panOffset.subtract(r.bottomRight.x - contW, 0);
    if (r.bottomRight.y > contH)
      panOffset = panOffset.subtract(0, r.bottomRight.y - contH);
    updateViewportTransform(panOffset, zoomLevel);
    return; // Done for forceZoom path
  }

  // Normal path (not forceZoom): try panning first, then fallback to simple zoom-fit only if still overflowing.
  let panAdjusted = false;
  if (r.topLeft.x < 0) {
    panOffset = panOffset.add(-r.topLeft.x, 0);
    panAdjusted = true;
  }
  if (r.topLeft.y < 0) {
    panOffset = panOffset.add(0, -r.topLeft.y);
    panAdjusted = true;
  }
  if (r.bottomRight.x > contW) {
    panOffset = panOffset.subtract(r.bottomRight.x - contW, 0);
    panAdjusted = true;
  }
  if (r.bottomRight.y > contH) {
    panOffset = panOffset.subtract(0, r.bottomRight.y - contH);
    panAdjusted = true;
  }
  if (panAdjusted) {
    updateViewportTransform(panOffset, zoomLevel);
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
      zoomLevel = Math.max(MIN_ZOOM, targetZoom);
      updateViewportTransform(panOffset, zoomLevel);
      r = rectOnScreen();
      if (r.topLeft.x < 0) panOffset = panOffset.add(-r.topLeft.x, 0);
      if (r.topLeft.y < 0) panOffset = panOffset.add(0, -r.topLeft.y);
      if (r.bottomRight.x > contW)
        panOffset = panOffset.subtract(r.bottomRight.x - contW, 0);
      if (r.bottomRight.y > contH)
        panOffset = panOffset.subtract(0, r.bottomRight.y - contH);
      updateViewportTransform(panOffset, zoomLevel);
      updateZoomDisplay();
    } else if (panAdjusted) {
      updateViewportTransform(panOffset, zoomLevel);
    }
  } else if (panAdjusted) {
    updateViewportTransform(panOffset, zoomLevel);
  }
}

function getViewportState() {
  return { zoomLevel, panX: panOffset.x, panY: panOffset.y };
}

function applyViewportState(v) {
  zoomLevel = v.zoomLevel;
  panOffset = new Point(v.panX, v.panY);
  updateViewportTransform(panOffset, zoomLevel);
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
    const viewport = getViewport();
    if (viewport) {
      viewport.innerHTML = `
        <div class="original-image-container">
          <img src="${currentImage.src}" alt="${t(
        "alt.originalImage"
      )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>
      `;
    }
    state.pieces = [];
    state.totalPieces = 0;
    updateProgress();
    return;
  }

  isGenerating = true;
  const viewport = getViewport();
  if (viewport) {
    viewport.innerHTML = "";
  }
  progressDisplay.textContent = t("status.generating");

  try {
    const { pieces, rows, cols } = generateJigsawPieces(
      currentImage,
      pieceCount
    );
    state.pieces = pieces;
    state.totalPieces = pieces.length;
    const viewport = getViewport();
    if (viewport) {
      scatterInitialPieces(viewport, pieces);
    }
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
    const viewport = getViewport();
    if (viewport) {
      viewport.innerHTML = `
        <div class="original-image-container">
          <img src="${currentImage.src}" alt="${t(
        "alt.originalImage"
      )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>
      `;
    }

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
            const pieceX = piece.position.x;
            const pieceY = piece.position.y;
            const neighborX = expectedNeighbor.position.x;
            const neighborY = expectedNeighbor.position.y;

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
              const pieceX = piece.position.x;
              const pieceY = piece.position.y;
              const neighborX = expectedNeighbor.position.x;
              const neighborY = expectedNeighbor.position.y;

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

// Handle Orientation Tip button click
orientationTipButton.addEventListener("click", () => {
  const selectedPiece = getSelectedPiece();
  if (selectedPiece) {
    fixSelectedPieceOrientation();
    // Trigger persistence save after orientation change
    if (persistence && persistence.requestAutoSave) {
      persistence.requestAutoSave();
    }
  }
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
  setZoom(zoomLevel * zoomFactor, new Point(e.clientX, e.clientY));
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
    lastPanPosition = new Point(e.clientX, e.clientY);
    piecesContainer.style.cursor = "grabbing";
  }
});

document.addEventListener("mousemove", (e) => {
  if (isPanning) {
    e.preventDefault();
    const currentPosition = new Point(e.clientX, e.clientY);
    const delta = currentPosition.subtract(lastPanPosition);
    panOffset = panOffset.add(delta);
    lastPanPosition = currentPosition;
    updateViewportTransform(panOffset, zoomLevel);
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

  // Initialize display viewport
  initViewport();

  updatePieceDisplay();
  updateZoomDisplay();
  // Deep link mode: ?image=<url>&pieces=<n>
  try {
    const params = new URLSearchParams(window.location.search);
    const imageParam = params.get("image");
    const piecesParam = params.get("pieces");
    if (imageParam && piecesParam) {
      const desiredPieces = parseInt(piecesParam, 10);
      if (!isNaN(desiredPieces) && desiredPieces > 0) {
        deepLinkActive = true; // mark so persistence skip resume
        console.info(
          "[deep-link] Loading image:",
          imageParam,
          "with",
          desiredPieces,
          "pieces"
        );

        // Load remote image with timeout
        const img = new Image();
        img.crossOrigin = "anonymous"; // allow canvas usage when CORS permits
        img.decoding = "async";

        // Set up timeout fallback
        const timeoutId = setTimeout(() => {
          console.warn("[deep-link] Image load timeout for:", imageParam);
          deepLinkActive = false;
          if (persistence) {
            persistence.tryOfferResume();
          }
        }, 10000); // 10 second timeout

        img.onload = async () => {
          clearTimeout(timeoutId);
          console.info(
            "[deep-link] Image loaded successfully, generating puzzle"
          );
          currentImage = img;
          // Map piece count to slider position
          const sliderVal = pieceCountToSlider(desiredPieces);
          pieceSlider.value = String(sliderVal);
          updatePieceDisplay();
          await generatePuzzle();
          // Reset deep link flag so persistence can start saving changes
          deepLinkActive = false;
          console.info(
            "[deep-link] Deep link initialization complete, persistence enabled"
          );
        };
        img.onerror = () => {
          clearTimeout(timeoutId);
          console.warn("[deep-link] Failed to load image URL", imageParam);
          // Reset deep link flag and try normal resume flow
          deepLinkActive = false;
          // If persistence is already loaded, try resume
          if (persistence) {
            persistence.tryOfferResume();
          }
        };
        img.src = imageParam;
      } else {
        console.warn("[deep-link] Invalid pieces param", piecesParam);
      }
    }
  } catch (err) {
    console.warn("[deep-link] Error processing deep link params", err);
  }
  initCommChannel(updateProgress);

  // Set up piece selection callback for orientation tip button
  setSelectionChangeCallback(updateOrientationTipButton);

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
          const viewport = getViewport();
          if (viewport) {
            viewport.innerHTML = "";
            scatterInitialPieces(viewport, state.pieces);
          }
          captureInitialMargins();
          updateProgress();
        },
        renderPiecesFromState: () => {
          const viewport = getViewport();
          if (viewport) {
            viewport.innerHTML = "";
            renderPiecesAtPositions(viewport, state.pieces);
          }
          captureInitialMargins();
          updateProgress();
        },
        markDirtyHook: () => updateProgress(),
        showResumePrompt: createResumeModal,
        afterDiscard: () => {
          updateProgress();
          // Immediately show file selection dialog when user selects "new session"
          imageInput.click();
        },
      });
      if (deepLinkActive) {
        // User requested deep link session: discard any previous save silently
        try {
          mod.clearSavedGame();
          console.info(
            "[deep-link] Previous session discarded due to deep link mode"
          );
        } catch (e) {
          console.warn("[deep-link] Failed to clear previous save", e);
        }
      } else {
        mod.tryOfferResume();
      }
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
  pieceCountToSlider,
};

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
function fitAllPiecesInView() {
  if (!state.pieces || state.pieces.length === 0) return;
  const contW = piecesContainer?.clientWidth || 0;
  const contH = piecesContainer?.clientHeight || 0;
  if (contW === 0 || contH === 0) return;

  const bounds = Point.computeBounds(
    state.pieces,
    (p) => p.position,
    (p) => {
      const el = getPieceElement(p.id);
      return el ? new Point(el.offsetWidth, el.offsetHeight) : null;
    }
  );

  if (!bounds) return;
  const minX = bounds.min.x;
  const minY = bounds.min.y;
  const maxX = bounds.max.x;
  const maxY = bounds.max.y;

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY))
    return;
  const rectW = Math.max(1, maxX - minX);
  const rectH = Math.max(1, maxY - minY);

  // Compute zoom to fit entire rectangle.
  const fitZoom = Math.min(contW / rectW, contH / rectH);
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
  zoomLevel = newZoom;

  // Align top-left of bounding rect with viewport origin.
  panOffset = new Point(-minX * zoomLevel, -minY * zoomLevel);

  updateViewportTransform(panOffset, zoomLevel);
  updateZoomDisplay();

  // Reset initial margins so margin enforcement logic does not shift us later.
  initialMargins = new Point(0, 0);
}

export { fitAllPiecesInView };
