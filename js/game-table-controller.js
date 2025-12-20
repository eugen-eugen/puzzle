// GameTableController.js
// Central authority for world/table positioning & movement of pieces and groups.
// Goal: Decouple Piece from global table coordinates & neighbor knowledge.
// Phase 1: Introduce controller that owns movement APIs while keeping
//          existing piece.position for backward compatibility.
// Phase 2 (future): Migrate position storage entirely here & deprecate
//                   Piece.isNeighbor / isAnyNeighbor.

import { Point } from "./geometry/point.js";
import {
  applyPieceTransform,
  applyPieceZIndex,
  setPieceElements,
} from "./ui/display.js";
import { groupManager } from "./group-manager.js";
import { state } from "./game-engine.js";
// Spatial index now fully managed here
import { SpatialIndex } from "./utils/spatial-index.js";

/**
 * Contract (Phase 1)
 * - Tracks piece world positions (mirrors Piece.position for now)
 * - Provides movement APIs: movePiece, moveGroup
 * - Provides rotation API delegating to Group.rotate
 * - Provides neighbor detection (controller-based) for future migration
 * - Updates spatial index consistently
 */
export class GameTableController {
  constructor({ spatialIndex = null, pieceElements = null } = {}) {
    // Spatial index internal; external injection deprecated
    this.spatialIndex = spatialIndex;
    this.pieceElements = pieceElements; // Map<pieceId, HTMLElement>

    // Internal store – currently mirrors Piece.position (Point)
    this._piecePositions = new Map(); // id -> Point

    // worldData cache for pieces
    this._worldDataCache = new Map(); // id -> { data, lastPositionX, lastPositionY, lastRotation, lastScale }

    // Z-index management
    this.maxZIndex = 0;

    // Cached area dimensions for spatial index initialization
    this._indexAreaW = null;
    this._indexAreaH = null;
    this._lastIndexSignature = null; // pieceCount|avgSize|areaWxH for avoiding redundant rebuilds

    // Initial bootstrap (may be empty if pieces loaded later)
    this._bootstrapPositions();
  }

  // ----------------------------
  // Initialization
  // ----------------------------
  _bootstrapPositions() {
    if (!state || !state.pieces) return;
    state.pieces.forEach((p) => {
      const position = this.getPiecePosition(p.id);
      if (position instanceof Point) {
        // Position already set during Piece construction
        return;
      }
      // Fallback: if position not yet registered, use stored value
      if (p.displayX !== undefined && p.displayY !== undefined) {
        this._piecePositions.set(p.id, new Point(p.displayX, p.displayY));
      }
    });
  }

  // Full reset & rebuild (used when resuming game or regenerating pieces)
  resetPositions() {
    this._piecePositions.clear();
    this._bootstrapPositions();
  }

  // Sync (non-destructive): update entries for existing pieces; add missing ones
  syncAllPositions() {
    if (!state || !state.pieces) return;
    state.pieces.forEach((p) => {
      const position = this.getPiecePosition(p.id);
      if (!position && p.displayX !== undefined && p.displayY !== undefined) {
        // Register missing position from saved data
        this._piecePositions.set(p.id, new Point(p.displayX, p.displayY));
      }
    });
    // Auto manage spatial index lifecycle (create/rebuild if needed)
    this._autoManageSpatialIndex();
  }

  // Register a single piece (called from Piece constructor)
  registerPiece(piece) {
    if (!piece) return;
    // Position is already set via setPiecePosition in Piece constructor
    // Ensure index exists or updated appropriately
    const hadIndex = !!this.spatialIndex;
    this._autoManageSpatialIndex();
    if (hadIndex && this.spatialIndex) {
      this._updateSpatialIndexFor(piece.id);
    }
  }

  attachSpatialIndex() {
    console.warn(
      "GameTableController.attachSpatialIndex is deprecated – spatial index is internally managed."
    );
  }

  /**
   * Attach piece elements and register with display module
   * @param {Map<number, HTMLElement>} pieceElements - Map of piece IDs to elements
   */
  attachPieceElements(pieceElements) {
    this.pieceElements = pieceElements;
    // Register with display module for z-index management
    setPieceElements(pieceElements);
  }

  /**
   * Bring a piece and its group to the front by assigning new z-index values
   * All pieces in the group get the same new maximum z-index
   * @param {number} pieceId - ID of the piece to bring to front
   */
  bringToFront(pieceId) {
    const piece = state.pieces?.find((p) => p.id === pieceId);
    if (!piece) return;

    const group = groupManager.getGroupForPiece(piece);
    if (!group) return; // Should never happen - every piece belongs to a group

    const piecesToUpdate = group.allPieces;

    // Increment maxZIndex to get a new layer on top
    this.maxZIndex++;
    const newZIndex = this.maxZIndex;

    // Assign the same new z-index to all pieces in the group
    // Update both model and DOM via display module
    piecesToUpdate.forEach((p) => {
      p.zIndex = newZIndex;
      applyPieceZIndex(p.id, newZIndex);
    });
  }

