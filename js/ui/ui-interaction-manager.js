// interactionManager.js - interact.js integration for puzzle pieces

import { Point } from "../geometry/point.js";
import {
  clearAllPieceOutlines,
  ensureRectInView,
  fitAllPiecesInView,
  getViewportState,
  calculatePiecesBounds,
} from "../app.js";
import { groupManager } from "../group-manager.js";
import { gameTableController } from "../game-table-controller.js";
import { screenToViewport, enforceInitialMargins } from "../display.js";
import { handleDragMove, handleDragEnd } from "../connection-manager.js";
import { state } from "../game-engine.js";
import { dragMonitor } from "./drag.js";

// Constants for interaction behavior
const OUTSIDE_THRESHOLD_PX = 40;
const LONG_PRESS_DURATION_MS = 1000; // Duration for long press to trigger detach

// State management
let selectedPieceId = null;
let onSelectionChangeCallback = null;
let pieceElements = null;

// Double-tap detection state

// Multi-touch state
const activeTouchIds = new Set();

// Long press detection state
let longPressTimer = null;
let longPressStartTime = null;
let longPressPieceId = null;

// Drag pause detection state (for detachment during drag)
let dragPauseTimer = null;
let isDragging = false;

// High curvature detach state
let highCurvatureDetach = false;

/**
 * Initialize interact.js for puzzle pieces
 * @param {Map} pieceElementsMap - Map of piece ID to DOM element
 * (Spatial index attachment now handled in renderer; no longer passed here.)
 */
export function initializeInteractions(pieceElementsMap) {
  pieceElements = pieceElementsMap;

  if (!window.interact) {
    console.error(
      "[interactionManager] interact.js is not loaded! Interaction functionality will not work."
    );
    return;
  }

  try {
    // Configure interact.js for each piece individually
    pieceElementsMap.forEach((element, pieceId) => {
      // Unset existing interactable to avoid duplicate listeners
      var interactable = window.interact(element);
      interactable.unset();
      interactable = window.interact(element);
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
        .on("doubletap", onDoubleTap)
        .on("down", onPointerDown)
        .on("up", onPointerUp);

      // Configure double-tap detection settings
      if (interactable.options && interactable.options.actions) {
        // Set more generous double-tap detection
        interactable.options.actions.doubletap = {
          interval: 500, // Max time between taps (ms)
          distance: 30, // Max distance between taps (px)
        };
      }
    });

    // Configure global container interactions (unset first to avoid duplicates)
    var containerInteractable = window.interact("#piecesContainer");
    containerInteractable.unset();

    containerInteractable = window.interact("#piecesContainer");
    containerInteractable.on("tap", onContainerTap);

    console.log("[interactionManager] interact.js configured successfully");
  } catch (error) {
    console.error("[interactionManager] Error configuring interact.js:", error);
    throw error; // Re-throw to make the error visible
  }

  // Register curvature callback for shuffle-based detachment
  const curvatureThreshold = 8;
  console.log(
    `[interactionManager] Curvature threshold for detachment: ${curvatureThreshold}`
  );

  dragMonitor.registerCurvatureCallback(curvatureThreshold, (data) => {
    highCurvatureDetach = true;
    console.log(
      `[DragMonitor] HIGH curvature detected (shuffle motion)! Curvature: ${data.curvature.toFixed(
        2
      )} ` + `(threshold: ${data.threshold}) - enabling detachment mode`
    );
  });
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
    .on("doubletap", onDoubleTap)
    .on("down", onPointerDown)
    .on("up", onPointerUp);

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
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const piece = findPiece(pieceId);

  if (!piece) return;

  // Track touch IDs for multi-touch detection
  if (event.interaction.pointerType === "touch") {
    activeTouchIds.add(event.interaction.id);
  }

  selectPiece(pieceId);
  clearAllPieceOutlines();

  // Mark as dragging and clear drag pause state
  isDragging = true;
  clearDragPauseTimer();

  // Check for detach conditions
  const isShiftPressed = event.shiftKey;
  const multiTouchDetach =
    event.interaction.pointerType === "touch" && activeTouchIds.size >= 2;

  // Check if drag started after 1 second hold (long press detach)
  const longPressDetach =
    longPressStartTime !== null &&
    String(longPressPieceId) === String(pieceId) &&
    performance.now() - longPressStartTime >= LONG_PRESS_DURATION_MS;

  if (
    (isShiftPressed || multiTouchDetach || longPressDetach) &&
    piece.groupId
  ) {
    detachPieceFromGroup(piece);
    element.setAttribute("data-detached", "true");
  }

  // Remove visual feedback when drag starts
  element.classList.remove("long-press-active");

  // Clear long press state after drag starts
  clearLongPressTimer();
  longPressStartTime = null;
  longPressPieceId = null;
}

