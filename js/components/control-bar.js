// controlBar.js - Control bar elements and event handlers
// Centralizes all UI control elements including sliders, buttons, and their functionality

import { generateJigsawPieces } from "../logic/jigsaw-generator.js";
import { scatterInitialPieces } from "../piece-renderer.js";
import { getSelectedPiece } from "../interaction/hl-interaction-handler.js";
import { state } from "../game-engine.js";
import { groupManager } from "../logic/group-manager.js";
import { t } from "../i18n.js";
import { isHelpOpen } from "./help.js";
import { Point } from "../geometry/point.js";
import { checkPuzzleCorrectness } from "../app.js";
import {
  PIECE_NORTH,
  PIECE_ROTATE,
  PIECE_SELECT,
  PIECE_DESELECT,
} from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";
import {
  GROUPS_CHANGED,
  PUZZLE_STATE_CHANGED,
} from "../constants/custom-events.js";
import {
  getViewport,
  setZoom,
  getZoomLevel,
  updateZoomDisplay,
  updateOrientationTipButton,
  ZOOM_STEP_FACTOR,
  WHEEL_ZOOM_IN_FACTOR,
  WHEEL_ZOOM_OUT_FACTOR,
} from "../ui/display.js";
import { isIndexedDBSupported, storeImageInDB } from "../indexed-db-storage.js";
import { applyLicenseIfPresent } from "../utils/image-util.js";
import { showPictureGallery } from "../picture-gallery.js";

// ================================
// Module Constants
// ================================
const LOG_SCALE_MAX_EXP = 3; // Slider maps 0..100 => 10^0 .. 10^3
const MAX_PIECES = 1000; // Clamp maximum piece count for UI

