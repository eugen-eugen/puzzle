// pieceRenderer.js - render real jigsaw piece bitmaps with interact.js
import { state } from "./game-engine.js";
import { initConnectionManager } from "./logic/connection-manager.js";
import { Point } from "./geometry/point.js";
import { applyPieceTransform } from "./ui/display.js";
import { DEFAULT_PIECE_SCALE } from "./constants/piece-constants.js";
import { groupManager } from "./logic/group-manager.js";
import { gameTableController } from "./logic/game-table-controller.js";
import { UIInteractionManager } from "./ui/ui-interaction-manager.js";

const pieceElements = new Map(); // id -> DOM element
let uiManager = null; // Will be initialized with pieceElements

// ================================
// Module Constants (magic numbers -> named)
// ================================
const DEFAULT_RENDER_SCALE = DEFAULT_PIECE_SCALE; // Use consistent scale everywhere
const MIN_RENDERED_DIMENSION = 24; // Minimum drawn width/height to keep piece interactable

const SCALE = DEFAULT_RENDER_SCALE;

function ensurePiecePosition(piece) {
  // Piece class instances already have position managed by gameTableController
  const position = gameTableController.getPiecePosition(piece.id);
  if (position instanceof Point) return piece;

  // Handle missing position (should be rare with new Piece class)
  const existingPos = gameTableController.getPiecePosition(piece.id);
  if (!existingPos || !(existingPos instanceof Point)) {
    const initX = existingPos?.x || 0;
    const initY = existingPos?.y || 0;
    gameTableController.setPiecePosition(piece.id, new Point(initX, initY));
  }

  return piece;
}

export function scatterInitialPieces(container, pieces, noRotate = false) {
  const areaW = container.clientWidth || 800; // fallback if no size
  const areaH = container.clientHeight || 600;

  pieceElements.clear();
  const avgSize =
    (pieces.reduce(
      (acc, p) => acc + Math.min(p.imgRect.width, p.imgRect.height),
      0
    ) /
      pieces.length) *
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
    p.scale = DEFAULT_PIECE_SCALE;
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

  uiManager = new UIInteractionManager(pieceElements);

  // Step 4: Apply final positions and transforms
  pieces.forEach((p, index) => {
    const wrapper = pieceElements.get(p.id);
    gameTableController.placePieceCenter(p.id, positions[index], wrapper);
    applyPieceTransform(p);
  });

  groupManager.initialize();

  initConnectionManager({});

  gameTableController.updateViewportArea(areaW, areaH);
  gameTableController.syncAllPositions();
  gameTableController.attachPieceElements(pieceElements);
}

// Render pieces using their saved position and rotation instead of scattering.
// Creates a fresh spatial index reflecting current positions.
export function renderPiecesAtPositions(container, pieces) {
  const areaW = container.clientWidth || 800;
  const areaH = container.clientHeight || 600;
  console.debug("[pieceRenderer] renderPiecesAtPositions count", pieces.length);
  pieceElements.clear();
  const avgSize =
    (pieces.reduce(
      (acc, p) => acc + Math.min(p.imgRect.width, p.imgRect.height),
      0
    ) /
      pieces.length) *
    (pieces[0]?.scale || DEFAULT_PIECE_SCALE || 0.7);
  pieces.forEach((p) => {
    const wrapper = document.createElement("div");
    wrapper.className = "piece";
    wrapper.dataset.id = p.id;
    const canvas = document.createElement("canvas");
    const scale = p.scale || DEFAULT_PIECE_SCALE;
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
    applyPieceTransform(p);
    wrapper.appendChild(canvas);
    // Position already set & applied above
    p.scale = scale;
    pieceElements.set(p.id, wrapper);
    container.appendChild(wrapper);
  });

  groupManager.initialize();

  initConnectionManager({
    tolerance: 900,
  });

  gameTableController.updateViewportArea(areaW, areaH);
  gameTableController.syncAllPositions();
  // Initialize maxZIndex from loaded pieces
  gameTableController.initializeMaxZIndex();
  gameTableController.attachPieceElements(pieceElements);
  uiManager = new UIInteractionManager(pieceElements);
}

function getGroupPieces(piece) {
  // Use GroupManager - offensive programming
  const group = groupManager.getGroup(piece.groupId);
  return group ? group.allPieces : [piece];
}

function moveSinglePiece(piece, delta) {
  // Retained only for potential future direct piece animations; not used in drag path.
  const d =
    delta instanceof Point ? delta : new Point(delta.x || 0, delta.y || 0);
  gameTableController.movePiece(piece.id, d);
  const el = pieceElements.get(piece.id);
  if (el) {
    applyPieceTransform(piece);
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

// Export wrapper functions that delegate to uiManager
export function getSelectedPiece() {
  return uiManager ? uiManager.getSelectedPiece() : null;
}

export function fixSelectedPieceOrientation() {
  return uiManager ? uiManager.fixSelectedPieceOrientation() : null;
}

export function getPieceElement(id) {
  return pieceElements.get(id);
}
