// pieceRenderer.js - render real jigsaw piece bitmaps with interact.js

// SpatialIndex creation moved into GameTableController (central management)
import { state } from "./gameEngine.js";
import { initConnectionManager } from "./connectionManager.js";
import { updateProgress } from "./controlBar.js";
import { Point } from "./geometry/Point.js";
import { applyPieceTransform } from "./display.js";
import { DEFAULT_PIECE_SCALE } from "./constants/PieceConstants.js";
import { groupManager } from "./GroupManager.js";
import { gameTableController } from "./GameTableController.js";
import {
  initializeInteractions,
  getSelectedPiece,
  fixSelectedPieceOrientation,
  setSelectionChangeCallback,
  getPieceElement,
  applyHighlight,
} from "./interactionManager.js";
// windowManager no longer needed for cross-window transfer (single-window mode)

const pieceElements = new Map(); // id -> DOM element

// ================================
// Module Constants (magic numbers -> named)
// ================================
const DEFAULT_RENDER_SCALE = DEFAULT_PIECE_SCALE; // Use consistent scale everywhere
const MIN_RENDERED_DIMENSION = 24; // Minimum drawn width/height to keep piece interactable
const OUTSIDE_THRESHOLD_PX = 40; // Distance from right boundary to mark piece as 'outside'
const DETACH_FLASH_DURATION_MS = 1000; // Duration of detached visual indicator
const CONNECTION_TOLERANCE_SQ = 30 * 30; // Squared distance tolerance passed to connection manager (~30px)
const DOUBLE_TAP_MAX_DELAY_MS = 320; // Max delay between taps to count as double-tap
const DOUBLE_TAP_MAX_DIST_SQ = 26 * 26; // Spatial tolerance between taps

// Keep old constant name for backward compatibility inside this module (if referenced elsewhere)
const SCALE = DEFAULT_RENDER_SCALE;
// spatialIndex is now owned by GameTableController; do not manage locally here.

// Ensure piece has proper position setup (now handled by Piece class)
// This function is now mainly for backward compatibility
function ensurePiecePosition(piece) {
  // Piece class instances already have position and accessors set up
  if (piece.position instanceof Point) return piece;

  // Handle missing position (should be rare with new Piece class)
  if (!piece.position || !(piece.position instanceof Point)) {
    const initX = piece.position?.x || 0;
    const initY = piece.position?.y || 0;
    piece.position = new Point(initX, initY);
  }

  return piece;
}

// Treat element dimensions as a Point (width -> x, height -> y) for geometric ops.
function elementSizePoint(el) {
  return new Point(el.offsetWidth, el.offsetHeight);
}

function rotatePieceOrGroup(piece, el, rotationDegrees = 90) {
  const group = groupManager.getGroup(piece.groupId);
  const groupPieces = group ? group.getPieces() : [piece];

  if (groupPieces.length > 1) {
    const getPieceElement = (id) => pieceElements.get(id);
    group.rotate(rotationDegrees, piece, getPieceElement);
  } else {
    piece.rotate(rotationDegrees);
    el.style.transform = `rotate(${piece.rotation}deg)`;
  }
  ensureRectInView(piece.position, new Point(el.offsetWidth, el.offsetHeight), {
    forceZoom: false,
  });
}

export function scatterInitialPieces(container, pieces) {
  // Use viewport dimensions rather than container bounds since pieces are positioned in viewport space
  const areaW = container.clientWidth || 800; // fallback if no size
  const areaH = container.clientHeight || 600;
  console.debug("[pieceRenderer] scatterInitialPieces count", pieces.length);
  pieceElements.clear();
  // Initialize spatial index
  const avgSize =
    (pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) / pieces.length) *
    SCALE;
  // Spatial index will be initialized later by controller once DOM elements are ready
  pieces.forEach((p) => {
    const wrapper = document.createElement("div");
    wrapper.className = "piece";
    wrapper.dataset.id = p.id;
    // Use a canvas element to draw the piece bitmap (already clipped) scaled down.
    const canvas = document.createElement("canvas");
    const scaledW = Math.max(MIN_RENDERED_DIMENSION, p.bitmap.width * SCALE);
    const scaledH = Math.max(MIN_RENDERED_DIMENSION, p.bitmap.height * SCALE);
    canvas.width = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.drawImage(p.bitmap, 0, 0);
    ctx.restore();
    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + "px";
    const left = Math.random() * (areaW - scaledW);
    const top = Math.random() * (areaH - scaledH);
    // Random placement uses center semantics directly
    const centerPoint = new Point(left + scaledW / 2, top + scaledH / 2);
    ensurePiecePosition(p); // installs accessors early
    // Derive internal position from visual center
    p.placeCenter(centerPoint, wrapper);
    applyPieceTransform(wrapper, p);
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    pieceElements.set(p.id, wrapper);
    // Position already set & applied above
    p.scale = SCALE;
    // Insert true visual center into spatial index
    // Index update handled by controller after rebuild
  });

  // Initialize GroupManager with pieces
  groupManager.initialize();

  // Initialize connection manager once pieces are ready
  initConnectionManager({
    getPieceById: (id) => state.pieces.find((pp) => pp.id === id),
    tolerance: CONNECTION_TOLERANCE_SQ, // squared distance tolerance (~30px)
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });

  // Initialize interact.js for all pieces
  // Attach spatial index directly to controller prior to enabling interactions
  // Initialize spatial index now that elements exist & positions known
  gameTableController.initializeSpatialIndex(areaW, areaH);
  initializeInteractions(pieceElements);
  // Sync controller positions after scattering
  gameTableController.syncAllPositions();
}