// ================================
// DOM Elements
// ================================
const pieceSlider = document.getElementById("pieceSlider");
const pieceDisplay = document.getElementById("pieceDisplay");
const progressDisplay = document.getElementById("progressDisplay");
const orientationTipButton = document.getElementById("orientationTipButton");
const zoomInButton = document.getElementById("zoomInButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const piecesContainer = document.getElementById("piecesContainer");

// ================================
// State Variables
// ================================
let currentImage = null;
let currentImageSource = null; // Store filename or URL for persistence
let currentImageId = null; // Store IndexedDB image ID for persistence
let currentImageLicense = null; // Store license text for current image
let isGenerating = false;
let persistence = null; // module ref once loaded

// ================================
// Utility Functions
// ================================

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

// ================================
// Control Functions
// ================================

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

function setCurrentImage(img) {
  currentImage = img;
}

function getCurrentImageSource() {
  return currentImageSource;
}

function setCurrentImageSource(source) {
  currentImageSource = source;
}

function getCurrentImageId() {
  return currentImageId;
}

function setCurrentImageId(imageId) {
  currentImageId = imageId;
}

function getCurrentImageLicense() {
  return currentImageLicense;
}

function setCurrentImageLicense(license) {
  currentImageLicense = license;
}

function resetZoomAndPan() {
  setZoom(1.0, null);
}

// ================================
// Progress and Status Updates
// ================================

function updateProgress() {
  if (!state.pieces || state.pieces.length === 0) {
    progressDisplay.textContent = t("status.emptyProgress");
    return;
  }

  // Calculate score using the simplified formula:
  // Score = totalPieces - (numberOfGroups - 1)
  // This ensures 0% at start (all pieces in separate groups) and 100% when all pieces form one group

  const totalPieces = state.totalPieces;

  // Use GroupManager for accurate group counting
  let numberOfGroups;
  try {
    numberOfGroups = groupManager.getGroupCount();
  } catch (error) {
    console.warn(
      "[updateProgress] GroupManager not available, falling back to simple count"
    );
    // Fallback to old method
    const groupIds = new Set(state.pieces.map((piece) => piece.groupId));
    numberOfGroups = groupIds.size;
  }

  // Apply the simplified scoring formula
  const score = totalPieces - (numberOfGroups - 1);
  const percentage = ((score / totalPieces) * 100).toFixed(1);

  progressDisplay.textContent = t("status.progressFormat", {
    score,
    total: totalPieces,
    percent: percentage,
  });

  // Automatically check puzzle correctness when all pieces are in one group
  if (numberOfGroups === 1 && totalPieces > 0) {
    // Use setTimeout to avoid blocking and ensure UI updates first
    setTimeout(() => checkPuzzleCorrectness(), 100);
  }

  // Trigger debounced auto-save if persistence is active
  if (persistence && persistence.requestAutoSave) {
    persistence.requestAutoSave();
  }
}

// ================================
// Puzzle Generation
// ================================

// Generate puzzle with current slider value
async function generatePuzzle() {
  if (!currentImage || isGenerating) return;

  const noRotate = state.noRotate || false;
  console.log(
    "[control-bar] generatePuzzle called with noRotate from state:",
    noRotate
  );

  const pieceCount = sliderToPieceCount(parseInt(pieceSlider.value));

  if (pieceCount === 0) {
    // Show original image when slider is at 0
    const viewport = getViewport();
    if (viewport) {
      // Temporarily set currentImageLicense in state
      const originalLicense = state.deepLinkLicense;
      state.deepLinkLicense = currentImageLicense;

      const displayImage = await applyLicenseIfPresent(currentImage);

      // Restore original license
      state.deepLinkLicense = originalLicense;
      viewport.innerHTML = `
        <div class="original-image-container">
          <img src="${displayImage.src}" alt="${t(
        "alt.originalImage"
      )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>
      `;
    }
    state.pieces = [];
    state.totalPieces = 0;
    document.dispatchEvent(
      new CustomEvent(PUZZLE_STATE_CHANGED, { detail: { action: "cleared" } })
    );
    return;
  }

  isGenerating = true;
  const viewport = getViewport();
  if (viewport) {
    viewport.innerHTML = "";
  }
  progressDisplay.textContent = t("status.generating");

  try {
    // Add license text to image if present
    const imageWithLicense = await applyLicenseIfPresent(currentImage);

    const { pieces, rows, cols } = generateJigsawPieces(
      imageWithLicense,
      pieceCount
    );
    state.pieces = pieces;
    state.totalPieces = pieces.length;
    state.noRotate = noRotate; // Store noRotate flag in game state
    console.log("[control-bar] Set state.noRotate to:", state.noRotate);

    // Initialize GroupManager with new pieces BEFORE scattering
    groupManager.initialize();

    const viewport = getViewport();
    if (viewport) {
      scatterInitialPieces(viewport, pieces, noRotate);
    }
    document.dispatchEvent(
      new CustomEvent(PUZZLE_STATE_CHANGED, { detail: { action: "generated" } })
    );
    if (persistence && persistence.markDirty) persistence.markDirty();
  } catch (e) {
    console.error(e);
    alert(t("error.generate", { error: e.message }));
    progressDisplay.textContent = t("status.error");
  } finally {
    isGenerating = false;
  }
}

// ================================
// Event Handlers
// ================================

// Handle slider changes - generate puzzle in real-time
function handleSliderChange() {
  updatePieceDisplay();
  generatePuzzle();
}

// Handle orientation tip button click
function handleOrientationTip() {
  // Check if rotation is disabled
  if (state.noRotate) {
    console.log("[control-bar] Rotation disabled (noRotate mode)");
    return;
  }
  const selectedPiece = getSelectedPiece();
  if (selectedPiece) {
    // Dispatch custom event for orientation alignment
    document.dispatchEvent(
      new CustomEvent(PIECE_NORTH, {
        detail: { pieceId: selectedPiece.id },
      })
    );
    // Trigger persistence save after orientation change
    if (persistence && persistence.requestAutoSave) {
      persistence.requestAutoSave();
    }
  }
}

// Zoom button event handlers
function handleZoomIn() {
  setZoom(getZoomLevel() * ZOOM_STEP_FACTOR);
}

function handleZoomOut() {
  setZoom(getZoomLevel() / ZOOM_STEP_FACTOR);
}

function handleZoomReset() {
  resetZoomAndPan();
}

// Mouse wheel zoom handler
function handleWheelZoom(e) {
  e.preventDefault();
  const zoomFactor =
    e.deltaY > 0 ? WHEEL_ZOOM_OUT_FACTOR : WHEEL_ZOOM_IN_FACTOR;
  setZoom(getZoomLevel() * zoomFactor, new Point(e.clientX, e.clientY));
}

// Keyboard shortcuts for zoom and piece rotation
function handleKeyboardShortcuts(e) {
  // Only if not in modal and not typing in input
  if (isHelpOpen() || e.target.tagName === "INPUT") return;

  switch (e.key) {
    case "+":
    case "=":
      e.preventDefault();
      setZoom(getZoomLevel() * ZOOM_STEP_FACTOR);
      break;
    case "-":
      e.preventDefault();
      setZoom(getZoomLevel() / ZOOM_STEP_FACTOR);
      break;
    case "0":
      e.preventDefault();
      resetZoomAndPan();
      break;
    case "r":
    case "R":
      // Dispatch piece rotation event
      const selectedPiece = getSelectedPiece();
      if (selectedPiece) {
        const rotationAmount = e.shiftKey ? 270 : 90;
        document.dispatchEvent(
          new CustomEvent(PIECE_ROTATE, {
            detail: { pieceId: selectedPiece.id, rotation: rotationAmount },
          })
        );
      }
      break;
  }
}

// ================================
// Initialization
// ================================

function initControlBar() {
  // Logo handler
  const logo = document.getElementById("logo");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", () => {
      showPictureGallery((deepLinkUrl) => {
        window.location.href = deepLinkUrl;
      });
    });
  }

  // Slider handler
  pieceSlider.addEventListener("input", handleSliderChange);

  // Button handlers
  orientationTipButton.addEventListener("click", handleOrientationTip);
  zoomInButton.addEventListener("click", handleZoomIn);
  zoomOutButton.addEventListener("click", handleZoomOut);
  zoomResetButton.addEventListener("click", handleZoomReset);

  // Mouse wheel zoom
  piecesContainer.addEventListener("wheel", handleWheelZoom);

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // Piece selection listeners for orientation tip button
  registerGlobalEvent(PIECE_SELECT, (event) => {
    const { piece } = event.detail;
    updateOrientationTipButton(piece);
  });

  registerGlobalEvent(PIECE_DESELECT, () => {
    updateOrientationTipButton(null);
  });

  // Listen for group and puzzle state changes
  registerGlobalEvent(GROUPS_CHANGED, updateProgress);
  registerGlobalEvent(PUZZLE_STATE_CHANGED, updateProgress);

  // Initialize displays
  updatePieceDisplay();
  updateZoomDisplay();
}

