// GameTableController.js
// Central authority for world/table positioning & movement of pieces and groups.
// Goal: Decouple Piece from global table coordinates & neighbor knowledge.
// Phase 1: Introduce controller that owns movement APIs while keeping
//          existing piece.position for backward compatibility.
// Phase 2 (future): Migrate position storage entirely here & deprecate
//                   Piece.isNeighbor / isAnyNeighbor.

import { Point } from "./geometry/point.js";
import { applyPieceTransform, applyPieceZIndex } from "./display.js";
import { groupManager } from "./group-manager.js";
import { state } from "./game-engine.js";
// Spatial index now fully managed here
import { SpatialIndex, chooseCellSize } from "./spatial-index.js";

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
      if (p.position instanceof Point) {
        // Clone to avoid external mutation affecting controller silently
        this._piecePositions.set(p.id, p.position.clone());
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
      if (p.position instanceof Point) {
        this._piecePositions.set(p.id, p.position.clone());
      }
    });
    // Auto manage spatial index lifecycle (create/rebuild if needed)
    this._autoManageSpatialIndex();
  }

  // Register a single piece (called from Piece constructor)
  registerPiece(piece) {
    if (!piece || !(piece.position instanceof Point)) return;
    this._piecePositions.set(piece.id, piece.position.clone());
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
   * Bring a piece and its group to the front by assigning new z-index values
   * @param {number} pieceId - ID of the piece to bring to front
   */
  bringToFront(pieceId) {
    const piece = state.pieces?.find((p) => p.id === pieceId);
    if (!piece) return;

    const group = groupManager.getGroupForPiece(piece);
    if (!group) return; // Should never happen - every piece belongs to a group

    const piecesToUpdate = group.getPieces();
    const isMultiPieceGroup = piecesToUpdate.length > 1;

    // Find the maximum z-index in the group
    let groupMaxZIndex = -1;
    piecesToUpdate.forEach((p) => {
      if (
        p.zIndex !== null &&
        p.zIndex !== undefined &&
        p.zIndex > groupMaxZIndex
      ) {
        groupMaxZIndex = p.zIndex;
      }
    });

    // For multi-piece groups: only update if group's max is lower than current maxZIndex
    // For single pieces: always assign a new z-index to ensure they're on top
    if (!isMultiPieceGroup || groupMaxZIndex < this.maxZIndex) {
      this.maxZIndex++;
      const newZIndex = this.maxZIndex;

      piecesToUpdate.forEach((p) => {
        p.zIndex = newZIndex;

        // Update DOM element via display module
        applyPieceZIndex(p.id, newZIndex, this.pieceElements);
      });
    }
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
      (state.pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) /
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
        chooseCellSize(avgSize)
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

  attachPieceElements(pieceElements) {
    this.pieceElements = pieceElements;
  }

  // ----------------------------
  // Position Access
  // ----------------------------
  getPiecePosition(pieceId) {
    return this._piecePositions.get(pieceId) || null;
  }

  setPiecePosition(pieceId, position) {
    if (!(position instanceof Point)) {
      throw new Error("GameTableController.setPiecePosition expects Point");
    }
    this._piecePositions.set(pieceId, position.clone());
    // Mirror back to Piece for compatibility (Phase 1)
    const piece = this._findPiece(pieceId);
    if (piece && piece.position instanceof Point) {
      piece.position.mutCopy(position);
    }
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

  moveGroup(groupId, delta) {
    const group = groupManager.getGroup(groupId);
    if (!group) return;
    group.getPieces().forEach((p) => this.movePiece(p.id, delta));
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
    if (!group) return;
    // Delegate to Group.rotate (still responsible for rotation math)
    group.rotate(
      angleDegrees,
      pivotPiece,
      getPieceElementFn || ((id) => this._getElement(id))
    );
    // After rotation, refresh controller positions from Piece objects
    group.getPieces().forEach((p) => {
      this._piecePositions.set(p.id, p.position.clone());
      this._updateSpatialIndexFor(p.id);
    });
    // Optionally trigger full rebuild for better neighbor accuracy after rotation drift
    // this._rebuildSpatialIndex(); // Uncomment if rotations cause center inaccuracies
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
      applyPieceTransform(el, piece);
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
