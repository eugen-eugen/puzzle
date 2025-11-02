// interactionManager.js - interact.js integration for puzzle pieces

import { Point, rotatePointDeg } from "./geometry/Point.js";
import {
  clearAllPieceOutlines,
  ensureRectInView,
  enforceInitialMargins,
  fitAllPiecesInView,
  getViewportState,
} from "./app.js";
import { screenToViewport, applyPiecePosition } from "./display.js";
import { handleDragMove, handleDragEnd } from "./connectionManager.js";
import { state } from "./gameEngine.js";

// Constants for interaction behavior
const DOUBLE_TAP_MAX_DELAY_MS = 320;
const DOUBLE_TAP_MAX_DIST_SQ = 26 * 26;
const OUTSIDE_THRESHOLD_PX = 40;

// State management
let selectedPieceId = null;
let onSelectionChangeCallback = null;
let spatialIndex = null;
let pieceElements = null;

// Double-tap detection state
let lastTapTime = 0;
let lastTapPieceId = null;
let lastTapPos = new Point(0, 0);

// Multi-touch state
const activeTouchIds = new Set();

/**
 * Initialize interact.js for puzzle pieces
 * @param {Map} pieceElementsMap - Map of piece ID to DOM element
 * @param {SpatialIndex} spatialIndexInstance - Spatial index for piece tracking
 */
export function initializeInteractions(pieceElementsMap, spatialIndexInstance) {
  pieceElements = pieceElementsMap;
  spatialIndex = spatialIndexInstance;

  console.log("[interactionManager] Initializing interactions", {
    pieceCount: pieceElementsMap.size,
    hasInteract: !!window.interact,
    interactType: typeof window.interact,
  });

  if (!window.interact) {
    console.error(
      "[interactionManager] interact.js is not loaded! Interaction functionality will not work."
    );
    return;
  }

  try {
    // Configure interact.js for each piece individually
    pieceElementsMap.forEach((element, pieceId) => {
      const interactable = window.interact(element);

      interactable
        .draggable({
          listeners: {
            start: onDragStart,
            move: onDragMove,
            end: onDragEnd,
          },
          // No modifiers - allow dragging beyond parent bounds to trigger auto-fit
        })
        .on("tap", onTap)
        .on("doubletap", onDoubleTap);

      // Configure double-tap detection settings
      if (interactable.options && interactable.options.actions) {
        // Set more generous double-tap detection
        interactable.options.actions.doubletap = {
          interval: 500, // Max time between taps (ms)
          distance: 30, // Max distance between taps (px)
        };
      }
    });

    // Configure global container interactions
    window.interact("#piecesContainer").on("tap", onContainerTap);

    console.log("[interactionManager] interact.js configured successfully");
  } catch (error) {
    console.error("[interactionManager] Error configuring interact.js:", error);
    throw error; // Re-throw to make the error visible
  }

  // Set up keyboard event handling
  installKeyboardListeners();
}

/**
 * Add event listeners to a new piece (called when pieces are dynamically added)
 */
export function addPieceInteraction(element) {
  if (!window.interact) {
    console.error("[interactionManager] interact.js is not loaded!");
    return;
  }

  const interactable = window.interact(element);

  interactable
    .draggable({
      origin: "self",
      listeners: {
        start: onDragStart,
        move: onDragMove,
        end: onDragEnd,
      },
      // No modifiers - allow dragging beyond parent bounds to trigger auto-fit
    })
    .on("tap", onTap)
    .on("doubletap", onDoubleTap);

  // Configure double-tap detection settings
  if (interactable.options && interactable.options.actions) {
    // Set more generous double-tap detection
    interactable.options.actions.doubletap = {
      interval: 500, // Max time between taps (ms)
      distance: 30, // Max distance between taps (px)
    };
  }
}

/**
 * Handle drag start
 */
function onDragStart(event) {
  console.log("[interactionManager] onDragStart", event);
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const piece = findPiece(pieceId);

  console.log("[interactionManager] drag start", { pieceId, piece, element });

  if (!piece) return;

  // Track touch IDs for multi-touch detection
  if (event.interaction.pointerType === "touch") {
    activeTouchIds.add(event.interaction.id);
  }

  selectPiece(pieceId);
  clearAllPieceOutlines();

  // Check for detach conditions
  const isShiftPressed = event.shiftKey;
  const multiTouchDetach =
    event.interaction.pointerType === "touch" && activeTouchIds.size >= 2;

  if ((isShiftPressed || multiTouchDetach) && piece.groupId) {
    detachPieceFromGroup(piece);
    element.setAttribute("data-detached", "true");
  }
}

/**
 * Handle drag move
 */
