// hl-interaction-handler.js - High-level interaction handler for puzzle pieces
// Handles game logic, piece/group operations, and state management

import { Point } from "../geometry/point.js";
import { fitAllPiecesInView, calculatePiecesBounds } from "../app.js";
import { groupManager } from "../group-manager.js";
import { gameTableController } from "../game-table-controller.js";
import { handleDragEnd } from "../connection-manager.js";
import { state } from "../game-engine.js";

// State management
let selectedPiece = null;
let onSelectionChangeCallback = null;
let visualListeners = null;

/**
 * Initialize the high-level interaction handler
 * @param {Object} listeners - Visual feedback listeners
 */
export function initialize(listeners) {
  visualListeners = listeners;
}

/**
 * Handle piece selection
 * @param {number} pieceId - The ID of the piece to select
 */
export function onPieceSelected(pieceId) {
  // Convert to numeric ID for consistency
  const numericId =
    typeof pieceId === "string" ? parseInt(pieceId, 10) : pieceId;

  // Handle invalid/NaN IDs
  if (isNaN(numericId) || numericId == null) {
    console.warn("[hlInteractionHandler] onPieceSelected: invalid ID", pieceId);
    return;
  }

  // Find the piece
  const piece = findPiece(numericId);
  if (!piece) {
    console.warn(
      "[hlInteractionHandler] onPieceSelected: piece not found for ID",
      numericId
    );
    return;
  }

  if (selectedPiece?.id === numericId) return;

  const prevPieceId = selectedPiece?.id ?? null;
  selectedPiece = piece;

  // Bring selected piece and its entire group to the front
  gameTableController.bringToFront(numericId);

  // Notify visual listener for CSS class changes
  if (visualListeners?.onPieceSelectedVisual) {
    visualListeners.onPieceSelectedVisual(numericId, prevPieceId);
  }

  // Notify callback
  if (onSelectionChangeCallback) {
    onSelectionChangeCallback(piece);
  }
}

/**
 * Handle piece deselection
 */
export function onPieceDeselected() {
  if (selectedPiece) {
    const pieceId = selectedPiece.id;
    selectedPiece = null;

    // Notify visual listener for CSS class changes
    if (visualListeners?.onPieceDeselectedVisual) {
      visualListeners.onPieceDeselectedVisual(pieceId);
    }

    if (onSelectionChangeCallback) {
      onSelectionChangeCallback(null);
    }
  }
}

/**
 * Handle piece dragging
 * @param {number} pieceId - The ID of the piece being dragged
 * @param {Point} delta - The movement delta
 */
export function onPieceDragged(pieceId, delta) {
  const piece = findPiece(pieceId);
  if (!piece) return;

  // Move piece or group
  if (!piece.groupId) {
    gameTableController.movePiece(piece.id, delta);
  } else {
    gameTableController.moveGroup(piece.groupId, delta);
  }
}

/**
 * Handle drag end
 * @param {number} pieceId - The ID of the piece that was dragged
 * @param {boolean} wentOutside - Whether the piece went outside boundaries
 */
export function onPieceDragEnded(pieceId, wentOutside) {
  const piece = findPiece(pieceId);
  if (!piece) return;

  // Handle connection logic
  handleDragEnd(piece, false);

  if (wentOutside) {
    fitAllPiecesInView();
  } else {
    // Notify visual listener to ensure piece is in view
    if (visualListeners?.onEnsurePieceInView) {
      visualListeners.onEnsurePieceInView(pieceId);
    }
  }
}

/**
 * Handle piece rotation
 * @param {number} pieceId - The ID of the piece to rotate
 * @param {number} rotationDegrees - The rotation amount in degrees
 */
export function onPieceRotated(pieceId, rotationDegrees) {
  const piece = findPiece(pieceId);
  if (!piece) return;

  // Check if rotation is disabled
  if (state.noRotate) {
    console.log("[hlInteractionHandler] Rotation disabled (noRotate mode)");
    return;
  }

  gameTableController.rotatePieceOrGroup(piece.id, rotationDegrees);

  // Notify visual listener to ensure piece is in view
  if (visualListeners?.onEnsurePieceInView) {
    visualListeners.onEnsurePieceInView(pieceId);
  }
}

/**
 * Handle piece detachment from group
 * @param {number} pieceId - The ID of the piece to detach
 */
export function onPieceDetached(pieceId) {
  const piece = findPiece(pieceId);
  if (!piece) return;

  // Use GroupManager for proper connectivity handling
  const newGroup = groupManager.detachPiece(piece);

  if (!newGroup) {
    console.error(
      "[hlInteractionHandler] GroupManager detachment failed - piece cannot be detached"
    );
    return;
  }

  // Bring detached piece to front to ensure it's above the original group
  gameTableController.bringToFront(piece.id);

  // Notify visual listener for CSS class changes
  if (visualListeners?.onPieceDetachedVisual) {
    visualListeners.onPieceDetachedVisual(piece.id);
  }
}

/**
 * Get the currently selected piece
 * @returns {object|null} The selected piece or null
 */
export function getSelectedPiece() {
  return selectedPiece;
}

/**
/**
 * Fix the orientation of the selected piece
 * @returns {boolean} True if orientation was fixed, false otherwise
 */
export function fixSelectedPieceOrientation() {
  if (!selectedPiece) return false;

  const currentRotation = selectedPiece.rotation;
  if (currentRotation === 0) return true;

  let targetRotation = -currentRotation;
  if (targetRotation <= -180) targetRotation += 360;
  if (targetRotation > 180) targetRotation -= 360;

  // Check if piece is in a multi-piece group
  const group = groupManager.getGroup(selectedPiece.groupId);
  const isMultiPieceGroup = group && group.size() > 1;

  if (isMultiPieceGroup) {
    gameTableController.rotateGroup(group.id, targetRotation, selectedPiece);
  } else {
    gameTableController.rotatePiece(selectedPiece.id, targetRotation);
  }

  return true;
}
/**
 * Set callback for selection changes
 * @param {Function} callback - Callback function to call on selection change
 */
export function setSelectionChangeCallback(callback) {
  onSelectionChangeCallback = callback;
}

/**
 * Find piece by ID
 * @param {number|string} id - Piece ID
 * @returns {object|undefined} The piece object
 */
function findPiece(id) {
  const numericId = typeof id === "string" ? parseInt(id, 10) : id;
  return state.pieces.find((p) => p.id === numericId);
}
