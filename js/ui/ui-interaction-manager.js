// ui-interaction-manager.js - GUI interaction handler for puzzle pieces
// Handles browser events, gesture detection, and visual feedback

import { Point } from "../geometry/point.js";
import {
  applyHighlight as displayApplyHighlight,
  ensureRectInView,
  getViewportState,
  clearAllPieceOutlines,
  getPanOffset,
  setPanOffset,
  setIsPanning,
  getIsPanning,
  setLastPanPosition,
  getLastPanPosition,
} from "./display.js";
import { state } from "../game-engine.js";
import { requestAutoSave } from "../persistence.js";
import { groupManager } from "../logic/group-manager.js";
import * as hlHandler from "../interaction/hl-interaction-handler.js";
import { gameTableController } from "../logic/game-table-controller.js";
import {
  PIECE_SELECT,
  PIECE_DESELECT,
  PIECE_DETACH_ANIMATION,
  PIECE_LONG_PRESS_START,
  PIECE_LONG_PRESS_END,
  PIECE_ROTATE,
  DRAG_MOVE,
  DRAG_END,
  DRAG_HIGH_CURVATURE,
} from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";

// Constants for interaction behavior
const OUTSIDE_THRESHOLD_PX = 40;
const LONG_PRESS_DURATION_MS = 1000; // Duration for long press to trigger detach