function onDragMove(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const piece = findPiece(pieceId);

  if (!piece) return;

  // Convert screen coordinates to viewport coordinates
  const viewportState = getViewportState();
  const viewportPos = screenToViewport(
    new Point(event.client.x, event.client.y),
    new Point(viewportState.panX, viewportState.panY),
    viewportState.zoomLevel
  );

  // Calculate new position
  const deltaX = event.dx / viewportState.zoomLevel;
  const deltaY = event.dy / viewportState.zoomLevel;

  // Move pieces - check if detached
  const isDetached = element.hasAttribute("data-detached");
  if (isDetached) {
    moveSinglePiece(piece, new Point(deltaX, deltaY));
  } else {
    moveGroup(piece, new Point(deltaX, deltaY));
  }

  // Check boundaries
  checkBoundaries(element, piece);

  // Handle connection evaluation
  handleDragMove(piece);
}

/**
 * Handle drag end
 */
function onDragEnd(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const piece = findPiece(pieceId);

  // Clean up touch tracking
  if (event.interaction.pointerType === "touch") {
    activeTouchIds.delete(event.interaction.id);
  }

  if (!piece) return;

  const wasDetached = element.hasAttribute("data-detached");
  element.removeAttribute("data-detached");

  handleDragEnd(piece, wasDetached);

  const wentOutside = element.hasAttribute("data-outside");
  enforceInitialMargins();

  if (wentOutside) {
    fitAllPiecesInView();
    element.removeAttribute("data-outside");
  } else {
    ensureRectInView(
      piece.position,
      new Point(element.offsetWidth, element.offsetHeight),
      { forceZoom: false }
    );
  }
}

/**
 * Handle single tap
 */
function onTap(event) {
  console.log("[interactionManager] onTap", event);
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;

  if (event.interaction.pointerType === "touch") {
    // Handle double-tap detection for touch devices
    const now = performance.now();
    const dt = now - lastTapTime;
    const tapPos = new Point(event.client.x, event.client.y);
    const delta = Point.from(tapPos).sub(lastTapPos);
    const distSq = delta.x * delta.x + delta.y * delta.y;

    if (
      pieceId === lastTapPieceId &&
      dt <= DOUBLE_TAP_MAX_DELAY_MS &&
      distSq <= DOUBLE_TAP_MAX_DIST_SQ
    ) {
      // This will be handled by doubletap event
      return;
    }

    // Record tap for double-tap detection
    lastTapTime = now;
    lastTapPieceId = pieceId;
    lastTapPos = tapPos;
  }

  selectPiece(pieceId);
}

/**
 * Handle double tap/click
 */
function onDoubleTap(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const piece = findPiece(pieceId);

  if (!piece) return;

  // Prevent dragging when double-tapping
  event.preventDefault();
  event.stopPropagation();

  rotatePieceOrGroup(piece, element, 90);

  // Reset double-tap state to prevent chaining
  lastTapTime = 0;
  lastTapPieceId = null;
}

/**
 * Handle container tap (deselection)
 */
function onContainerTap(event) {
  if (
    event.target.id === "piecesContainer" ||
    event.target.classList.contains("pieces-viewport")
  ) {
    if (selectedPieceId) {
      const prevElement = pieceElements.get(selectedPieceId);
      if (prevElement) prevElement.classList.remove("selected");
      selectedPieceId = null;

      if (onSelectionChangeCallback) {
        onSelectionChangeCallback(null);
      }
    }
  }
}

/**
 * Select a piece
 * @param {string|number} id - Piece ID (string or number)
 */
function selectPiece(id) {
  // Convert to numeric ID for consistency (pieceElements map uses numeric keys)
  const numericId = typeof id === "string" ? parseInt(id, 10) : id;

  // Handle invalid/NaN IDs
  if (isNaN(numericId) || numericId == null) {
    console.warn("[interactionManager] selectPiece: invalid ID", id);
    return;
  }

  if (selectedPieceId === numericId) return;

  if (selectedPieceId != null) {
    const prev = pieceElements.get(selectedPieceId);
    if (prev) prev.classList.remove("selected");
  }

  const el = pieceElements.get(numericId);
  if (el) {
    el.classList.add("selected");
    el.style.zIndex = Date.now().toString();
  } else {
    console.warn(
      "[interactionManager] selectPiece: element not found for ID",
      numericId
    );
  }

  selectedPieceId = numericId;

  if (onSelectionChangeCallback) {
    const piece = findPiece(id);
    onSelectionChangeCallback(piece);
  }
}

/**
 * Move a single piece
 */
function moveSinglePiece(piece, delta) {
  piece.move(delta);

  const el = pieceElements.get(piece.id);
  if (el) {
    applyPiecePosition(el, piece);
  }

  if (spatialIndex) {
    piece.updateSpatialIndex(spatialIndex, el);
  }
}

/**
 * Move a group of pieces
 */
