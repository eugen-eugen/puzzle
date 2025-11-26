// pieceRenderer.js - render real jigsaw piece bitmaps with interact.js
import { state } from "./game-engine.js";
import { initConnectionManager } from "./connection-manager.js";
import { updateProgress } from "./control-bar.js";
import { Point } from "./geometry/point.js";
import { applyPieceTransform } from "./display.js";
import { DEFAULT_PIECE_SCALE } from "./constants/piece-constants.js";
import { groupManager } from "./group-manager.js";
import { gameTableController } from "./game-table-controller.js";
import {
  initializeInteractions,
  getSelectedPiece,
  fixSelectedPieceOrientation,
  setSelectionChangeCallback,
  getPieceElement,
  applyHighlight,
} from "./interaction/interaction-manager.js";

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

const SCALE = DEFAULT_RENDER_SCALE;

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

export function scatterInitialPieces(container, pieces, noRotate = false) {
  const areaW = container.clientWidth || 800; // fallback if no size
  const areaH = container.clientHeight || 600;
  console.debug(
    "[pieceRenderer] scatterInitialPieces count",
    pieces.length,
    "noRotate:",
    noRotate
  );
  pieceElements.clear();
  const avgSize =
    (pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) / pieces.length) *
    SCALE;

  // Step 1: Apply random rotation to each piece (0°, 90°, 180°, or 270°)
  // Skip rotation if noRotate is true
  if (!noRotate) {
    const rotations = [0, 90, 180, 270];
    pieces.forEach((p) => {
      const randomRotation =
        rotations[Math.floor(Math.random() * rotations.length)];
      p.setRotation(randomRotation);
    });
  } else {
    // Set all pieces to 0° rotation
    pieces.forEach((p) => {
      p.setRotation(0);
    });
  }

  // Step 2: Generate initial random positions for all pieces
  const positions = [];
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
    const centerPoint = new Point(left + scaledW / 2, top + scaledH / 2);
    positions.push(centerPoint);
    ensurePiecePosition(p); // installs accessors early
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    pieceElements.set(p.id, wrapper);
    p.scale = SCALE;
  });

  // Step 3: Randomly exchange N pairs of positions (N = number of pieces)
  const N = pieces.length;
  for (let i = 0; i < N; i++) {
    const idx1 = Math.floor(Math.random() * pieces.length);
    const idx2 = Math.floor(Math.random() * pieces.length);
    if (idx1 !== idx2) {
      // Swap positions
      const temp = positions[idx1];
      positions[idx1] = positions[idx2];
      positions[idx2] = temp;
    }
  }

  // Step 4: Apply final positions and transforms
  pieces.forEach((p, index) => {
    const wrapper = pieceElements.get(p.id);
    p.placeCenter(positions[index], wrapper);
    applyPieceTransform(wrapper, p);
  });

  groupManager.initialize();

  initConnectionManager({
    getPieceById: (id) => state.pieces.find((pp) => pp.id === id),
    tolerance: CONNECTION_TOLERANCE_SQ, // squared distance tolerance (~30px)
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });

  gameTableController.updateViewportArea(areaW, areaH);
  gameTableController.syncAllPositions();
  initializeInteractions(pieceElements);
}

// Render pieces using their saved position and rotation instead of scattering.
// Creates a fresh spatial index reflecting current positions.
export function renderPiecesAtPositions(container, pieces) {
  const areaW = container.clientWidth || 800;
  const areaH = container.clientHeight || 600;
  console.debug("[pieceRenderer] renderPiecesAtPositions count", pieces.length);
  pieceElements.clear();
  const avgSize =
    (pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) / pieces.length) *
    (pieces[0]?.scale || SCALE || 0.7);
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
    // Apply z-index if piece has one
    if (p.zIndex !== null && p.zIndex !== undefined) {
      wrapper.style.zIndex = p.zIndex.toString();
    }
    const fallbackLeft = Math.random() * (areaW - scaledW);
    const fallbackTop = Math.random() * (areaH - scaledH);
    ensurePiecePosition(p);
    applyPieceTransform(wrapper, p);
    wrapper.appendChild(canvas);
    // Position already set & applied above
    p.scale = scale;
    pieceElements.set(p.id, wrapper);
    container.appendChild(wrapper);
  });

  groupManager.initialize();

  initConnectionManager({
    getPieceById: (id) => state.pieces.find((pp) => pp.id === id),
    tolerance: 900,
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });

  gameTableController.updateViewportArea(areaW, areaH);
  gameTableController.syncAllPositions();
  // Initialize maxZIndex from loaded pieces
  gameTableController.initializeMaxZIndex();
  initializeInteractions(pieceElements);
}

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
