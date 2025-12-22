// Group.js - Model for managing grouped pieces in a jigsaw puzzle
// ------------------------------------------------
// Represents a collection of connected puzzle pieces that move together.
// Handles group membership, transformations, and group-level operations.

import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import { Graph, alg } from "graphlib";
import { gameTableController } from "../logic/game-table-controller.js";

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
    this.pieces = [...initialPieces];
    this.borderPieces = new Set();

    if (initialPieces.length > 0) {
      if (validateConnectivity && !Group.arePiecesConnected(initialPieces)) {
        throw new Error(
          `Cannot create group ${id}: initial pieces are not connected`
        );
      }
      // Assign groupId regardless of validation outcome (if disabled we trust persisted layout)
      initialPieces.forEach((piece) => {
        if (piece) piece._setGroupId(this.id);
      });
      this._updateBorderPieces();
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
    // Filter out null/undefined pieces
    const validPieces = pieces.filter((p) => p !== null && p !== undefined);
    if (validPieces.length === 0) return 0;

    // First validate that all pieces together with existing pieces form a connected set
    const allPieces = [...this.pieces, ...validPieces];
    if (!Group.arePiecesConnected(allPieces)) {
      throw new Error(
        `Cannot add pieces to group ${this.id}: resulting group would not be connected`
      );
    }

    // Filter out pieces that are already in the group
    const piecesToAdd = validPieces.filter(
      (piece) => !this.pieces.includes(piece)
    );
    const added = piecesToAdd.length;

    if (added > 0) {
      // Create new immutable array with added pieces
      this.pieces = [...this.pieces, ...piecesToAdd];
      piecesToAdd.forEach((piece) => {
        piece._setGroupId(this.id);
      });
    }

    if (added > 0) {
      this._updateBorderPieces();
    }

    return added;
  }

  /**
   * Remove multiple pieces from this group
   * @param {Array<Piece>} pieces - Array of pieces to remove
   * @returns {Array<Group>} Array of groups created from fragmentation (may be empty)
   */
  removePieces(pieces) {
    // Remove all pieces and create new array
    const piecesToRemove = new Set(
      pieces.filter((p) => p && this.pieces.includes(p))
    );

    if (piecesToRemove.size === 0) return [];

    // Create new immutable array without removed pieces
    const remainingPieces = this.pieces.filter(
      (piece) => !piecesToRemove.has(piece)
    );

    // Update groupId for removed pieces
    piecesToRemove.forEach((piece) => {
      piece._setGroupId(null);
    });

    if (remainingPieces.length === 0) {
      // Group is now empty
      this.pieces = [];
      return [];
    }

    // Find connected components in the remaining pieces
    const connectedSubGroups = Group._findConnectedComponents(remainingPieces);

    if (connectedSubGroups.length === 1) {
      // No fragmentation occurred - update pieces with remaining
      this.pieces = remainingPieces;
      this._updateBorderPieces();
      return [];
    }

    // Fragmentation occurred - need to split into multiple groups
    const newGroups = [];

    // Keep the largest component in this group
    const largestSubGroup = connectedSubGroups.reduce((largest, current) =>
      current.length > largest.length ? current : largest
    );

    // Replace current group with largest component (immutable update)
    this.pieces = [...largestSubGroup];
    largestSubGroup.forEach((piece) => {
      piece._setGroupId(this.id);
    });
    this._updateBorderPieces();

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
  get allPieces() {
    return this.pieces;
  }

  /**
   * Get the number of pieces in this group
   * @returns {number}
   */
  size() {
    return this.pieces.length;
  }

  /**
   * Check if this group is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.pieces.length === 0;
  }

  /**
   * Clear all pieces from this group
   */
  clear() {
    this.pieces.forEach((piece) => {
      piece._setGroupId(null);
    });
    this.pieces = [];
    this.borderPieces.clear();
  }

  // ================================
  // Group Properties & Calculations
  // ================================

  /**
   * Get all border pieces (pieces with less than 4 neighbors within this group)
   * @returns {Array<Piece>}
   */
  get allBorderPieces() {
    return Array.from(this.borderPieces);
  }

  /**
   * Update the set of border pieces based on current group membership
   * A piece is a border piece if it has less than 4 neighbors within the group
   * @private
   */
  _updateBorderPieces() {
    this.borderPieces.clear();

    if (this.pieces.length === 0) return;

    // Build a map of grid positions for quick lookup
    const gridMap = new Map();
    for (const piece of this.pieces) {
      if (!piece) continue;
      const key = `${piece.gridX},${piece.gridY}`;
      gridMap.set(key, piece);
    }

    // For each piece, count how many of its neighbors are in this group
    for (const piece of this.pieces) {
      if (!piece) continue;

      let neighborCount = 0;

      // Check all four potential neighbor positions based on grid coordinates
      const neighborPositions = [
        { x: piece.gridX, y: piece.gridY - 1 }, // north
        { x: piece.gridX + 1, y: piece.gridY }, // east
        { x: piece.gridX, y: piece.gridY + 1 }, // south
        { x: piece.gridX - 1, y: piece.gridY }, // west
      ];

      for (const pos of neighborPositions) {
        const key = `${pos.x},${pos.y}`;
        if (gridMap.has(key)) {
          neighborCount++;
        }
      }

      // If less than 4 neighbors, it's a border piece
      if (neighborCount < 4) {
        this.borderPieces.add(piece);
      }
    }
  }

  /**
   * Calculate the bounding rectangle for all pieces in this group
   * @returns {Rectangle|null} Bounding rectangle or null if empty
   */
  calculateBounds() {
    if (this.isEmpty()) return null;

    let bounds = new Rectangle();

    for (const piece of this.pieces) {
      if (!piece || !piece.calculateBoundingFrame) continue;

      const boundingFrame = piece.calculateBoundingFrame();
      if (!boundingFrame) continue;

      // Create rectangle from bounding frame at piece position
      const position =
        gameTableController.getPiecePosition(piece.id) || new Point(0, 0);
      const worldMin = position.add(boundingFrame.topLeft);
      const worldMax = position.add(boundingFrame.bottomRight);
      const pieceRect = Rectangle.fromPoints(worldMin, worldMax);

      if (!pieceRect.isEmpty()) {
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
  // Group Merging & Splitting
  // ================================

  /**
   * Merge another group into this group
   * @param {Group} otherGroup - Group to merge into this one
   * @returns {boolean} Success status
   */
  merge(otherGroup) {
    if (!otherGroup || otherGroup === this) return false;

    const piecesToMerge = otherGroup.allPieces;
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
    if (pieces.length < 2) return true;
    return Group._findConnectedComponents(pieces).length === 1;
  }

  /**
   * Find connected components in a set of pieces
   * @param {Array<Piece>} pieces - Array of pieces to analyze
   * @returns {Array<Array<Piece>>} Array of connected components
   * @private
   */
  static _findConnectedComponents(pieces) {
    if (pieces.length === 0) return [];

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
        const neighbors = gameTableController.arePiecesNeighbors(
          piece1,
          piece2
        );
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

    return Group.arePiecesConnected(this.pieces);
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
