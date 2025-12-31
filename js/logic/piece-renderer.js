// pieceRenderer.js - render real jigsaw piece bitmaps with interact.js
import { state } from "../game-engine.js";
import { initConnectionManager } from "./connection-manager.js";
import { Point } from "../geometry/point.js";
import { applyPieceTransform, createPieceElement } from "../ui/display.js";
import { DEFAULT_PIECE_SCALE } from "../constants/piece-constants.js";
import { groupManager } from "./group-manager.js";
import { gameTableController } from "./game-table-controller.js";
import { UIInteractionManager } from "../ui/ui-interaction-manager.js";

/**
 * Map of piece IDs to their DOM elements
 * @type {Map<number, HTMLElement>}
 */
const pieceElements = new Map();

/**
 * UI interaction manager instance for handling piece interactions
 * @type {UIInteractionManager|null}
 */
let uiManager = null;

// ================================
// Module Constants (magic numbers -> named)
// ================================
const DEFAULT_RENDER_SCALE = DEFAULT_PIECE_SCALE; // Use consistent scale everywhere

const SCALE = DEFAULT_RENDER_SCALE;

/**
 * Scatter puzzle pieces randomly across the container with optional rotation
 *
 * This function:
 * 1. Applies random rotation (0°, 90°, 180°, 270°) to each piece (unless noRotate is true)
 * 2. Creates DOM elements for all pieces
 * 3. Shuffles piece positions using Fisher-Yates algorithm
 * 4. Initializes group manager and connection manager
 * 5. Sets up UI interaction manager
 *
 * @param {HTMLElement} container - The DOM container to render pieces into
 * @param {Piece[]} pieces - Array of puzzle pieces to scatter
 * @param {boolean} [noRotate=false] - If true, all pieces are set to 0° rotation instead of random
 * @returns {void}
 */
export function scatterInitialPieces(container, pieces, noRotate = false) {
  const areaW = container.clientWidth || 800; // fallback if no size
  const areaH = container.clientHeight || 600;

  pieceElements.clear();

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
  pieces.forEach((p) => {
    const wrapper = createPieceElement(p, SCALE);

    container.appendChild(wrapper);
    pieceElements.set(p.id, wrapper);
    p.scale = DEFAULT_PIECE_SCALE;
  });

  uiManager = new UIInteractionManager(pieceElements);

  // Step 3: Randomly shuffle positions by swapping N random pairs
  const indices = Array.from({ length: pieces.length }, (_, i) => i);

  // Perform N random swaps (Fisher-Yates shuffle)
  for (let swapCount = 0; swapCount < pieces.length; swapCount++) {
    const i = Math.floor(Math.random() * pieces.length);
    const j = Math.floor(Math.random() * pieces.length);
    // Swap indices[i] and indices[j]
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Step 4: Apply final positions and transforms
  pieces.forEach((p, index) => {
    const wrapper = pieceElements.get(p.id);
    gameTableController.setPiecePosition(
      p.id,
      pieces[indices[index]].imgRect.position,
      wrapper
    );
    applyPieceTransform(p);
  });

  groupManager.initialize();

  initConnectionManager({});

  gameTableController.updateViewportArea(areaW, areaH);
  gameTableController.syncAllPositions();
  gameTableController.attachPieceElements(pieceElements);
}

/**
 * Render puzzle pieces at their saved positions and rotations
 *
 * Used when loading a saved game to restore pieces to their exact previous state.
 * Unlike scatterInitialPieces, this preserves existing positions, rotations, and z-indices.
 * Creates fresh spatial index and initializes all managers for the loaded state.
 *
 * @param {HTMLElement} container - The DOM container to render pieces into
 * @param {Piece[]} pieces - Array of puzzle pieces with saved positions/rotations
 * @returns {void}
 */
export function renderPiecesAtPositions(container, pieces) {
  const areaW = container.clientWidth || 800;
  const areaH = container.clientHeight || 600;
  pieceElements.clear();
  const avgSize =
    (pieces.reduce(
      (acc, p) => acc + Math.min(p.imgRect.width, p.imgRect.height),
      0
    ) /
      pieces.length) *
    (pieces[0]?.scale || DEFAULT_PIECE_SCALE || 0.7);

  pieces.forEach((p) => {
    const scale = p.scale || DEFAULT_PIECE_SCALE;
    const wrapper = createPieceElement(p, scale);

    // Apply z-index if piece has one
    if (p.zIndex !== null && p.zIndex !== undefined) {
      wrapper.style.zIndex = p.zIndex.toString();
    }

    applyPieceTransform(p);

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

  pieces.forEach((p, index) => applyPieceTransform(p));
}

/**
 * Get the DOM element for a specific piece by its ID
 * @param {number} id - The piece ID to look up
 * @returns {HTMLElement|undefined} The DOM element for the piece, or undefined if not found
 */
export function getPieceElement(id) {
  return pieceElements.get(id);
}