export class UIInteractionManager {
  constructor(pieceElementsMap) {
    // Implement singleton pattern

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
    // Initialize high-level handler with listeners for visual feedback
    hlHandler.initialize({
      onPieceSelectedVisual: (pieceId, prevPieceId) => {
        // Remove selection from previous piece
        if (prevPieceId != null) {
          document.dispatchEvent(
            new CustomEvent(PIECE_DESELECT, {
              detail: { pieceId: prevPieceId },
            })
          );
        }
        // Add selection to new piece
        document.dispatchEvent(
          new CustomEvent(PIECE_SELECT, {
            detail: { pieceId },
          })
        );
      },
      onPieceDeselectedVisual: (pieceId) => {
        document.dispatchEvent(
          new CustomEvent(PIECE_DESELECT, {
            detail: { pieceId },
          })
        );
      },
      onPieceDetachedVisual: (pieceId) => {
        document.dispatchEvent(
          new CustomEvent(PIECE_DETACH_ANIMATION, {
            detail: { pieceId },
          })
        );
      },
      onEnsurePieceInView: (pieceId) => {
        const piece = state.pieces.find((p) => p.id === pieceId);
        const el = this.pieceElements.get(pieceId);
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

    try {
      // Configure interact.js for each piece individually
      this.pieceElements.forEach((element, pieceId) => {
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
      containerInteractable
        .on("tap", (event) => this._onContainerTap(event))
        .draggable({
          ignoreFrom: ".piece",
          listeners: {
            start: (event) => this._onViewportDragStart(event),
            move: (event) => this._onViewportDragMove(event),
            end: (event) => this._onViewportDragEnd(event),
          },
        });
    } catch (error) {
      console.error(
        "[interactionManager] Error configuring interact.js:",
        error
      );
      throw error;
    }

    // Listen for high curvature detection from drag monitor
    registerGlobalEvent(DRAG_HIGH_CURVATURE, (event) => {
      this.highCurvatureDetach = true;
    });
  }

  addPieceInteraction(element) {
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
    const { element, pieceId } = this.getNearestPieceId(event);

    hlHandler.onPieceSelected(pieceId);

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
      hlHandler.onPieceDetached(pieceId);
    }

    document.dispatchEvent(
      new CustomEvent(PIECE_LONG_PRESS_END, {
        detail: { pieceId },
      })
    );

    this._clearLongPressTimer();
    this.longPressStartTime = null;
    this.longPressPieceId = null;
  }

  _onDragMove(event) {
    const { element, pieceId } = this.getNearestPieceId(event);
    const piece = state.pieces.find((p) => p.id === pieceId);

    if (!piece) return;

    document.dispatchEvent(
      new CustomEvent(DRAG_MOVE, {
        detail: {
          piece: piece,
          x: event.client.x,
          y: event.client.y,
          timestamp: performance.now(),
        },
      })
    );

    const viewportState = getViewportState();

    const deltaX = event.dx / viewportState.zoomLevel;
    const deltaY = event.dy / viewportState.zoomLevel;

    if (this.highCurvatureDetach) {
      const group = groupManager.getGroup(piece.groupId);
      if (group && group.size() > 1) {
        hlHandler.onPieceDetached(piece.id);
      }
      this.highCurvatureDetach = false;
    }

    this._clearDragPauseTimer();
    document.dispatchEvent(
      new CustomEvent(PIECE_LONG_PRESS_END, {
        detail: { pieceId },
      })
    );

    if (piece.groupId) {
      const group = groupManager.getGroup(piece.groupId);
      if (group && group.size() > 1) {
        this.dragPauseTimer = setTimeout(() => {
          document.dispatchEvent(
            new CustomEvent(PIECE_LONG_PRESS_START, {
              detail: { pieceId: piece.id },
            })
          );
          hlHandler.onPieceDetached(piece.id);
          setTimeout(() => {
            document.dispatchEvent(
              new CustomEvent(PIECE_LONG_PRESS_END, {
                detail: { pieceId: piece.id },
              })
            );
          }, 300);
        }, LONG_PRESS_DURATION_MS);
      }
    }

    hlHandler.onPieceDragged(piece.id, new Point(deltaX, deltaY));
    this._checkBoundaries(element, piece);
  }

  _onDragEnd(event) {
    const { element, pieceId } = this.getNearestPieceId(event);

    if (event.interaction.pointerType === "touch") {
      this.activeTouchIds.delete(event.interaction.id);
    }

    this.isDragging = false;
    this._clearDragPauseTimer();
    document.dispatchEvent(
      new CustomEvent(PIECE_LONG_PRESS_END, {
        detail: { pieceId },
      })
    );
    this.highCurvatureDetach = false;

    const wentOutside = element.hasAttribute("data-outside");
    if (wentOutside) {
      element.removeAttribute("data-outside");
    }

    const piece = state.pieces.find((p) => p.id === pieceId);
    document.dispatchEvent(
      new CustomEvent(DRAG_END, {
        detail: { pieceId, wentOutside, piece },
      })
    );
  }

  _onPointerDown(event) {
    const { pieceId } = this.getNearestPieceId(event);

    this.longPressStartTime = performance.now();
    this.longPressPieceId = pieceId;

    this._clearLongPressTimer();

    this.longPressTimer = setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent(PIECE_LONG_PRESS_START, {
          detail: { pieceId: parseInt(pieceId, 10) },
        })
      );
    }, LONG_PRESS_DURATION_MS);
  }

  _onPointerUp(event) {
    const { pieceId } = this.getNearestPieceId(event);

    document.dispatchEvent(
      new CustomEvent(PIECE_LONG_PRESS_END, {
        detail: { pieceId },
      })
    );

    this._clearLongPressTimer();
    this.longPressStartTime = null;
    this.longPressPieceId = null;
  }

  _onTap(event) {
    const { pieceId } = this.getNearestPieceId(event);

    hlHandler.onPieceSelected(pieceId);
  }

  _onDoubleTap(event) {
    const { pieceId } = this.getNearestPieceId(event);

    document.dispatchEvent(
      new CustomEvent(PIECE_LONG_PRESS_END, {
        detail: { pieceId },
      })
    );
    this._clearLongPressTimer();
    this.longPressStartTime = null;
    this.longPressPieceId = null;

    event.preventDefault();
    event.stopPropagation();

    document.dispatchEvent(
      new CustomEvent(PIECE_ROTATE, {
        detail: { pieceId, rotation: 90 },
      })
    );
  }

  getNearestPieceId(event) {
    const element = event.target.closest(".piece") || event.target;
    const pieceId = parseInt(element.dataset.id, 10);
    return { element, pieceId };
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

  // Viewport panning handlers
  _onViewportDragStart(event) {
    // Pan with left mouse button when clicking on empty container space (not on pieces)
    const piecesContainer = document.getElementById("piecesContainer");
    event.preventDefault();
    setIsPanning(true);
    setLastPanPosition(new Point(event.client.x, event.client.y));
    piecesContainer.style.cursor = "grabbing";
  }

  _onViewportDragMove(event) {
    event.preventDefault();
    const currentPosition = new Point(event.client.x, event.client.y);
    const delta = currentPosition.sub(getLastPanPosition());
    setPanOffset(getPanOffset().add(delta));
    setLastPanPosition(currentPosition);
  }

  _onViewportDragEnd(event) {
    const piecesContainer = document.getElementById("piecesContainer");
    setIsPanning(false);
    piecesContainer.style.cursor = "grab";
    requestAutoSave();
  }
}