// Set persistence module reference
function setPersistence(persistenceModule) {
  persistence = persistenceModule;
}

async function handleImageUpload(file) {
  if (!file) return;

  try {
    progressDisplay.textContent = t("status.loadingImage");

    // Load the image from file
    const img = new Image();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    currentImage = img;

    // Try to store the file using IndexedDB if supported
    currentImageId = null;
    if (isIndexedDBSupported()) {
      try {
        console.log("[controlBar] Attempting to store file in IndexedDB");
        const result = await storeImageInDB(file);
        currentImageId = result.imageId;
        currentImageSource = `idb:${result.imageId}`; // 'idb:img_timestamp_randomid'
        console.log(
          "[controlBar] File stored successfully in IndexedDB:",
          result.imageId
        );
      } catch (error) {
        console.warn(
          "[controlBar] Failed to store file in IndexedDB:",
          error.message
        );
        // Fallback to regular filename storage
        currentImageSource = file.webkitRelativePath || file.name;
      }
    } else {
      // Store filename with directory path if available (webkitRelativePath) or just filename
      currentImageSource = file.webkitRelativePath || file.name;
    }

    // Reset slider to 0 and show original image
    pieceSlider.value = 0;
    updatePieceDisplay();

    // Show original image (with license if present)
    const viewport = getViewport();
    if (viewport) {
      // Temporarily set currentImageLicense in state
      const originalLicense = state.deepLinkLicense;
      state.deepLinkLicense = currentImageLicense;

      const displayImage = await applyLicenseIfPresent(currentImage);

      // Restore original license
      state.deepLinkLicense = originalLicense;
      viewport.innerHTML = `
        <div class="original-image-container">
          <img src="${displayImage.src}" alt="${t(
        "alt.originalImage"
      )}" style="max-width:100%;max-height:100%;object-fit:contain;" />
        </div>
      `;
    }

    state.pieces = [];
    state.totalPieces = 0;
    document.dispatchEvent(
      new CustomEvent(PUZZLE_STATE_CHANGED, { detail: { action: "cleared" } })
    );
    if (persistence && persistence.markDirty) persistence.markDirty();
  } catch (e) {
    console.error(e);
    alert(t("error.loadImage", { error: e.message }));
    progressDisplay.textContent = t("status.error");
  }
}

// ================================
// Exports
// ================================

export {
  initControlBar,
  updateProgress,
  updatePieceDisplay,
  generatePuzzle,
  getSliderValue,
  setSliderValue,
  getCurrentImage,
  setCurrentImage,
  getCurrentImageSource,
  setCurrentImageSource,
  getCurrentImageId,
  setCurrentImageId,
  getCurrentImageLicense,
  setCurrentImageLicense,
  pieceCountToSlider,
  setPersistence,
  handleImageUpload,
};
