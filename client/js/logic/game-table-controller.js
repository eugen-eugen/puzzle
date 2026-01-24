// GameTableController.js
// Central authority for world/table positioning & movement of pieces and groups.
// Goal: Decouple Piece from global table coordinates & neighbor knowledge.
// Phase 1: Introduce controller that owns movement APIs while keeping
//          existing piece.position for backward compatibility.
// Phase 2 (future): Migrate position storage entirely here & deprecate
//                   Piece.isNeighbor / isAnyNeighbor.

import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import { Util } from "../utils/numeric-util.js";
import { isEmptyOrNullish } from "../utils/array-util.js";
import {
  applyPieceTransform,
  applyPieceZIndex,
  setPieceElements,
} from "../ui/display.js";
import { groupManager } from "./group-manager.js";
import { state } from "../game-engine.js";
import { ALL_SIDES } from "../constants/piece-constants.js";
// Spatial index now fully managed here
import { SpatialIndex } from "../utils/spatial-index.js";
//TODO: this modul is only pretended to work with pieces, not html-elements directly. Maybe rename pieceElements to piecePositions or so?
// TODO: a sign for this architecture debt is that the scale is still stored in Piece, even though it has to do with display size, not piece geometry.

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
    this._worldDataCache = new Map(); // id -> { data, lastPosition, lastRotation, lastScale }

    // Z-index management
    this.maxZIndex = 0;

    // Initial bootstrap (may be empty if pieces loaded later)
  }

  // Sync (non-destructive): update entries for existing pieces; add missing ones
  //TODO: somekind odd, that we don't know about not positioned pieces here?
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
    // Pass null dimensions to preserve existing or skip if not yet initialized
    this._autoManageSpatialIndex(null, null);
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

    const group = groupManager.getGroup(piece.groupId);
    const piecesToUpdate = group ? group.allPieces : [piece];

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
    // Create or update spatial index with new dimensions
    this._autoManageSpatialIndex(areaW, areaH);
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

  _autoManageSpatialIndex(areaW = null, areaH = null) {
    // Need area dimensions and pieces
    if (areaW == null || areaH == null) {
      // If no dimensions provided, can't create/update index
      if (!this.spatialIndex) return;
      // Keep existing index if already created
      areaW = this.spatialIndex.boundsWidth;
      areaH = this.spatialIndex.boundsHeight;
    }

    if (!state || !state.pieces || state.pieces.length === 0) {
      this.spatialIndex = null;
      return;
    }

    const avgSize = this._computeAvgPieceSize();

    if (!this.spatialIndex) {
      this.spatialIndex = new SpatialIndex(areaW, areaH, avgSize);
      this._rebuildSpatialIndex();
    } else if (this.spatialIndex.updateDimensions(areaW, areaH, avgSize)) {
      // Dimensions changed, rebuild with new dimensions
      this._rebuildSpatialIndex();
    }
    // Otherwise incremental updates handled per piece on mutation
  }

  _rebuildSpatialIndex() {
    if (!this.spatialIndex) return;
    const items = [];
    state.pieces.forEach((p) => {
      const el = this._getElement(p.id);
      const center = this.getCenter(p, el);
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
    const currentPosition = this.getPiecePosition(piece.id);

    if (!currentPosition) {
      // Fallback for pieces not yet initialized
      return { worldCorners: {}, worldSPoints: {} };
    }

    // Get cached data
    let cached = this._worldDataCache.get(piece.id);

    // Check if cache is valid
    const positionChanged =
      !cached || !currentPosition.equals(cached.lastPosition);

    const otherPropsChanged =
      cached &&
      (piece.rotation !== cached.lastRotation ||
        piece.scale !== cached.lastScale);

    // Invalidate and recompute if needed
    if (!cached || positionChanged || otherPropsChanged) {
      const worldData = this._computeWorldDataInternal(piece);
      cached = {
        data: worldData,
        lastPosition: currentPosition.clone(),
        lastRotation: piece.rotation,
        lastScale: piece.scale,
      };
      this._worldDataCache.set(piece.id, cached);
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
  //TODO: worldData have to to with display size, not with piece geometry. Maybe move scale out of Piece?
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
    const pivot = this.getCenter(piece);

    const toCanvasLocalPoint = (pt) =>
      pt.sub(boundingFrame.topLeft).scaled(scale);

    // Corners
    const cornersLocal = {
      nw: toCanvasLocalPoint(piece.corners.nw),
      ne: toCanvasLocalPoint(piece.corners.ne),
      se: toCanvasLocalPoint(piece.corners.se),
      sw: toCanvasLocalPoint(piece.corners.sw),
    };

    const worldCorners = {};
    for (const [key, pLocal] of Object.entries(cornersLocal)) {
      // Translate to canvas position, then rotate around visual center
      const translated = pLocal.add(canvasTopLeft);
      const rotated = translated.rotatedAroundDeg(pivot, piece.rotation);
      worldCorners[key] = rotated;
    }

    // Side points (now arrays)
    const sp = piece.sPoints;
    const worldSPoints = {};
    ALL_SIDES.forEach((side) => {
      const pointsArray = sp[side];
      if (isEmptyOrNullish(pointsArray)) {
        worldSPoints[side] = [];
        return;
      } else {
        // Transform each point in the array
        worldSPoints[side] = pointsArray.map((p) => {
          const local = toCanvasLocalPoint(new Point(p.x, p.y));
          const translated = local.add(canvasTopLeft);
          return translated.rotatedAroundDeg(pivot, piece.rotation);
        });
      }
    });

    return { worldCorners, worldSPoints };
  }

  setPiecePosition(pieceId, position) {
    this._piecePositions.set(pieceId, position.clone());
    this._updateSpatialIndexFor(pieceId);
    const piece = this._findPiece(pieceId);
    if (piece) {
      applyPieceTransform(piece);
    }
  }

  // ----------------------------
  // Movement APIs
  // ----------------------------
  movePiece(pieceId, delta) {
    const current = this.getPiecePosition(pieceId);
    if (!current) return;
    this.setPiecePosition(pieceId, current.add(delta));
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
    const scale = piece.scale;

    const canvasCenter = new Point(w / 2, h / 2);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);

    this.setPiecePosition(pieceId, centerPoint.sub(canvasCenter).add(offset));
  }
  moveGroup(groupId, delta) {
    const group = groupManager.getGroup(groupId);
    if (!group) return;
    group.allPieces.forEach((p) => this.movePiece(p.id, delta));
  }

  // ----------------------------
  // Rotation
  // ----------------------------
  rotatePiece(pieceId, angleDegrees) {
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    piece.rotate(angleDegrees);
    applyPieceTransform(piece);
  }

  rotateGroup(groupId, angleDegrees, pivotPiece) {
    const group = groupManager.getGroup(groupId);
    if (!group || group.isEmpty()) return;

    const pivotEl = this._getElement(pivotPiece.id);
    if (!pivotEl) return;

    // Use the pivot piece's visual center as the rotation point
    const pivot = this.getCenter(pivotPiece, pivotEl);

    group.allPieces.forEach((piece) => {
      if (!piece) return;

      const pieceEl = this._getElement(piece.id);
      if (!pieceEl) return;

      // Rotate the piece itself
      piece.rotate(angleDegrees);

      // Get the current visual center of the piece
      const preCenter = this.getCenter(piece, pieceEl);

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

  rotatePieceOrGroup(pieceId, angleDegrees) {
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    const group = groupManager.getGroup(piece.groupId);
    if (group && group.size() > 1) {
      this.rotateGroup(group.id, angleDegrees, piece);
    } else {
      this.rotatePiece(pieceId, angleDegrees);
    }
  }

  // ----------------------------
  // Neighbor / Connectivity (Phase 1 duplication of Piece logic)
  // ----------------------------

  /**
   * Calculate bounding box for all pieces using their individual calculateBoundingFrame method
   * This accounts for piece rotation and actual geometry, unlike Point.computeBounds which only uses positions
   * @param {Array} pieces - Array of pieces to calculate bounds for
   * @returns {Rectangle|null} Rectangle with topLeft and bottomRight properties, or null if no valid pieces
   */
  calculatePiecesBounds(pieces) {
    if (Util.isArrayEmpty(pieces)) return null;

    let bounds = new Rectangle();

    for (const piece of pieces) {
      if (!piece) continue;

      const boundingFrame = piece.calculateBoundingFrame();
      if (!boundingFrame) continue;

      // Create rectangle from bounding frame at piece position
      const position = this.getPiecePosition(piece.id) || new Point(0, 0);
      const worldMin = position.add(boundingFrame.topLeft);
      const worldMax = position.add(boundingFrame.bottomRight);
      const pieceRect = Rectangle.fromPoints(worldMin, worldMax);

      if (!pieceRect.isEmpty()) {
        bounds = bounds.plus(pieceRect);
      }
    }

    // Return null for empty bounds instead of empty rectangle
    if (bounds.isEmpty()) return null;

    return bounds;
  }

  arePiecesNeighbors(pieceA, pieceB) {
    if (!pieceA || !pieceB) return false;
    if (!pieceA.worldData || !pieceB.worldData) return false;
    const cA = pieceA.worldData.worldCorners;
    const cB = pieceB.worldData.worldCorners;
    if (!cA || !cB) return false;

    // Dynamic tolerance: base on average scaled bitmap dimension (allows for small float drift)

    const avgScale = (pieceA.scale + pieceB.scale) * 0.5;
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

  _updateSpatialIndexFor(pieceId) {
    if (!this.spatialIndex) return;
    const piece = this._findPiece(pieceId);
    if (!piece) return;
    const el = this._getElement(pieceId);
    // Prefer geometric center via this.getCenter (uses bounding frame + rotation)
    const centerPoint = this.getCenter(piece, el);
    this.spatialIndex.update({ id: piece.id, position: centerPoint });
  }
}

// Singleton instance
export const gameTableController = new GameTableController();

// (Removed global window exposure – import where needed instead)
