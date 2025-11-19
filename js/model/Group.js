// Group.js - Model for managing grouped pieces in a jigsaw puzzle
// ------------------------------------------------
// Represents a collection of connected puzzle pieces that move together.
// Handles group membership, transformations, and group-level operations.

import { Point } from "../geometry/Point.js";
import { Rectangle } from "../geometry/Rectangle.js";
import { applyPieceTransform } from "../display.js";
import { Graph, alg } from "graphlib";
import { gameTableController } from "../GameTableController.js";

export class Group {
  /**
   * @param {string} id
   * @param {Array<Piece>} initialPieces
   * @param {Object} [options]
   * @param {boolean} [options.validateConnectivity=true] Whether to enforce connectivity on construction.
   *        This is disabled for resume/deserialize flows to avoid false negatives caused by tiny float drift
   *        before worldData & transforms have fully stabilized.
   */
  constructor(id, initialPieces = [], { validateConnectivity = true } = {}) {
    this.id = id;
    this.pieces = new Set(initialPieces);

    if (initialPieces.length > 0) {
      if (validateConnectivity && !Group.arePiecesConnected(initialPieces)) {
        throw new Error(
          `Cannot create group ${id}: initial pieces are not connected`
        );
      }
      // Assign groupId regardless of validation outcome (if disabled we trust persisted layout)
      initialPieces.forEach((piece) => {
        if (piece) piece.groupId = this.id;
      });
    }
  }

  // ================================
  // Piece Management
  // ================================

  /**
   * Add multiple pieces to this group
   * @param {Array<Piece>} pieces - Array of pieces to add
   * @throws {Error} If adding the pieces would violate connectivity constraint
   */
  addPieces(pieces) {
    if (!Array.isArray(pieces)) return 0;

    // Filter out null/undefined pieces
    const validPieces = pieces.filter((p) => p !== null && p !== undefined);
    if (validPieces.length === 0) return 0;

    // First validate that all pieces together with existing pieces form a connected set
    const allPieces = [...Array.from(this.pieces), ...validPieces];
    if (!Group.arePiecesConnected(allPieces)) {
      throw new Error(
        `Cannot add pieces to group ${this.id}: resulting group would not be connected`
      );
    }

    let added = 0;
    validPieces.forEach((piece) => {
      if (!this.pieces.has(piece)) {
        this.pieces.add(piece);
        piece.groupId = this.id;
        added++;
      }
    });

    return added;
  }

  /**
   * Remove multiple pieces from this group
   * @param {Array<Piece>} pieces - Array of pieces to remove
   * @returns {Array<Group>} Array of groups created from fragmentation (may be empty)
   */
  removePieces(pieces) {
    if (!Array.isArray(pieces)) return [];

    // Remove all pieces first
    let removed = 0;
    pieces.forEach((piece) => {
      if (piece && this.pieces.has(piece)) {
        this.pieces.delete(piece);
        piece.groupId = null;
        removed++;
      }
    });

    if (removed === 0) return [];

    // Check for fragmentation after all removals
    const remainingPieces = Array.from(this.pieces);
    if (remainingPieces.length === 0) {
      // Group is now empty
      return [];
    }

    // Find connected components in the remaining pieces
    const connectedSubGroups = this._findConnectedComponents(remainingPieces);

    if (connectedSubGroups.length <= 1) {
      // No fragmentation occurred
      return [];
    }

    // Fragmentation occurred - need to split into multiple groups
    const newGroups = [];

    // Keep the largest component in this group
    const largestSubGroup = connectedSubGroups.reduce((largest, current) =>
      current.length > largest.length ? current : largest
    );

    // Clear current group and rebuild with largest component
    this.pieces.clear();
    largestSubGroup.forEach((piece) => {
      this.pieces.add(piece);
      piece.groupId = this.id;
    });

    // Create new groups for other components
    connectedSubGroups.forEach((subGroup, index) => {
      if (subGroup !== largestSubGroup) {
        const newGroupId = `${this.id}_split_${index}_${Date.now()}`;
        const newGroup = new Group(newGroupId, subGroup);
        newGroups.push(newGroup);
      }
    });

    return newGroups;
  }

  /**
   * Get all pieces in this group as an array
   * @returns {Array<Piece>}
   */
  getPieces() {
    return Array.from(this.pieces);
  }

  /**
   * Get the number of pieces in this group
   * @returns {number}
   */
  size() {
    return this.pieces.size;
  }

  /**
   * Check if this group is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.pieces.size === 0;
  }

  /**
   * Clear all pieces from this group
   */
  clear() {
    this.pieces.forEach((piece) => {
      piece.groupId = null;
    });
    this.pieces.clear();
  }

  // ================================
  // Group Properties & Calculations
  // ================================

  /**
   * Calculate the bounding rectangle for all pieces in this group
   * @returns {Rectangle|null} Bounding rectangle or null if empty
   */
  calculateBounds() {
    if (this.isEmpty()) return null;

    let bounds = Rectangle.empty();

    for (const piece of this.pieces) {
      if (!piece || !piece.calculateBoundingFrame) continue;

      const boundingFrame = piece.calculateBoundingFrame();
      if (!boundingFrame) continue;

      // Create rectangle from bounding frame at piece position
      const pieceRect = Rectangle.fromBoundingFrameAtPosition(
        boundingFrame,
        piece.position
      );

      if (pieceRect.isValid() && !pieceRect.isEmpty()) {
        bounds = bounds.plus(pieceRect);
      }
    }

    return bounds.isEmpty() ? null : bounds;
  }