  /**
   * Initialize maxZIndex from existing pieces
   * Called when loading a saved game
   */
  initializeMaxZIndex() {
    if (!state?.pieces) return;

    this.maxZIndex = 0;
    state.pieces.forEach((p) => {
      if (p.zIndex && p.zIndex > this.maxZIndex) {
        this.maxZIndex = p.zIndex;
      }
    });
  }

  // ----------------------------
  // Spatial Index Lifecycle (centralized)
  // ----------------------------
  updateViewportArea(areaW, areaH) {
    this._indexAreaW = areaW;
    this._indexAreaH = areaH;
    // Force recreation if dimensions changed or index missing
    this._autoManageSpatialIndex(true);
  }

  _computeAvgPieceSize() {
    if (!state || !state.pieces || state.pieces.length === 0) return 0;
    return (
      (state.pieces.reduce(
        (acc, p) => acc + Math.min(p.imgRect.width, p.imgRect.height),
        0
      ) /
        state.pieces.length) *
      (state.pieces[0]?.scale || 1)
    );
  }

  _autoManageSpatialIndex(forceRecreate = false) {
    // Need area and pieces
    if (this._indexAreaW == null || this._indexAreaH == null) return;
    if (!state || !state.pieces || state.pieces.length === 0) {
      this.spatialIndex = null;
      this._lastIndexSignature = null;
      return;
    }
    const pieceCount = state.pieces.length;
    const avgSize = this._computeAvgPieceSize();
    const signature = `${pieceCount}|${avgSize.toFixed(2)}|${
      this._indexAreaW
    }x${this._indexAreaH}`;
    const needsCreate = !this.spatialIndex;
    const signatureChanged = this._lastIndexSignature !== signature;
    if (forceRecreate || needsCreate || signatureChanged) {
      this.spatialIndex = new SpatialIndex(
        this._indexAreaW,
        this._indexAreaH,
        avgSize
      );
      this._rebuildSpatialIndex();
      this._lastIndexSignature = signature;
      return;
    }
    // Otherwise incremental updates handled per piece on mutation
  }

  _rebuildSpatialIndex() {
    if (!this.spatialIndex) return;
    const items = [];
    state.pieces.forEach((p) => {
      const el = this._getElement(p.id);
      const center = p.getCenter
        ? p.getCenter(el)
        : this.getPiecePosition(p.id);
      if (center) items.push({ id: p.id, position: center });
    });
    this.spatialIndex.rebuild(items);
  }

  // ----------------------------
  // Position Access
  // ----------------------------
  getPiecePosition(pieceId) {
    return this._piecePositions.get(pieceId) || null;
  }

  /**
   * Get or compute cached worldData for a piece
   * @param {Object} piece - The piece object
   * @returns {Object} {worldCorners, worldSPoints}
   */
  getWorldData(piece) {
    const pieceId = piece.id;
    const currentPosition = this.getPiecePosition(pieceId);

    if (!currentPosition || !(currentPosition instanceof Point)) {
      // Fallback for pieces not yet initialized
      return { worldCorners: {}, worldSPoints: {} };
    }

    const currentRotation = piece.rotation;
    const currentScale = piece.scale;

    // Get cached data
    let cached = this._worldDataCache.get(pieceId);

    // Check if cache is valid
    const positionChanged =
      !cached ||
      currentPosition.x !== cached.lastPositionX ||
      currentPosition.y !== cached.lastPositionY;

    const otherPropsChanged =
      cached &&
      (currentRotation !== cached.lastRotation ||
        currentScale !== cached.lastScale);

    // Invalidate and recompute if needed
    if (!cached || positionChanged || otherPropsChanged) {
      const worldData = this._computeWorldDataInternal(piece);
      cached = {
        data: worldData,
        lastPositionX: currentPosition.x,
        lastPositionY: currentPosition.y,
        lastRotation: currentRotation,
        lastScale: currentScale,
      };
      this._worldDataCache.set(pieceId, cached);
    }

    return cached.data;
  }

  /**
   * Get the center point of a piece based on its actual geometry
   * @param {Object} piece - The piece object
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Point} Center point in world coordinates
   */
  getCenter(piece, element = null) {
    // Calculate offset used in positioning calculations
    const boundingFrame = piece.calculateBoundingFrame();
    const scale = piece.scale;

    let w, h;
    if (element) {
      // Use DOM element dimensions if available
      w = element.offsetWidth;
      h = element.offsetHeight;
    } else {
      // Use scaled bounding frame dimensions when no element is provided
      w = boundingFrame.width * scale;
      h = boundingFrame.height * scale;
    }

    const canvasCenter = new Point(w / 2, h / 2);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);

