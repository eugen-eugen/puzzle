// ui-interaction-manager.js - GUI interaction handler for puzzle pieces
// Handles browser events, gesture detection, and visual feedback

import { Point } from "../geometry/point.js";
import {
  clearAllPieceOutlines,
  getViewportState,
  ensureRectInView,
} from "../app.js";
import {
  screenToViewport,
  applyHighlight as displayApplyHighlight,
} from "./display.js";
import { handleDragMove } from "../connection-manager.js";
import { state } from "../game-engine.js";
import { dragMonitor } from "../interaction/drag.js";
import { groupManager } from "../group-manager.js";
import * as hlHandler from "../interaction/hl-interaction-handler.js";
import { gameTableController } from "../game-table-controller.js";

// Constants for interaction behavior
const OUTSIDE_THRESHOLD_PX = 40;
const LONG_PRESS_DURATION_MS = 1000; // Duration for long press to trigger detach

// State management
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

  // Initialize high-level handler with listeners for visual feedback
  hlHandler.initialize({
    onPieceSelectedVisual: (pieceId, prevPieceId) => {
      // Remove selection from previous piece
      if (prevPieceId != null) {
        const prev = pieceElements.get(prevPieceId);
        if (prev) prev.classList.remove("selected");
      }
      // Add selection to new piece
      const el = pieceElements.get(pieceId);
      if (el) el.classList.add("selected");
    },
    onPieceDeselectedVisual: (pieceId) => {
      const el = pieceElements.get(pieceId);
      if (el) el.classList.remove("selected");
    },
    onPieceDetachedVisual: (pieceId) => {
      const el = pieceElements.get(pieceId);
      if (el) {
        el.classList.add("detached-piece");
        setTimeout(() => el.classList.remove("detached-piece"), 1000);
      }
    },
    onEnsurePieceInView: (pieceId) => {
      const piece = state.pieces.find((p) => p.id === pieceId);
      const el = pieceElements.get(pieceId);
      if (piece && el) {
        const position =
          gameTableController.getPiecePosition(piece.id) || new Point(0, 0);
        ensureRectInView(position, new Point(el.offsetWidth, el.offsetHeight), {
          forceZoom: false,
        });
      }
    },
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
  const numericId = parseInt(pieceId, 10);

  // Select the piece being dragged (brings it to front)
  hlHandler.onPieceSelected(numericId);

  // Track touch IDs for multi-touch detection
  if (event.interaction.pointerType === "touch") {
    activeTouchIds.add(event.interaction.id);
  }

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

  // Detach if needed before starting drag
  if (isShiftPressed || multiTouchDetach || longPressDetach) {
    hlHandler.onPieceDetached(numericId);
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
  const numericId = parseInt(pieceId, 10);
  const piece = state.pieces.find((p) => p.id === numericId);

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
  if (highCurvatureDetach && !element.hasAttribute("data-detached")) {
    // Only detach if piece is in a multi-piece group
    const group = groupManager.getGroup(piece.groupId);
    if (group && group.size() > 1) {
      hlHandler.onPieceDetached(piece.id);
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
        hlHandler.onPieceDetached(piece.id);
        element.setAttribute("data-detached", "true");

        // Remove visual feedback after short delay
        setTimeout(() => {
          element.classList.remove("long-press-active");
        }, 300);
      }, LONG_PRESS_DURATION_MS);
    }
  }

  // Move pieces via high-level handler
  hlHandler.onPieceDragged(piece.id, new Point(deltaX, deltaY));

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
  const numericId = parseInt(pieceId, 10);

  // Clean up touch tracking
  if (event.interaction.pointerType === "touch") {
    activeTouchIds.delete(event.interaction.id);
  }

  // Clear dragging state and drag pause timer
  isDragging = false;
  clearDragPauseTimer();
  element.classList.remove("long-press-active");
  highCurvatureDetach = false;

  // End drag speed monitoring
  dragMonitor.endDrag();

  element.removeAttribute("data-detached");

  // Check if piece went outside
  const wentOutside = element.hasAttribute("data-outside");
  if (wentOutside) {
    element.removeAttribute("data-outside");
  }

  // Notify high-level handler that drag ended
  hlHandler.onPieceDragEnded(numericId, wentOutside);
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
  const numericId = parseInt(pieceId, 10);

  hlHandler.onPieceSelected(numericId);
}

/**
 * Handle double tap/click
 */
function onDoubleTap(event) {
  const element = event.target.closest(".piece") || event.target;
  const pieceId = element.dataset.id;
  const numericId = parseInt(pieceId, 10);

  // Clear long press timer and visual feedback on double tap
  element.classList.remove("long-press-active");
  clearLongPressTimer();
  longPressStartTime = null;
  longPressPieceId = null;

  // Prevent dragging when double-tapping
  event.preventDefault();
  event.stopPropagation();

  // Notify high-level handler to rotate piece
  hlHandler.onPieceRotated(numericId, 90);
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

    // Notify high-level handler to deselect
    hlHandler.onPieceDeselected();
  }
}

/**
 * Check if piece is outside boundaries
 */
function checkBoundaries(element, piece) {
  const container = element.parentElement;
  const cRect = container.getBoundingClientRect();

  const position = gameTableController.getPiecePosition(piece.id);

  const overLeft = position.x < -OUTSIDE_THRESHOLD_PX;
  const overTop = position.y < -OUTSIDE_THRESHOLD_PX;
  const overRight =
    position.x + element.offsetWidth > cRect.width + OUTSIDE_THRESHOLD_PX;
  const overBottom =
    position.y + element.offsetHeight > cRect.height + OUTSIDE_THRESHOLD_PX;

  const isOutside = overLeft || overTop || overRight || overBottom;

  if (isOutside && !element.hasAttribute("data-outside")) {
    element.setAttribute("data-outside", "true");
  } else if (!isOutside && element.hasAttribute("data-outside")) {
    element.removeAttribute("data-outside");
  }
}

/**
 * Get selected piece - delegates to high-level handler
 */
export function getSelectedPiece() {
  return hlHandler.getSelectedPiece();
}

/**
 * Fix selected piece orientation - delegates to high-level handler
 */
export function fixSelectedPieceOrientation() {
  return hlHandler.fixSelectedPieceOrientation();
}

/**
 * Get piece element by ID - delegates to high-level handler
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
  displayApplyHighlight(pieceElements, pieceId, candidateData);
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
  const selectedPiece = hlHandler.getSelectedPiece();
  if (!selectedPiece) return;

  if (e.key === "r" || e.key === "R") {
    const rotationAmount = e.shiftKey ? 270 : 90; // Shift+R = counter-clockwise
    hlHandler.onPieceRotated(selectedPiece.id, rotationAmount);
  }
});
