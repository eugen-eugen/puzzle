// ui-interaction-manager.js - GUI interaction handler for puzzle pieces
// Handles browser events, gesture detection, and visual feedback

import { Point } from "../geometry/point.js";
import {
  clearAllPieceOutlines,
  getViewportState,
  ensureRectInView,
} from "../app.js";
import { applyHighlight as displayApplyHighlight } from "./display.js";
import { handleDragMove } from "../connection-manager.js";
import { state } from "../game-engine.js";
import { dragMonitor } from "../interaction/drag.js";
import { groupManager } from "../group-manager.js";
import * as hlHandler from "../interaction/hl-interaction-handler.js";
import { gameTableController } from "../game-table-controller.js";

// Constants for interaction behavior
const OUTSIDE_THRESHOLD_PX = 40;
const LONG_PRESS_DURATION_MS = 1000; // Duration for long press to trigger detach

export class UIInteractionManager {
  constructor(pieceElementsMap) {
    this.pieceElements = pieceElementsMap;
    this.activeTouchIds = new Set();
    this.longPressTimer = null;
    this.longPressStartTime = null;
    this.longPressPieceId = null;
    this.dragPauseTimer = null;
    this.isDragging = false;
    this.highCurvatureDetach = false;

    this._initialize();
  }

  _initialize() {
    const pieceElements = this.pieceElements;

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
          ensureRectInView(
            position,
            new Point(el.offsetWidth, el.offsetHeight),
            {
              forceZoom: false,
            }
          );
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
      pieceElements.forEach((element, pieceId) => {
        // Unset existing interactable to avoid duplicate listeners
        var interactable = window.interact(element);
        interactable.unset();
        interactable = window.interact(element);
        interactable
          .draggable({
            listeners: {
              start: (event) => this._onDragStart(event),
              move: (event) => this._onDragMove(event),
              end: (event) => this._onDragEnd(event),
            },
          })
          .on("tap", (event) => this._onTap(event))
          .on("doubletap", (event) => this._onDoubleTap(event))
          .on("down", (event) => this._onPointerDown(event))
          .on("up", (event) => this._onPointerUp(event));

        // Configure double-tap detection settings
        if (interactable.options && interactable.options.actions) {
          interactable.options.actions.doubletap = {
            interval: 500,
            distance: 30,
          };
        }
      });

      // Configure global container interactions
      var containerInteractable = window.interact("#piecesContainer");
      containerInteractable.unset();
      containerInteractable = window.interact("#piecesContainer");
      containerInteractable.on("tap", (event) => this._onContainerTap(event));

      console.log("[interactionManager] interact.js configured successfully");
    } catch (error) {
      console.error(
        "[interactionManager] Error configuring interact.js:",
        error
      );
      throw error;
    }

    // Register curvature callback for shuffle-based detachment
    const curvatureThreshold = 8;
    console.log(
      `[interactionManager] Curvature threshold for detachment: ${curvatureThreshold}`
    );

    dragMonitor.registerCurvatureCallback(curvatureThreshold, (data) => {
      this.highCurvatureDetach = true;
      console.log(
        `[DragMonitor] HIGH curvature detected (shuffle motion)! Curvature: ${data.curvature.toFixed(
          2
        )} (threshold: ${data.threshold}) - enabling detachment mode`
      );
    });