/**
 * Handle drag move
 */
function onDragMove(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const piece = findPiece(pieceId);

  if (!piece) return;

  // Track drag speed
  dragMonitor.dragEvent({
    x: event.client.x,
    y: event.client.y,
    timestamp: performance.now(),
  });

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

  // Check for high curvature detach during drag
  if (
    highCurvatureDetach &&
    !element.hasAttribute("data-detached") &&
    piece.groupId
  ) {
    // Only detach if piece is in a multi-piece group
    const group = groupManager.getGroup(piece.groupId);
    if (group && group.size() > 1) {
      detachPieceFromGroup(piece);
      element.setAttribute("data-detached", "true");
    }
    highCurvatureDetach = false; // Clear flag after detachment
  }

  // Reset drag pause timer on each move
  clearDragPauseTimer();
  element.classList.remove("long-press-active");

  // Set new timer if piece is in a multi-piece group and not yet detached
  if (!element.hasAttribute("data-detached") && piece.groupId) {
    const group = groupManager.getGroup(piece.groupId);
    if (group && group.size() > 1) {
      dragPauseTimer = setTimeout(() => {
        // Show visual feedback
        element.classList.add("long-press-active");

        // Detach piece from group
        detachPieceFromGroup(piece);
        element.setAttribute("data-detached", "true");

        // Remove visual feedback after short delay
        setTimeout(() => {
          element.classList.remove("long-press-active");
        }, 300);
      }, LONG_PRESS_DURATION_MS);
    }
  }

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

  // Clear dragging state and drag pause timer
  isDragging = false;
  clearDragPauseTimer();
  element.classList.remove("long-press-active");
  highCurvatureDetach = false;

  // End drag speed monitoring
  dragMonitor.endDrag();

  const wasDetached = element.hasAttribute("data-detached");
  element.removeAttribute("data-detached");

  handleDragEnd(piece, wasDetached);

  const wentOutside = element.hasAttribute("data-outside");
  enforceInitialMargins(calculatePiecesBounds(state.pieces));

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
 * Handle pointer down (tracks when pointer first goes down)
 */
function onPointerDown(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;

  // Start tracking press time for long press detection on drag
  longPressStartTime = performance.now();
  longPressPieceId = pieceId;

  // Clear any existing timer
  clearLongPressTimer();

  // Show visual feedback after 1 second if still holding
  longPressTimer = setTimeout(() => {
    const el = pieceElements.get(parseInt(pieceId, 10));
    if (el) {
      el.classList.add("long-press-active");
    }
  }, LONG_PRESS_DURATION_MS);
}

/**
 * Handle pointer up (clears long press if released without dragging)
 */
function onPointerUp(event) {
  const element = event.target.closest(".piece") || event.target;

  // Remove visual feedback if pointer released without dragging
  element.classList.remove("long-press-active");

  // Clear long press state
  clearLongPressTimer();
  longPressStartTime = null;
  longPressPieceId = null;
}

/**
 * Handle single tap
 */
function onTap(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;

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

  // Check if rotation is disabled
  if (state.noRotate) {
    console.log("[interaction] Rotation disabled (noRotate mode)");
    return;
  }

  // Clear long press timer and visual feedback on double tap
  element.classList.remove("long-press-active");
  clearLongPressTimer();
  longPressStartTime = null;
  longPressPieceId = null;

  // Prevent dragging when double-tapping
  event.preventDefault();
  event.stopPropagation();

  rotatePieceOrGroup(piece, element, 90);
}

/**
 * Handle container tap (deselection)
 */
function onContainerTap(event) {
  if (
    event.target.id === "piecesContainer" ||
    event.target.classList.contains("pieces-viewport")
  ) {
    // Clear long press timer when tapping container
    clearLongPressTimer();
    longPressStartTime = null;
    longPressPieceId = null;

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

    // Bring selected piece and its entire group to the front
    gameTableController.bringToFront(numericId);
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
  // Delegate to controller
  gameTableController.movePiece(piece.id, delta);
}

/**
 * Move a group of pieces
 */
function moveGroup(draggedPiece, delta) {
  if (!draggedPiece.groupId) {
    moveSinglePiece(draggedPiece, delta);
    return;
  }
  gameTableController.moveGroup(draggedPiece.groupId, delta);
}

/**
 * Rotate piece or group
 */
function rotatePieceOrGroup(piece, el, rotationDegrees = 90) {
  gameTableController.rotatePieceOrGroup(
    piece.id,
    rotationDegrees,
    getPieceElement
  );
  ensureRectInView(piece.position, new Point(el.offsetWidth, el.offsetHeight), {
    forceZoom: false,
  });
}

/**
 * Detach piece from group
 */
function detachPieceFromGroup(piece) {
  const oldGroupId = piece.groupId;

  // Use GroupManager for proper connectivity handling
  const newGroup = groupManager.detachPiece(piece);

  if (!newGroup) {
    console.error(
      "[interactionManager] GroupManager detachment failed - piece cannot be detached"
    );
    return; // Exit early if detachment fails
  }

  // Bring detached piece to front to ensure it's above the original group
  gameTableController.bringToFront(piece.id);

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

  // Check if piece is in a multi-piece group
  const group = groupManager.getGroup(piece.groupId);
  const isMultiPieceGroup = group && group.size() > 1;

  if (isMultiPieceGroup) {
    gameTableController.rotateGroup(
      group.id,
      targetRotation,
      piece,
      getPieceElement
    );
  } else {
    gameTableController.rotatePiece(piece.id, targetRotation); // targetRotation resets orientation
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
 * Apply highlight to piece(s)
 * @param {string|Array<string>|null} pieceId - Single piece ID, array of IDs, or null to clear
 * @param {*} candidateData - Candidate data (for compatibility)
 */
export function applyHighlight(pieceId, candidateData) {
  pieceElements.forEach((el) => el.classList.remove("candidate-highlight"));
  if (pieceId == null) return;

  // Handle both single ID and array of IDs
  const pieceIds = Array.isArray(pieceId) ? pieceId : [pieceId];

  pieceIds.forEach((id) => {
    const el = pieceElements.get(id);
    if (el) el.classList.add("candidate-highlight");
  });
}

/**
 * Clear long press timer
 */
function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

/**
 * Clear drag pause timer
 */
function clearDragPauseTimer() {
  if (dragPauseTimer) {
    clearTimeout(dragPauseTimer);
    dragPauseTimer = null;
  }
}

/**
 * Install keyboard event listeners for piece rotation (called once at module load)
 */
window.addEventListener("keydown", (e) => {
  if (!selectedPieceId) return;
  const pieceEl = pieceElements.get(selectedPieceId);
  if (!pieceEl) return;
  const piece = findPiece(selectedPieceId);
  if (!piece) return;

  if (e.key === "r" || e.key === "R") {
    // Check if rotation is disabled
    if (state.noRotate) {
      console.log("[interaction] Rotation disabled (noRotate mode)");
      return;
    }
    const rotationAmount = e.shiftKey ? 270 : 90; // Shift+R = counter-clockwise
    rotatePieceOrGroup(piece, pieceEl, rotationAmount);
  }
});
