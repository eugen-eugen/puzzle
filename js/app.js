// Logo click opens gallery
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.getElementById("logo");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", () => {
      showPictureGallery(
        (deepLinkUrl) => {
          window.location.href = deepLinkUrl;
        },
        () => {
          imageInput.click();
        }
      );
    });
  }
});
// app.js - bootstrap for piece box window
import "../css/main.css";
import "../css/piece-box.css";
import "../css/animations.css";
import "../css/picture-gallery.css";

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${base}service-worker.js`, {
        type: "module",
      })
      .catch((err) => {
        console.warn("SW registration failed", err);
      });
  });
}

import { renderPiecesAtPositions } from "./piece-renderer.js";
import { setSelectionChangeCallback } from "./interaction/hl-interaction-handler.js";
import {
  initPersistence,
  clearSavedGame,
  tryOfferResume,
  requestAutoSave,
} from "./persistence.js";
import { state } from "./game-engine.js";
import { initI18n, t, applyTranslations } from "./i18n.js";
import { Point } from "./geometry/point.js";
import { Rectangle } from "./geometry/rectangle.js";
import { Util } from "./utils/util.js";
import { loadRemoteImageWithTimeout } from "./image-processor.js";
import { gameTableController } from "./game-table-controller.js";
import { DEFAULT_PIECE_SCALE } from "./constants/piece-constants.js";
import {
  updateViewportTransform,
  initViewport,
  getViewport,
  clearPieceOutline,
  updateOrientationTipButton,
  getZoomLevel,
  setZoomLevel,
  getPanOffset,
  setPanOffset,
  getIsPanning,
  setIsPanning,
  getLastPanPosition,
  setLastPanPosition,
  setInitialMargins,
  applyPieceCorrectnessVisualFeedback,
  applyBlinkingEffectForIncorrectPieces,
  updateZoomDisplay,
  applyViewportGrayscaleFilter,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./ui/display.js";
import {
  initControlBar,
  updateProgress,
  generatePuzzle,
  getSliderValue,
  setSliderValue,
  getCurrentImage,
  setCurrentImage,
  getCurrentImageSource,
  setCurrentImageSource,
  getCurrentImageId,
  setCurrentImageId,
  pieceCountToSlider,
  setPersistence,
  setCaptureInitialMargins,
  updatePieceDisplay,
  imageInput,
} from "./control-bar.js";
import { showPictureGallery, hidePictureGallery } from "./picture-gallery.js";

// ================================
// Module Constants (replacing magic numbers)
// ================================
const DEFAULT_CORRECTNESS_SCALE_FALLBACK = DEFAULT_PIECE_SCALE; // Use consistent scale fallback
const BLINK_INTERVAL_MS = 300; // Interval between blink frames
const BLINK_HALF_CYCLES = 8; // Half cycles (on/off) => 4 full blinks
const BLINK_START_DELAY_MS = 100; // Delay before starting blink effect

// DOM elements for puzzle-specific functionality
const piecesContainer = document.getElementById("piecesContainer");
const checkButton = document.getElementById("checkButton");
const topBar = document.querySelector(".top-bar");

let deepLinkActive = false; // true when URL provides image & pieces params

// Preserve initial left/top screen-space margins of the piece cluster so they don't grow.
// initialMargins is now managed in display.js

/**
 * Calculate bounding box for all pieces using their individual calculateBoundingFrame method
 * This accounts for piece rotation and actual geometry, unlike Point.computeBounds which only uses positions
 * @param {Array} pieces - Array of pieces to calculate bounds for
 * @returns {Rectangle|null} Rectangle with topLeft and bottomRight properties, or null if no valid pieces
 */
function calculatePiecesBounds(pieces) {
  if (Util.isArrayEmpty(pieces)) return null;

  let bounds = new Rectangle();

  for (const piece of pieces) {
    if (!piece) continue;

    const boundingFrame = piece.calculateBoundingFrame();
    if (!boundingFrame) continue;

    // Create rectangle from bounding frame at piece position
    const worldMin = piece.position.add(boundingFrame.topLeft);
    const worldMax = piece.position.add(boundingFrame.bottomRight);
    const pieceRect = Rectangle.fromPoints(worldMin, worldMax);

    if (!pieceRect.isEmpty()) {
      bounds = bounds.plus(pieceRect);
    }
  }

  // Return null for empty bounds instead of empty rectangle
  if (bounds.isEmpty()) return null;

  return bounds;
}

function captureInitialMargins() {
  if (Util.isArrayEmpty(state.pieces)) return;
  // Compute bounding box (logical coordinates)
  const bounds = calculatePiecesBounds(state.pieces);
  if (!bounds) return;
  const minPoint = bounds.topLeft;
  const screenMargins = getPanOffset().add(minPoint.scaled(getZoomLevel()));
  setInitialMargins(screenMargins);
}

// enforceInitialMargins is now in display.js

// Zoom and Pan functions
// setZoom is now in display.js
// resetZoomAndPan is now in controlBar.js

function getCurrentZoom() {
  return getZoomLevel();
}

function ensureRectInView(position, size, options = {}) {
  const { forceZoom = false } = options;
  if (!Util.isElementValid(piecesContainer)) return;
  const contW = piecesContainer.clientWidth;
  const contH = piecesContainer.clientHeight;

  // Helper to compute screen coords under current transform
  function rectOnScreen() {
    const scaledPosition = position.scaled(getZoomLevel());
    const screenPosition = getPanOffset().add(scaledPosition);
    const scaledSize = size.scaled(getZoomLevel());

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
        const targetZoom = Math.max(MIN_ZOOM, getZoomLevel() * minFactor);
        if (targetZoom < getZoomLevel() - 0.0001) {
          setZoomLevel(targetZoom);
          updateViewportTransform();
          updateZoomDisplay();
          r = rectOnScreen();
        }
      }
    }
    // After potential zoom, clamp pan to fit the rectangle fully.
    if (r.topLeft.x < 0)
      setPanOffset(getPanOffset().add(new Point(-r.topLeft.x, 0)));
    if (r.topLeft.y < 0)
      setPanOffset(getPanOffset().add(new Point(0, -r.topLeft.y)));
    if (r.bottomRight.x > contW)
      setPanOffset(getPanOffset().sub(new Point(r.bottomRight.x - contW, 0)));
    if (r.bottomRight.y > contH)
      setPanOffset(getPanOffset().sub(new Point(0, r.bottomRight.y - contH)));
    updateViewportTransform();
    return; // Done for forceZoom path
  }

  // Normal path (not forceZoom): try panning first, then fallback to simple zoom-fit only if still overflowing.
  let panAdjusted = false;
  if (r.topLeft.x < 0) {
    setPanOffset(getPanOffset().add(new Point(-r.topLeft.x, 0)));
    panAdjusted = true;
  }
  if (r.topLeft.y < 0) {
    setPanOffset(getPanOffset().add(new Point(0, -r.topLeft.y)));
    panAdjusted = true;
  }
  if (r.bottomRight.x > contW) {
    setPanOffset(getPanOffset().sub(new Point(r.bottomRight.x - contW, 0)));
    panAdjusted = true;
  }
  if (r.bottomRight.y > contH) {
    setPanOffset(getPanOffset().sub(new Point(0, r.bottomRight.y - contH)));
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
    const targetZoom = Math.min(getZoomLevel(), fitZoomW, fitZoomH);
    if (targetZoom < getZoomLevel() - 0.0005) {
      setZoomLevel(Math.max(MIN_ZOOM, targetZoom));
      updateViewportTransform();
      r = rectOnScreen();
      if (r.topLeft.x < 0)
        setPanOffset(getPanOffset().add(new Point(-r.topLeft.x, 0)));
      if (r.topLeft.y < 0)
        setPanOffset(getPanOffset().add(new Point(0, -r.topLeft.y)));
      if (r.bottomRight.x > contW)
        setPanOffset(getPanOffset().sub(new Point(r.bottomRight.x - contW, 0)));
      if (r.bottomRight.y > contH)
        setPanOffset(getPanOffset().sub(new Point(0, r.bottomRight.y - contH)));
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
  return {
    zoomLevel: getZoomLevel(),
    panX: getPanOffset().x,
    panY: getPanOffset().y,
  };
}

function applyViewportState(v) {
  setZoomLevel(v.zoomLevel);
  setPanOffset(new Point(v.panX, v.panY));
  updateViewportTransform();
  // updateZoomDisplay is now called from display.js
}

// updateProgress and generatePuzzle are now in controlBar.js

// Function to clear all piece outlines
function clearAllPieceOutlines() {
  if (Util.isArrayEmpty(state.pieces)) return;

  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });
}

// Check if pieces are in correct positions
export function checkPuzzleCorrectness() {
  // Clear previous validation outlines
  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });

  let correctCount = 0;
  let incorrectCount = 0;

  // Since pieces can be rotated and moved freely, we need to check if they form
  // a valid puzzle configuration based on their connections and relative positions

  // First, check if all pieces have the same rotation (uniform rotation is acceptable)
  const rotations = state.pieces.map((p) => p.rotation);
  const allSameRotation = rotations.every((r) => r === rotations[0]);

  // For a piece to be "correct", it must meet these criteria:
  // 1. Have the same rotation as all other pieces (uniform rotation is OK)
  // 2. Be connected to all expected neighbors
  // 3. Have correct relative positioning to neighbors
  state.pieces.forEach((piece) => {
    let isCorrect = true;
    let reasons = [];

    // Check rotation - all pieces should have uniform rotation
    if (!allSameRotation) {
      // If rotations are not uniform, check if this specific piece matches the most common rotation
      const rotationCounts = {};
      rotations.forEach((r) => {
        rotationCounts[r] = (rotationCounts[r] || 0) + 1;
      });
      const mostCommonRotation = Object.entries(rotationCounts).sort(
        (a, b) => b[1] - a[1]
      )[0][0];

      if (piece.rotation !== Number(mostCommonRotation)) {
        isCorrect = false;
        reasons.push(
          `Inconsistent rotation: ${piece.rotation}° (most pieces at ${mostCommonRotation}°)`
        );
      }
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

    // For a more strict check, we'll examine precise corner alignment between neighbors
    // This ensures pieces are not just connected but positioned with correct corner matching
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
            // Check if neighbor is correctly positioned by comparing corner alignment
            const positionIsCorrect = piece.isNeighbor(
              expectedNeighbor,
              direction
            );

            if (!positionIsCorrect) {
              isCorrect = false;
              reasons.push(
                `Neighbor ${direction} (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY}) corners are not properly aligned with this piece`
              );
            }
          }
        }
      }
    );

    // Apply visual feedback using shape outlines
    const result = applyPieceCorrectnessVisualFeedback(piece, isCorrect);
    if (result === "correct") {
      correctCount++;
    } else {
      incorrectCount++;
    }
  });

  // Apply blinking effect for incorrect pieces
  applyBlinkingEffectForIncorrectPieces(state.pieces, {
    BLINK_INTERVAL_MS,
    BLINK_HALF_CYCLES,
    BLINK_START_DELAY_MS,
  });
}

// Close modal with Escape key (Help modal handling is now in controlBar.js)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Check if any modal is open by looking for elements with specific IDs
    const helpModal = document.getElementById("helpModal");
    if (helpModal && helpModal.style.display === "flex") {
      helpModal.style.display = "none";
    }
  }
});

// Pan functionality
piecesContainer.addEventListener("mousedown", (e) => {
  // Only pan with middle mouse button or Ctrl+left mouse button, and only if not clicking on a piece
  if (
    (e.button === 1 || (e.button === 0 && e.ctrlKey)) &&
    e.target === piecesContainer
  ) {
    e.preventDefault();
    setIsPanning(true);
    setLastPanPosition(new Point(e.clientX, e.clientY));
    piecesContainer.style.cursor = "grabbing";
  }
});

document.addEventListener("mousemove", (e) => {
  if (getIsPanning()) {
    e.preventDefault();
    const currentPosition = new Point(e.clientX, e.clientY);
    const delta = currentPosition.sub(getLastPanPosition());
    setPanOffset(getPanOffset().add(delta));
    setLastPanPosition(currentPosition);
    updateViewportTransform();
  }
});

document.addEventListener("mouseup", (e) => {
  if (getIsPanning()) {
    setIsPanning(false);
    piecesContainer.style.cursor = "grab";
  }
  requestAutoSave();
});

// Keyboard shortcuts (zoom shortcuts are now in controlBar.js)

// Bootstrap with i18n before initializing UI & persistence
async function bootstrap() {
  await initI18n();
  applyTranslations();

  // Initialize display viewport
  initViewport();

  // Initialize control bar
  initControlBar();

  // Set up cross-module function references
  setCaptureInitialMargins(captureInitialMargins);
  // Deep link mode: ?image=<url>&pieces=<n>&norotate=<y|n>&removeColor=<true|false>
  try {
    const params = new URLSearchParams(window.location.search);
    const imageParam = params.get("image");
    const piecesParam = params.get("pieces");
    const noRotateParam = params.get("norotate");
    const removeColorParam = params.get("removeColor");
    console.log("[deep-link] URL params:", {
      imageParam,
      piecesParam,
      noRotateParam,
      removeColorParam,
    });
    if (imageParam && piecesParam) {
      const desiredPieces = parseInt(piecesParam, 10);
      const noRotate =
        noRotateParam === "y" ||
        noRotateParam === "yes" ||
        noRotateParam === "true";
      const removeColor =
        removeColorParam === "true" || removeColorParam === "yes";
      console.log("[deep-link] Parsed values:", {
        desiredPieces,
        noRotate,
        noRotateParam,
        removeColor,
        removeColorParam,
      });
      if (Util.isPositiveNumber(desiredPieces)) {
        deepLinkActive = true; // mark so persistence skip resume
        if (topBar) topBar.classList.add("deep-link-mode"); // Hide controls in deep link mode
        
        // Persist removeColor setting
        localStorage.setItem("removeColor", removeColor ? "true" : "false");
        
        console.info(
          "[deep-link] Loading image:",
          imageParam,
          "with",
          desiredPieces,
          "pieces",
          noRotate ? "(no rotation)" : "",
          removeColor ? "(grayscale)" : ""
        );

        // Load remote image with timeout
        loadRemoteImageWithTimeout(imageParam, {
          timeout: 10000,
          onLoad: async (img) => {
            setCurrentImage(img);
            setCurrentImageSource(imageParam); // Store URL for persistence
            // Map piece count to slider position
            const sliderVal = pieceCountToSlider(desiredPieces);
            // Use exported setter instead of accessing internal DOM element
            setSliderValue(sliderVal);
            updatePieceDisplay();
            
            // Apply grayscale filter if removeColor is set
            applyViewportGrayscaleFilter(removeColor);
            
            await generatePuzzle(noRotate);
            // Reset deep link flag so persistence can start saving changes
            deepLinkActive = false;
            // Hide gallery if it was shown
            hidePictureGallery();
          },
          onTimeout: () => {
            deepLinkActive = false;
            if (topBar) topBar.classList.remove("deep-link-mode"); // Restore controls on timeout
            tryOfferResume();
          },
          onError: () => {
            // Reset deep link flag and try normal resume flow
            deepLinkActive = false;
            if (topBar) topBar.classList.remove("deep-link-mode"); // Restore controls on error
            tryOfferResume();
          },
        }).catch(() => {
          // Error handling is already done in callbacks
        });
      } else {
        console.warn("[deep-link] Invalid pieces param", piecesParam);
      }
    }
  } catch (err) {
    console.warn("[deep-link] Error processing deep link params", err);
  }

  // Set up piece selection callback for orientation tip button
  setSelectionChangeCallback(updateOrientationTipButton);

  // Initialize persistence after i18n so modal is translated
  setPersistence({
    initPersistence,
    clearSavedGame,
    tryOfferResume,
    requestAutoSave,
  });
  initPersistence({
    getViewportState,
    applyViewportState,
    getSliderValue,
    setSliderValue,
    getCurrentImage,
    getCurrentImageSource,
    getCurrentImageId,
    setImage: setCurrentImage,
    setImageSource: setCurrentImageSource,
    setImageId: setCurrentImageId,
    regenerate: generatePuzzle,
    getState: () => state,
    setPieces: (pieces) => {
      state.pieces = pieces;
      state.totalPieces = pieces.length;
      // Defer GroupManager initialization until positions are normalized in renderPiecesFromState.
      // Controller positions will be synced after rendering.
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
      // Sync controller after rendering existing positions
      gameTableController.syncAllPositions();
    },
    markDirtyHook: () => updateProgress(),
    showResumePrompt: createResumeModal,
    afterDiscard: () => {
      updateProgress();
      // Show picture gallery when user selects "new session" (unless in deep link mode)
      if (!deepLinkActive) {
        showPictureGallery(
          (deepLinkUrl) => {
            // User selected a picture - navigate to deep link
            window.location.href = deepLinkUrl;
          },
          () => {
            // User closed gallery - show file picker
            imageInput.click();
          }
        );
      }
    },
  });

  if (deepLinkActive) {
    // User requested deep link session: discard any previous save silently
    try {
      clearSavedGame();
      console.info(
        "[deep-link] Previous session discarded due to deep link mode"
      );
    } catch (e) {
      console.warn("[deep-link] Failed to clear previous save", e);
    }
  } else {
    tryOfferResume();
  }
}

bootstrap();

// Apply grayscale filter from localStorage if set
const removeColorSetting = localStorage.getItem("removeColor");
if (removeColorSetting === "true") {
  applyViewportGrayscaleFilter(true);
}

// Create and show a custom modal dialog for resuming a saved game
function createResumeModal({
  onResume,
  onDiscard,
  onCancel,
  hasResume = true,
}) {
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

  // Build actions HTML based on whether there's a saved game
  const actionsHTML = hasResume
    ? `
    <button class="resume-primary" data-action="resume">${t(
      "resume.resume"
    )}</button>
    <button class="resume-warn" data-action="cancel">${t(
      "resume.cancel"
    )}</button>
    <button class="resume-danger" data-action="discard">${t(
      "resume.discard"
    )}</button>
  `
    : `
    <button class="resume-primary" data-action="discard">${t(
      "welcome.start"
    )}</button>
    <button class="resume-warn" data-action="cancel">${t(
      "resume.cancel"
    )}</button>
  `;

  overlay.innerHTML = `
    <div class="resume-modal" role="dialog" aria-modal="true" aria-labelledby="resume-modal-title">
      <div style="text-align: center; font-size: 4rem; margin-bottom: 12px; line-height: 1;">🧩</div>
      <h2 id="resume-modal-title">${
        hasResume ? t("resume.title") : t("welcome.title")
      }</h2>
      <p>${hasResume ? t("resume.message") : t("welcome.message")}</p>
      <div class="resume-actions">
        ${actionsHTML}
      </div>
      ${hasResume ? `<div class="resume-meta">${t("resume.meta")}</div>` : ""}
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
  clearAllPieceOutlines,
  getCurrentZoom,
  getViewportState,
  applyViewportState,
  ensureRectInView,
  captureInitialMargins,
  calculatePiecesBounds,
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
  if (Util.isArrayEmpty(state.pieces)) return;
  const contW = piecesContainer?.clientWidth || 0;
  const contH = piecesContainer?.clientHeight || 0;
  if (contW === 0 || contH === 0) return;

  const bounds = calculatePiecesBounds(state.pieces);

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
  setZoomLevel(newZoom);

  // Align top-left of bounding rect with viewport origin.
  setPanOffset(new Point(-minX * newZoom, -minY * newZoom));

  updateViewportTransform();
  updateZoomDisplay();

  // Reset initial margins so margin enforcement logic does not shift us later.
  setInitialMargins(new Point(0, 0));
}

export { fitAllPiecesInView };