    // Install keyboard event listeners
    this._installKeyboardListeners();
  }

  _installKeyboardListeners() {
    window.addEventListener("keydown", (e) => {
      const selectedPiece = hlHandler.getSelectedPiece();
      if (!selectedPiece) return;

      if (e.key === "r" || e.key === "R") {
        const rotationAmount = e.shiftKey ? 270 : 90;
        hlHandler.onPieceRotated(selectedPiece.id, rotationAmount);
      }
    });
  }

  addPieceInteraction(element) {
    if (!window.interact) {
      console.error("[interactionManager] interact.js is not loaded!");
      return;
    }

    const interactable = window.interact(element);

    interactable
      .draggable({
        origin: "self",
        listeners: {
          start: (event) => this._onDragStart(event),
          move: (event) => this._onDragMove(event),
          end: (event) => this._onDragEnd(event),
        },
      })
      .on("tap", (event) => this._onTap(event))
      .on("doubletap", (event) => this._onDoubleTap(event))
      .on("down", (event) => this._onPointerDown(event))
      .on("up", (event) => this._onPointerUp(event));

    if (interactable.options && interactable.options.actions) {
      interactable.options.actions.doubletap = {
        interval: 500,
        distance: 30,
      };
    }
  }

  _onDragStart(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = element.dataset.id;
    const numericId = parseInt(pieceId, 10);

    hlHandler.onPieceSelected(numericId);

    if (event.interaction.pointerType === "touch") {
      this.activeTouchIds.add(event.interaction.id);
    }

    clearAllPieceOutlines();

    this.isDragging = true;
    this._clearDragPauseTimer();

    const isShiftPressed = event.shiftKey;
    const multiTouchDetach =
      event.interaction.pointerType === "touch" &&
      this.activeTouchIds.size >= 2;

    const longPressDetach =
      this.longPressStartTime !== null &&
      String(this.longPressPieceId) === String(pieceId) &&
      performance.now() - this.longPressStartTime >= LONG_PRESS_DURATION_MS;

    if (isShiftPressed || multiTouchDetach || longPressDetach) {
      hlHandler.onPieceDetached(numericId);
      element.setAttribute("data-detached", "true");
    }

    element.classList.remove("long-press-active");

    this._clearLongPressTimer();
    this.longPressStartTime = null;
    this.longPressPieceId = null;
  }

  _onDragMove(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = element.dataset.id;
    const numericId = parseInt(pieceId, 10);
    const piece = state.pieces.find((p) => p.id === numericId);

    if (!piece) return;

    dragMonitor.dragEvent({
      x: event.client.x,
      y: event.client.y,
      timestamp: performance.now(),
    });

    const viewportState = getViewportState();

    const deltaX = event.dx / viewportState.zoomLevel;
    const deltaY = event.dy / viewportState.zoomLevel;

    if (this.highCurvatureDetach && !element.hasAttribute("data-detached")) {
      const group = groupManager.getGroup(piece.groupId);
      if (group && group.size() > 1) {
        hlHandler.onPieceDetached(piece.id);
        element.setAttribute("data-detached", "true");
      }
      this.highCurvatureDetach = false;
    }

    this._clearDragPauseTimer();
    element.classList.remove("long-press-active");

    if (!element.hasAttribute("data-detached") && piece.groupId) {
      const group = groupManager.getGroup(piece.groupId);
      if (group && group.size() > 1) {
        this.dragPauseTimer = setTimeout(() => {
          element.classList.add("long-press-active");
          hlHandler.onPieceDetached(piece.id);
          element.setAttribute("data-detached", "true");
          setTimeout(() => {
            element.classList.remove("long-press-active");
          }, 300);
        }, LONG_PRESS_DURATION_MS);
      }
    }

    hlHandler.onPieceDragged(piece.id, new Point(deltaX, deltaY));
    this._checkBoundaries(element, piece);
    handleDragMove(piece);
  }

  _onDragEnd(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = element.dataset.id;
    const numericId = parseInt(pieceId, 10);

    if (event.interaction.pointerType === "touch") {
      this.activeTouchIds.delete(event.interaction.id);
    }

    this.isDragging = false;
    this._clearDragPauseTimer();
    element.classList.remove("long-press-active");
    this.highCurvatureDetach = false;

    dragMonitor.endDrag();

    element.removeAttribute("data-detached");

    const wentOutside = element.hasAttribute("data-outside");
    if (wentOutside) {
      element.removeAttribute("data-outside");
    }

    hlHandler.onPieceDragEnded(numericId, wentOutside);
  }

  _onPointerDown(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = element.dataset.id;

    this.longPressStartTime = performance.now();
    this.longPressPieceId = pieceId;

    this._clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      const el = this.pieceElements.get(parseInt(pieceId, 10));
      if (el) {
        el.classList.add("long-press-active");
      }
    }, LONG_PRESS_DURATION_MS);
  }

  _onPointerUp(event) {
    const element = event.target.closest(".piece") || event.target;

    element.classList.remove("long-press-active");

    this._clearLongPressTimer();
    this.longPressStartTime = null;
    this.longPressPieceId = null;
  }

  _onTap(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = element.dataset.id;
    const numericId = parseInt(pieceId, 10);

    hlHandler.onPieceSelected(numericId);
  }

  _onDoubleTap(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = element.dataset.id;
    const numericId = parseInt(pieceId, 10);

    element.classList.remove("long-press-active");
    this._clearLongPressTimer();
    this.longPressStartTime = null;
    this.longPressPieceId = null;

    event.preventDefault();
    event.stopPropagation();

    hlHandler.onPieceRotated(numericId, 90);
  }

  _onContainerTap(event) {
    if (
      event.target.id === "piecesContainer" ||
      event.target.classList.contains("pieces-viewport")
    ) {
      this._clearLongPressTimer();
      this.longPressStartTime = null;
      this.longPressPieceId = null;

      hlHandler.onPieceDeselected();
    }
  }

  _checkBoundaries(element, piece) {
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

  getSelectedPiece() {
    return hlHandler.getSelectedPiece();
  }

  fixSelectedPieceOrientation() {
    return hlHandler.fixSelectedPieceOrientation();
  }

  getPieceElement(id) {
    return this.pieceElements.get(id);
  }

  applyHighlight(pieceId) {
    displayApplyHighlight(pieceId);
  }

  _clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  _clearDragPauseTimer() {
    if (this.dragPauseTimer) {
      clearTimeout(this.dragPauseTimer);
      this.dragPauseTimer = null;
    }
  }
}