    // Get position from controller
    const position = this.getPiecePosition(piece.id);
    // The visual center is: element top-left (position - offset) + canvas center
    return position.sub(offset).add(canvasCenter);
  }

  /**
   * Internal computation function for world-space coordinates.
   * Computes the world-space coordinates for the corners and side points of a puzzle piece,
   * taking into account its position, scale, and rotation.
   * @private
   * @param {Object} piece - The piece object
   * @returns {Object} {worldCorners, worldSPoints}
   */
  _computeWorldDataInternal(piece) {
    // Requires: piece.bitmap.width/height, position from controller, piece.rotation, piece.scale
    const scale = piece.scale;
    const position = this.getPiecePosition(piece.id) || new Point(0, 0);

    // Calculate the bounding frame to determine visual center
    const boundingFrame = piece.calculateBoundingFrame();

    // The piece position now represents the visual center, so calculate canvas top-left
    const bitmapSize = new Point(
      piece.bitmap.width * scale,
      piece.bitmap.height * scale
    );
    const canvasCenter = bitmapSize.scaled(0.5);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);
    const canvasTopLeft = position.sub(offset);

    // Pivot point for rotation should be the visual center of the piece
    const pivot = piece.getCenter();

    const toCanvasLocalPoint = (pt) =>
      pt.sub(boundingFrame.topLeft).scaled(scale);

    // Corners
    const c = piece.corners;
    const cornersLocal = {
      nw: toCanvasLocalPoint(c.nw),
      ne: toCanvasLocalPoint(c.ne),
      se: toCanvasLocalPoint(c.se),
      sw: toCanvasLocalPoint(c.sw),
    };

    const worldCorners = {};
    for (const [key, pLocal] of Object.entries(cornersLocal)) {
      // Translate to canvas position, then rotate around visual center
      const translated = pLocal.add(canvasTopLeft);
      const rotated = translated.rotatedAroundDeg(pivot, piece.rotation);
      worldCorners[key] = rotated;
    }

    // Side points
    const sp = piece.sPoints;
    const worldSPoints = {};
    ["north", "east", "south", "west"].forEach((side) => {
      const p = sp[side];
      if (!p) {
        worldSPoints[side] = null;
        return;
      }
      const local = toCanvasLocalPoint(p);
      const translated = local.add(canvasTopLeft);
      const rotated = translated.rotatedAroundDeg(pivot, piece.rotation);
      worldSPoints[side] = rotated;
    });

    return { worldCorners, worldSPoints };
  }

  setPiecePosition(pieceId, position) {
    if (!(position instanceof Point)) {
      throw new Error("GameTableController.setPiecePosition expects Point");
    }
    this._piecePositions.set(pieceId, position.clone());
    this._updateSpatialIndexFor(pieceId);
    this._applyDomPosition(pieceId);
  }

  // ----------------------------
  // Movement APIs
  // ----------------------------
  movePiece(pieceId, delta) {
    const current = this.getPiecePosition(pieceId);
    if (!current) return;
    const next = current.add(delta);
    this.setPiecePosition(pieceId, next);
  }

  /**
   * Move multiple pieces by the same delta (batch operation)
   * @param {number[]} pieceIds - Array of piece IDs
   * @param {Point} delta - Movement delta
   */
  movePieces(pieceIds, delta) {
    pieceIds.forEach((id) => this.movePiece(id, delta));
  }
  /**
   * Set piece position by specifying its center point
   * @param {number} pieceId - Piece ID
   * @param {Point} centerPoint - Center point
   * @param {HTMLElement} element - DOM element for dimensions
   */
  placePieceCenter(pieceId, centerPoint, element) {
    const piece = this._findPiece(pieceId);
    if (!piece) return;

    // Reverse the getCenter() calculation
    const w = element.offsetWidth;
    const h = element.offsetHeight;

    const boundingFrame = piece.calculateBoundingFrame();
    const scale = piece.scale || 0.35;

    const canvasCenter = new Point(w / 2, h / 2);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);

    // getCenter() returns: position.sub(offset).add(canvasCenter)
    // So to get position from centerPoint: centerPoint.sub(canvasCenter).add(offset)
    const position = centerPoint.sub(canvasCenter).add(offset);
    this.setPiecePosition(pieceId, position);
  }
  moveGroup(groupId, delta) {
    const group = groupManager.getGroup(groupId);
    if (!group) return;
    group.allPieces.forEach((p) => this.movePiece(p.id, delta));
  }

  // High-level drag orchestration
  dragMove(pieceId, delta, { detached = false } = {}) {
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    if (detached || !piece.groupId) {
      this.movePiece(pieceId, delta);
    } else {
      this.moveGroup(piece.groupId, delta);
    }
  }

  // ----------------------------
  // Rotation
  // ----------------------------
  rotatePiece(pieceId, angleDegrees) {
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    piece.rotate(angleDegrees);
    const el = this._getElement(pieceId);
    if (el) {
      el.style.transform = `rotate(${piece.rotation}deg)`;
    }
  }

  rotateGroup(groupId, angleDegrees, pivotPiece, getPieceElementFn) {
    const group = groupManager.getGroup(groupId);
    if (!group || group.isEmpty()) return;

    const getPieceElement = getPieceElementFn || ((id) => this._getElement(id));
    const pivotEl = getPieceElement(pivotPiece.id);
    if (!pivotEl) return;

    // Use the pivot piece's visual center as the rotation point
    const pivot = pivotPiece.getCenter(pivotEl);

    group.allPieces.forEach((piece) => {
      if (!piece) return;

      const pieceEl = getPieceElement(piece.id);
      if (!pieceEl) return;

      // Rotate the piece itself
      piece.rotate(angleDegrees);

      // Get the current visual center of the piece
      const preCenter = piece.getCenter(pieceEl);

      // Rotate the center around the pivot
      const rotatedCenter = preCenter.rotatedAroundDeg(pivot, angleDegrees);

      // Update piece position to the new center
      this.placePieceCenter(piece.id, rotatedCenter, pieceEl);

      // Apply transform to DOM element (position and rotation)
      applyPieceTransform(piece);
    });
  }

  // ----------------------------
  // Spatial Queries
  // ----------------------------
  queryRadius(centerPoint, radius) {
    if (!this.spatialIndex || !centerPoint) return [];
    return this.spatialIndex.queryRadius(centerPoint, radius);
  }

  rotatePieceOrGroup(pieceId, angleDegrees, getPieceElementFn) {
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    const group = groupManager.getGroup(piece.groupId);
    if (group && group.size() > 1) {
      this.rotateGroup(group.id, angleDegrees, piece, getPieceElementFn);
    } else {
      this.rotatePiece(pieceId, angleDegrees);
    }
  }

  // ----------------------------
  // Neighbor / Connectivity (Phase 1 duplication of Piece logic)
  // ----------------------------
  arePiecesNeighbors(pieceA, pieceB) {
    if (!pieceA || !pieceB) return false;
    if (!pieceA.worldData || !pieceB.worldData) return false;
    const cA = pieceA.worldData.worldCorners;
    const cB = pieceB.worldData.worldCorners;
    if (!cA || !cB) return false;

    // Dynamic tolerance: base on average scaled bitmap dimension (allows for small float drift)
    const scaleA = pieceA.scale || 0.35;
    const scaleB = pieceB.scale || 0.35;
    const avgScale = (scaleA + scaleB) * 0.5;
    // Empirical: 5 was too strict after center-based transform; widen window.
    const TOL = 18 * avgScale + 4; // ~10-11px at 0.35 scale, larger if scale grows

    const closePair = (p1, p2) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return dx * dx + dy * dy <= TOL * TOL;
    };

    // Require BOTH corresponding corner pairs to be close for a direction.
    const north = closePair(cA.nw, cB.sw) && closePair(cA.ne, cB.se);
    if (north) return true;
    const south = closePair(cA.sw, cB.nw) && closePair(cA.se, cB.ne);
    if (south) return true;
    const east = closePair(cA.ne, cB.nw) && closePair(cA.se, cB.sw);
    if (east) return true;
    const west = closePair(cA.nw, cB.ne) && closePair(cA.sw, cB.se);
    if (west) return true;

    return false;
  }

  // ----------------------------
  // Internal Helpers
  // ----------------------------
  _findPiece(id) {
    return state.pieces.find((p) => p.id === id);
  }

  _getElement(id) {
    return this.pieceElements ? this.pieceElements.get(id) : null;
  }

  _applyDomPosition(pieceId) {
    const el = this._getElement(pieceId);
    const piece = this._findPiece(pieceId);
    if (el && piece) {
      // Use unified transform application (accounts for true visual center)
      applyPieceTransform(piece);
    }
  }

  _updateSpatialIndexFor(pieceId) {
    if (!this.spatialIndex) return;
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    const el = this._getElement(pieceId);
    // Prefer geometric center via piece.getCenter (uses bounding frame + rotation)
    const centerPoint = piece.getCenter(el);
    this.spatialIndex.update({ id: piece.id, position: centerPoint });
  }
}

// Singleton instance
export const gameTableController = new GameTableController();

// (Removed global window exposure – import where needed instead)