// Render pieces using their saved position and rotation instead of scattering.
// Creates a fresh spatial index reflecting current positions.
export function renderPiecesAtPositions(container, pieces) {
  const areaW = container.clientWidth || 800;
  const areaH = container.clientHeight || 600;
  console.debug("[pieceRenderer] renderPiecesAtPositions count", pieces.length);
  pieceElements.clear();
  // Initialize spatial index based on average size similar to scatter
  const avgSize =
    (pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) / pieces.length) *
    (pieces[0]?.scale || SCALE || 0.7);
  // Defer spatial index creation until after elements appended
  pieces.forEach((p) => {
    const wrapper = document.createElement("div");
    wrapper.className = "piece";
    wrapper.dataset.id = p.id;
    const canvas = document.createElement("canvas");
    const scale = p.scale || SCALE;
    const scaledW = Math.max(24, p.bitmap.width * scale);
    const scaledH = Math.max(24, p.bitmap.height * scale);
    canvas.width = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(p.bitmap, 0, 0);
    ctx.restore();
    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + "px";
    // Determine semantics
    const fallbackLeft = Math.random() * (areaW - scaledW);
    const fallbackTop = Math.random() * (areaH - scaledH);
    ensurePiecePosition(p);
    // All saved positions are internal; no semantic conversion.
    applyPieceTransform(wrapper, p);
    wrapper.appendChild(canvas);
    // Position already set & applied above
    p.scale = scale;
    pieceElements.set(p.id, wrapper);
    container.appendChild(wrapper);
    // Controller will rebuild index after all pieces
  });

  // Initialize GroupManager with pieces
  groupManager.initialize();

  initConnectionManager({
    getPieceById: (id) => state.pieces.find((pp) => pp.id === id),
    tolerance: 900,
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });

  // Initialize interact.js for all pieces
  gameTableController.initializeSpatialIndex(areaW, areaH);
  initializeInteractions(pieceElements);
  // Sync controller positions after rendering
  gameTableController.syncAllPositions();
}

// Event handling now managed by interact.js in interactionManager.js

// Legacy moveGroup removed – group movement now handled exclusively by GameTableController via interactionManager

function getGroupPieces(piece) {
  // Use GroupManager - offensive programming
  const group = groupManager.getGroup(piece.groupId);
  return group ? group.getPieces() : [piece];
}

function detachPieceFromGroup(piece) {
  const oldGroupId = piece.groupId;

  console.debug(
    "[pieceRenderer] Detaching piece",
    piece.id,
    "from group",
    oldGroupId
  );

  // Create a new unique group for this piece using GroupManager
  const newGroup = groupManager.detachPiece(piece);
  if (!newGroup) {
    console.error(
      "[pieceRenderer] GroupManager detachment failed - piece cannot be detached"
    );
    return; // Exit early if detachment fails
  }

  // Add visual indication that this piece is detached
  const el = pieceElements.get(piece.id);
  if (el) {
    el.classList.add("detached-piece");
    // Remove the class after a short time to show the action
    setTimeout(
      () => el.classList.remove("detached-piece"),
      DETACH_FLASH_DURATION_MS
    );
  }

  console.debug(
    "[pieceRenderer] Piece",
    piece.id,
    "moved to new group",
    newGroupId
  );

  // Update progress after detachment
  updateProgress();

  // TODO: In the future, implement proper group splitting if the removal
  // breaks the group into multiple disconnected components
}

function moveSinglePiece(piece, delta) {
  // Retained only for potential future direct piece animations; not used in drag path.
  const d =
    delta instanceof Point ? delta : new Point(delta.x || 0, delta.y || 0);
  piece.move(d);
  const el = pieceElements.get(piece.id);
  if (el) {
    applyPieceTransform(el, piece);
  }
  // Spatial index update delegated to controller via setPiecePosition / rebuilds.
}

// applyHighlight function moved to interactionManager.js

// Selection and interaction functions moved to interactionManager.js

// Global event handling now managed by interact.js in interactionManager.js

// Lookup piece by ID from state
function findPiece(id) {
  // Use the imported state from gameEngine
  return state.pieces.find((p) => p.id === id);
}

// transferPieceToTable removed (single-window mode)

// cloneBitmapPayload removed (no longer needed with dataURL strategy)