function moveGroup(draggedPiece, delta) {
  const groupPieces = draggedPiece.getGroupPieces();

  groupPieces.forEach((p) => {
    p.position.mutAdd(delta.x, delta.y);

    const el = pieceElements.get(p.id);
    if (el) {
      applyPiecePosition(el, p);
    }

    if (spatialIndex) {
      const scaledW = el ? el.offsetWidth : p.bitmap.width * (p.scale || 0.7);
      const scaledH = el ? el.offsetHeight : p.bitmap.height * (p.scale || 0.7);
      const centerPoint = p.position.added(scaledW / 2, scaledH / 2);
      spatialIndex.update({ id: p.id, position: centerPoint });
    }
  });
}

/**
 * Rotate piece or group
 */
function rotatePieceOrGroup(piece, el, rotationDegrees = 90) {
  const groupPieces = piece.getGroupPieces();
  if (groupPieces.length > 1) {
    piece.rotateGroup(rotationDegrees, getPieceElement, spatialIndex);
  } else {
    piece.rotate(rotationDegrees);
    el.style.transform = `rotate(${piece.rotation}deg)`;
  }
  ensureRectInView(piece.position, new Point(el.offsetWidth, el.offsetHeight), {
    forceZoom: false,
  });
}

/**
 * Detach piece from group
 */
function detachPieceFromGroup(piece) {
  const oldGroupId = piece.groupId;

  const newGroupId = piece.detachFromGroup();

  const el = pieceElements.get(piece.id);
  if (el) {
    el.classList.add("detached-piece");
    setTimeout(() => el.classList.remove("detached-piece"), 1000);
  }
}

/**
 * Check if piece is outside boundaries
 */
function checkBoundaries(element, piece) {
  const container = element.parentElement;
  const cRect = container.getBoundingClientRect();

  const overLeft = piece.position.x < -OUTSIDE_THRESHOLD_PX;
  const overTop = piece.position.y < -OUTSIDE_THRESHOLD_PX;
  const overRight =
    piece.position.x + element.offsetWidth > cRect.width + OUTSIDE_THRESHOLD_PX;
  const overBottom =
    piece.position.y + element.offsetHeight >
    cRect.height + OUTSIDE_THRESHOLD_PX;

  const isOutside = overLeft || overTop || overRight || overBottom;

  if (isOutside && !element.hasAttribute("data-outside")) {
    element.setAttribute("data-outside", "true");
  } else if (!isOutside && element.hasAttribute("data-outside")) {
    element.removeAttribute("data-outside");
  }
}

/**
 * Find piece by ID
 */
function findPiece(id) {
  // Convert string ID to number if needed (dataset.id returns strings)
  const numericId = typeof id === "string" ? parseInt(id, 10) : id;
  return state.pieces.find((p) => p.id === numericId);
}

/**
 * Get selected piece
 */
export function getSelectedPiece() {
  if (!selectedPieceId) return null;
  return findPiece(selectedPieceId);
}

/**
 * Fix selected piece orientation
 */
export function fixSelectedPieceOrientation() {
  if (!selectedPieceId) return false;

  const piece = findPiece(selectedPieceId);
  const pieceEl = pieceElements.get(selectedPieceId);
  if (!piece || !pieceEl) return false;

  const currentRotation = piece.rotation;
  if (currentRotation === 0) return true;

  let targetRotation = -currentRotation;
  if (targetRotation <= -180) targetRotation += 360;
  if (targetRotation > 180) targetRotation -= 360;

  if (piece.getGroupPieces().length > 1) {
    piece.rotateGroup(targetRotation, getPieceElement, spatialIndex);
  } else {
    piece.rotation = 0;
    pieceEl.style.transform = `rotate(0deg)`;
  }

  return true;
}

/**
 * Set selection change callback
 */
export function setSelectionChangeCallback(callback) {
  onSelectionChangeCallback = callback;
}

/**
 * Get piece element by ID
 */
export function getPieceElement(id) {
  return pieceElements.get(id);
}

/**
 * Apply highlight to piece
 */
export function applyHighlight(pieceId, candidateData) {
  pieceElements.forEach((el) => el.classList.remove("candidate-highlight"));
  if (pieceId == null) return;
  const el = pieceElements.get(pieceId);
  if (el) el.classList.add("candidate-highlight");
}

/**
 * Install keyboard event listeners for piece rotation
 */
function installKeyboardListeners() {
  window.addEventListener("keydown", (e) => {
    if (!selectedPieceId) return;
    const pieceEl = pieceElements.get(selectedPieceId);
    if (!pieceEl) return;
    const piece = findPiece(selectedPieceId);
    if (!piece) return;

    if (e.key === "r" || e.key === "R") {
      const rotationAmount = e.shiftKey ? 270 : 90; // Shift+R = counter-clockwise
      rotatePieceOrGroup(piece, pieceEl, rotationAmount);
    }
  });
}
