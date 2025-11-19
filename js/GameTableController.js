// GameTableController.js
// Central authority for world/table positioning & movement of pieces and groups.
// Goal: Decouple Piece from global table coordinates & neighbor knowledge.
// Phase 1: Introduce controller that owns movement APIs while keeping
//          existing piece.position for backward compatibility.
// Phase 2 (future): Migrate position storage entirely here & deprecate
//                   Piece.isNeighbor / isAnyNeighbor.

import { Point } from "./geometry/Point.js";
import { applyPieceTransform } from "./display.js";
import { groupManager } from "./GroupManager.js";
import { state } from "./gameEngine.js";

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
    this.spatialIndex = spatialIndex;
    this.pieceElements = pieceElements; // Map<pieceId, HTMLElement>

    // Internal store – currently mirrors Piece.position (Point)
    this._piecePositions = new Map(); // id -> Point

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
  }

  // Register a single piece (called from Piece constructor)
  registerPiece(piece) {
    if (!piece || !(piece.position instanceof Point)) return;
    this._piecePositions.set(piece.id, piece.position.clone());
    // Optionally index immediately
    this._updateSpatialIndexFor(piece.id);
  }

  attachSpatialIndex(spatialIndex) {
    this.spatialIndex = spatialIndex;
    // Rebuild with controller stored positions
    if (this.spatialIndex) {
      const proxyItems = state.pieces.map((p) => ({
        id: p.id,
        position: this.getPiecePosition(p.id),
      }));
      this.spatialIndex.rebuild(proxyItems);
    }
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