  /**
   * Get the center point of this group
   * @returns {Point|null}
   */
  getCenter() {
    const bounds = this.calculateBounds();
    return bounds ? bounds.center : null;
  }

  // ================================
  // Group Transformations
  // ================================

  /**
   * Move the entire group by an offset
   * @param {Point} offset - Point offset
   */
  translate(offset) {
    // Controller is always available; delegate movement.
    this.pieces.forEach((piece) => {
      if (piece) gameTableController.movePiece(piece.id, offset);
    });
  }

  /**
   * Rotate the entire group around a pivot point. Spatial index updates are delegated
   * to GameTableController; this method only mutates piece models & DOM.
   * @param {number} angleDegrees
   * @param {Piece} pivotPiece
   * @param {Function} getPieceElement
   */
  rotate(angleDegrees, pivotPiece, getPieceElement) {
    if (this.isEmpty()) return;

    const pivotEl = getPieceElement(pivotPiece.id);
    if (!pivotEl) return;

    // Use the pivot piece's visual center as the rotation point
    const pivot = pivotPiece.getCenter(pivotEl);

    this.pieces.forEach((piece) => {
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
      piece.placeCenter(rotatedCenter, pieceEl);

      // Apply transform to DOM element (position and rotation)
      applyPieceTransform(pieceEl, piece);

    });
  }

  // ================================
  // Group Merging & Splitting
  // ================================

  /**
   * Merge another group into this group
   * @param {Group} otherGroup - Group to merge into this one
   * @returns {boolean} Success status
   */
  merge(otherGroup) {
    if (!otherGroup || otherGroup === this) return false;

    const piecesToMerge = otherGroup.getPieces();
    this.addPieces(piecesToMerge);
    otherGroup.clear();

    return true;
  }

  // ================================
  // Validation & Utility
  // ================================

  /**
   * Validate group integrity (all pieces have correct groupId)
   * @returns {boolean} Whether group is valid
   */
  validate() {
    for (const piece of this.pieces) {
      if (!piece || piece.groupId !== this.id) {
        return false;
      }
    }
    return true;
  }

  /**
   * Repair group integrity (fix piece groupId references)
   */
  repair() {
    this.pieces.forEach((piece) => {
      if (piece) {
        piece.groupId = this.id;
      }
    });
  }

  /**
   * Get group statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const bounds = this.calculateBounds();
    return {
      id: this.id,
      pieceCount: this.size(),
      bounds: bounds,
      center: this.getCenter(),
    };
  }

  // ================================
  // Connectivity Validation Methods
  // ================================

  /**
   * Check if a set of pieces forms a connected graph
   * @param {Array<Piece>} pieces - Array of pieces to check
   * @returns {boolean} True if all pieces are connected
   * @private
   */
  static arePiecesConnected(pieces) {
    if (!pieces || pieces.length === 0) return true;
    if (pieces.length === 1) return true;

    // Build undirected graph using graphlib
    const g = new Graph({ directed: false });

    // Add nodes
    pieces.forEach((piece) => g.setNode(piece.id, piece));

    // Add edges between neighboring pieces
    for (let i = 0; i < pieces.length; i++) {
      const piece1 = pieces[i];
      for (let j = i + 1; j < pieces.length; j++) {
        const piece2 = pieces[j];
        const neighbors =
          (gameTableController &&
            gameTableController.arePiecesNeighbors(piece1, piece2)) ||
          piece1.isAnyNeighbor(piece2);
        if (neighbors) {
          g.setEdge(piece1.id, piece2.id);
        }
      }
    }

    // Check if graph is connected (single component)
    const components = alg.components(g);
    return components.length === 1;
  }

  /**
   * Find connected components in a set of pieces
   * @param {Array<Piece>} pieces - Array of pieces to analyze
   * @returns {Array<Array<Piece>>} Array of connected components
   * @private
   */
  _findConnectedComponents(pieces) {
    if (!pieces || pieces.length === 0) return [];

    // Build undirected graph using graphlib
    const g = new Graph({ directed: false });

    // Add nodes with pieces as labels
    pieces.forEach((piece) => {
      g.setNode(piece.id, piece);
    });

    // Add edges between neighboring pieces
    for (let i = 0; i < pieces.length; i++) {
      const piece1 = pieces[i];
      for (let j = i + 1; j < pieces.length; j++) {
        const piece2 = pieces[j];
        const neighbors =
          (gameTableController &&
            gameTableController.arePiecesNeighbors(piece1, piece2)) ||
          piece1.isAnyNeighbor(piece2);
        if (neighbors) {
          g.setEdge(piece1.id, piece2.id);
        }
      }
    }

    // Get connected components
    const componentIds = alg.components(g);

    // Convert component IDs back to piece arrays using graph node labels
    return componentIds.map((componentNodeIds) =>
      componentNodeIds.map((nodeId) => g.node(nodeId))
    );
  }

  /**
   * Validate that the group maintains connectivity
   * @returns {boolean} True if group is connected
   */
  isConnected() {
    // Exception: single piece or empty group is always connected
    if (this.size() <= 1) return true;

    const pieces = Array.from(this.pieces);
    return Group.arePiecesConnected(pieces);
  }

  /**
   * String representation of the group
   * @returns {string}
   */
  toString() {
    return `Group(id: ${
      this.id
    }, pieces: ${this.size()}, center: ${this.getCenter()})`;
  }
}
