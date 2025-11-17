// Group.js - Model for managing grouped pieces in a jigsaw puzzle
// ------------------------------------------------
// Represents a collection of connected puzzle pieces that move together.
// Handles group membership, transformations, and group-level operations.

import { Point } from "../geometry/Point.js";
import { Rectangle } from "../geometry/Rectangle.js";

export class Group {
  constructor(id, initialPieces = []) {
    this.id = id;
    this.pieces = new Set(initialPieces);
    this.rotation = 0; // Group's collective rotation in degrees
    this.scale = 1.0; // Group's collective scale factor
    this.isSelected = false;
    this.isDragging = false;
    this.lastUpdateTimestamp = Date.now();

    // Initialize group properties based on initial pieces
    if (initialPieces.length > 0) {
      // Validate connectivity of initial pieces
      if (!Group.isConnectedSet(initialPieces)) {
        throw new Error(
          `Cannot create group ${id}: initial pieces are not connected`
        );
      }
      // Set group IDs for initial pieces
      initialPieces.forEach((piece) => {
        if (piece) piece.groupId = this.id;
      });
      this._updateGroupProperties();
    }
  }

  // ================================
  // Piece Management
  // ================================

  /**
   * Add a piece to this group
   * @param {Piece} piece - Piece to add
   * @throws {Error} If adding the piece would violate connectivity constraint
   */
  addPiece(piece) {
    if (!piece) return false;

    // If group is empty, any piece can be added
    if (this.isEmpty()) {
      this.pieces.add(piece);
      piece.groupId = this.id;
      this._updateGroupProperties();
      this.lastUpdateTimestamp = Date.now();
      return true;
    }

    // Check if the piece is connected to at least one existing piece in the group
    if (!this._isConnectedToGroup(piece)) {
      throw new Error(
        `Cannot add piece ${piece.id} to group ${this.id}: piece is not connected to any piece in the group`
      );
    }

    this.pieces.add(piece);
    piece.groupId = this.id;
    this._updateGroupProperties();
    this.lastUpdateTimestamp = Date.now();
    return true;
  }

  /**
   * Remove a piece from this group
   * @param {Piece} piece - Piece to remove
   * @returns {Array<Group>} Array of groups created from fragmentation (may be empty)
   */
  removePiece(piece) {
    if (!piece || !this.pieces.has(piece)) return [];

    this.pieces.delete(piece);
    piece.groupId = null;

    // Check if removal causes fragmentation
    const remainingPieces = Array.from(this.pieces);
    if (remainingPieces.length === 0) {
      // Group is now empty
      this._resetGroupProperties();
      this.lastUpdateTimestamp = Date.now();
      return [];
    }

    // Find connected components in the remaining pieces
    const connectedComponents = this._findConnectedComponents(remainingPieces);

    if (connectedComponents.length <= 1) {
      // No fragmentation occurred
      this._updateGroupProperties();
      this.lastUpdateTimestamp = Date.now();
      return [];
    }

    // Fragmentation occurred - need to split into multiple groups
    const newGroups = [];

    // Keep the largest component in this group
    const largestComponent = connectedComponents.reduce((largest, current) =>
      current.length > largest.length ? current : largest
    );

    // Clear current group and rebuild with largest component
    this.pieces.clear();
    largestComponent.forEach((piece) => {
      this.pieces.add(piece);
      piece.groupId = this.id;
    });

    // Create new groups for other components
    connectedComponents.forEach((component, index) => {
      if (component !== largestComponent) {
        const newGroupId = `${this.id}_split_${index}_${Date.now()}`;
        const newGroup = new Group(newGroupId, component);
        newGroups.push(newGroup);
      }
    });

    this._updateGroupProperties();
    this.lastUpdateTimestamp = Date.now();
    return newGroups;
  }

  /**
   * Add multiple pieces to this group
   * @param {Array<Piece>} pieces - Array of pieces to add
   * @throws {Error} If adding the pieces would violate connectivity constraint
   */
  addPieces(pieces) {
    if (!Array.isArray(pieces)) return false;

    // First validate that all pieces together with existing pieces form a connected set
    const allPieces = [...Array.from(this.pieces), ...pieces];
    if (!Group.isConnectedSet(allPieces)) {
      throw new Error(
        `Cannot add pieces to group ${this.id}: resulting group would not be connected`
      );
    }

    let added = 0;
    pieces.forEach((piece) => {
      if (piece && !this.pieces.has(piece)) {
        this.pieces.add(piece);
        piece.groupId = this.id;
        added++;
      }
    });

    if (added > 0) {
      this._updateGroupProperties();
      this.lastUpdateTimestamp = Date.now();
    }

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
      this._resetGroupProperties();
      this.lastUpdateTimestamp = Date.now();
      return [];
    }

    // Find connected components in the remaining pieces
    const connectedComponents = this._findConnectedComponents(remainingPieces);

    if (connectedComponents.length <= 1) {
      // No fragmentation occurred
      this._updateGroupProperties();
      this.lastUpdateTimestamp = Date.now();
      return [];
    }

    // Fragmentation occurred - need to split into multiple groups
    const newGroups = [];

    // Keep the largest component in this group
    const largestComponent = connectedComponents.reduce((largest, current) =>
      current.length > largest.length ? current : largest
    );

    // Clear current group and rebuild with largest component
    this.pieces.clear();
    largestComponent.forEach((piece) => {
      this.pieces.add(piece);
      piece.groupId = this.id;
    });

    // Create new groups for other components
    connectedComponents.forEach((component, index) => {
      if (component !== largestComponent) {
        const newGroupId = `${this.id}_split_${index}_${Date.now()}`;
        const newGroup = new Group(newGroupId, component);
        newGroups.push(newGroup);
      }
    });

    this._updateGroupProperties();
    this.lastUpdateTimestamp = Date.now();
    return newGroups;
  }

  /**
   * Check if this group contains a specific piece
   * @param {Piece} piece - Piece to check
   * @returns {boolean}
   */
  hasPiece(piece) {
    return this.pieces.has(piece);
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
    this._resetGroupProperties();
    this.lastUpdateTimestamp = Date.now();
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

  /**
   * Get the centroid (average position) of all pieces in this group
   * @returns {Point|null}
   */
  getCentroid() {
    if (this.isEmpty()) return null;

    let totalX = 0;
    let totalY = 0;
    let count = 0;

    for (const piece of this.pieces) {
      if (piece && piece.position) {
        totalX += piece.position.x;
        totalY += piece.position.y;
        count++;
      }
    }

    return count > 0 ? new Point(totalX / count, totalY / count) : null;
  }

  // ================================
  // Group Transformations
  // ================================

  /**
   * Move the entire group by an offset
   * @param {Point|number} offsetOrX - Point offset or X offset
   * @param {number} [y] - Y offset (if first param is number)
   */
  translate(offsetOrX, y) {
    let offset;
    if (typeof offsetOrX === "number" && typeof y === "number") {
      offset = new Point(offsetOrX, y);
    } else {
      offset = Point.from(offsetOrX);
    }

    this.pieces.forEach((piece) => {
      if (piece && piece.position) {
        piece.position = piece.position.add(offset);
      }
    });

    this.lastUpdateTimestamp = Date.now();
  }

  /**
   * Rotate the entire group around its center
   * @param {number} angleDegrees - Rotation angle in degrees
   * @param {Point} [pivot] - Optional pivot point (defaults to group center)
   */
  rotate(angleDegrees, pivot = null) {
    if (this.isEmpty()) return;

    const rotationCenter = pivot || this.getCenter();
    if (!rotationCenter) return;

    this.pieces.forEach((piece) => {
      if (piece) {
        // Rotate piece position around the pivot
        if (piece.position) {
          piece.position = piece.position.rotateAround(
            rotationCenter,
            angleDegrees
          );
        }
        // Update piece's own rotation
        piece.rotation = (piece.rotation + angleDegrees) % 360;
      }
    });

    this.rotation = (this.rotation + angleDegrees) % 360;
    this.lastUpdateTimestamp = Date.now();
  }

  /**
   * Scale the entire group from its center
   * @param {number} scaleFactor - Scale factor (1.0 = no change)
   * @param {Point} [pivot] - Optional pivot point (defaults to group center)
   */
  scale(scaleFactor, pivot = null) {
    if (this.isEmpty() || scaleFactor <= 0) return;

    const scaleCenter = pivot || this.getCenter();
    if (!scaleCenter) return;

    this.pieces.forEach((piece) => {
      if (piece && piece.position) {
        // Scale piece position relative to pivot
        const relativePos = piece.position.subtract(scaleCenter);
        const scaledPos = relativePos.scaled(scaleFactor);
        piece.position = scaleCenter.add(scaledPos);
      }
    });

    this.scale *= scaleFactor;
    this.lastUpdateTimestamp = Date.now();
  }

  // ================================
  // Group State Management
  // ================================

  /**
   * Set the selection state of this group
   * @param {boolean} selected - Whether this group is selected
   */
  setSelected(selected) {
    this.isSelected = selected;
    this.pieces.forEach((piece) => {
      if (piece && typeof piece.setSelected === "function") {
        piece.setSelected(selected);
      }
    });
    this.lastUpdateTimestamp = Date.now();
  }

  /**
   * Set the dragging state of this group
   * @param {boolean} dragging - Whether this group is being dragged
   */
  setDragging(dragging) {
    this.isDragging = dragging;
    this.pieces.forEach((piece) => {
      if (piece && typeof piece.setDragging === "function") {
        piece.setDragging(dragging);
      }
    });
    this.lastUpdateTimestamp = Date.now();
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

  /**
   * Split this group into two groups based on a predicate function
   * @param {Function} predicate - Function that returns true for pieces to keep in this group
   * @returns {Group|null} New group containing pieces that didn't match predicate, or null
   */
  split(predicate, newGroupId) {
    if (this.isEmpty()) return null;

    const piecesToMove = [];
    const piecesToKeep = [];

    this.pieces.forEach((piece) => {
      if (predicate(piece)) {
        piecesToKeep.push(piece);
      } else {
        piecesToMove.push(piece);
      }
    });

    if (piecesToMove.length === 0) return null;

    // Create new group for pieces that didn't match predicate
    const newGroup = new Group(newGroupId, piecesToMove);

    // Remove pieces from this group
    this.removePieces(piecesToMove);

    return newGroup;
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
    this.lastUpdateTimestamp = Date.now();
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
      centroid: this.getCentroid(),
      rotation: this.rotation,
      scale: this.scale,
      isSelected: this.isSelected,
      isDragging: this.isDragging,
      lastUpdate: this.lastUpdateTimestamp,
    };
  }

  /**
   * Convert group to JSON for serialization
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      pieceIds: this.getPieces().map((piece) => piece.id),
      rotation: this.rotation,
      scale: this.scale,
      isSelected: this.isSelected,
      lastUpdate: this.lastUpdateTimestamp,
    };
  }

  /**
   * Create group from JSON data
   * @param {Object} data - JSON data
   * @param {Map<string, Piece>} pieceMap - Map of piece IDs to piece objects
   * @returns {Group} New group instance
   */
  static fromJSON(data, pieceMap) {
    const pieces = data.pieceIds
      .map((id) => pieceMap.get(id))
      .filter((piece) => piece !== undefined);

    const group = new Group(data.id, pieces);
    group.rotation = data.rotation || 0;
    group.scale = data.scale || 1.0;
    group.isSelected = data.isSelected || false;
    group.lastUpdateTimestamp = data.lastUpdate || Date.now();

    return group;
  }

  // ================================
  // Private Helper Methods
  // ================================

  /**
   * Update group properties based on current pieces
   * @private
   */
  _updateGroupProperties() {
    // This could calculate average position, rotation, etc.
    // For now, we'll keep it simple
    if (this.isEmpty()) {
      this._resetGroupProperties();
    }
  }

  /**
   * Reset group properties to defaults
   * @private
   */
  _resetGroupProperties() {
    this.rotation = 0;
    this.scale = 1.0;
    this.isSelected = false;
    this.isDragging = false;
  }

  // ================================
  // Connectivity Validation Methods
  // ================================

  /**
   * Check if a piece is connected to at least one piece in this group
   * @param {Piece} piece - Piece to check
   * @returns {boolean} True if piece is connected to group
   * @private
   */
  _isConnectedToGroup(piece) {
    if (!piece || !piece.isAnyNeighbor) return false;

    // If group is empty, the piece will be the first and only piece, so it's connected
    if (this.isEmpty()) return true;

    for (const groupPiece of this.pieces) {
      if (groupPiece && piece.isAnyNeighbor(groupPiece)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a set of pieces forms a connected graph
   * @param {Array<Piece>} pieces - Array of pieces to check
   * @returns {boolean} True if all pieces are connected
   * @private
   */
  static isConnectedSet(pieces) {
    if (!pieces || pieces.length === 0) return true;
    // Exception: a single piece is always connected
    if (pieces.length === 1) return true;

    const validPieces = pieces.filter((p) => p !== null && p !== undefined);
    if (validPieces.length <= 1) return true;

    // Build adjacency graph
    const adjacencyMap = new Map();
    validPieces.forEach((piece) => {
      adjacencyMap.set(piece, new Set());
    });

    // Find neighbors using piece.isAnyNeighbor method
    for (let i = 0; i < validPieces.length; i++) {
      const piece1 = validPieces[i];

      for (let j = i + 1; j < validPieces.length; j++) {
        const piece2 = validPieces[j];
        if (!piece2) continue;

        if (piece1.isAnyNeighbor(piece2)) {
          adjacencyMap.get(piece1).add(piece2);
          adjacencyMap.get(piece2).add(piece1);
        }
      }
    }

    // Use DFS to check if all pieces are reachable from first piece
    const visited = new Set();
    const stack = [validPieces[0]];
    visited.add(validPieces[0]);

    while (stack.length > 0) {
      const current = stack.pop();
      const neighbors = adjacencyMap.get(current) || new Set();

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    // All pieces should be visited if the set is connected
    return visited.size === validPieces.length;
  }

  /**
   * Find connected components in a set of pieces
   * @param {Array<Piece>} pieces - Array of pieces to analyze
   * @returns {Array<Array<Piece>>} Array of connected components
   * @private
   */
  _findConnectedComponents(pieces) {
    if (!pieces || pieces.length === 0) return [];

    const validPieces = pieces.filter((p) => p && p.isAnyNeighbor);
    if (validPieces.length === 0) return [];

    // Build adjacency graph
    const adjacencyMap = new Map();
    validPieces.forEach((piece) => {
      adjacencyMap.set(piece, new Set());
    });

    // Find neighbors
    for (let i = 0; i < validPieces.length; i++) {
      const piece1 = validPieces[i];
      for (let j = i + 1; j < validPieces.length; j++) {
        const piece2 = validPieces[j];
        if (piece1.isAnyNeighbor(piece2)) {
          adjacencyMap.get(piece1).add(piece2);
          adjacencyMap.get(piece2).add(piece1);
        }
      }
    }

    // Find connected components using DFS
    const visited = new Set();
    const components = [];

    for (const piece of validPieces) {
      if (!visited.has(piece)) {
        const component = [];
        const stack = [piece];
        visited.add(piece);

        while (stack.length > 0) {
          const current = stack.pop();
          component.push(current);

          const neighbors = adjacencyMap.get(current) || new Set();
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              stack.push(neighbor);
            }
          }
        }

        components.push(component);
      }
    }

    return components;
  }

  /**
   * Validate that the group maintains connectivity
   * @returns {boolean} True if group is connected
   */
  isConnected() {
    // Exception: single piece or empty group is always connected
    if (this.size() <= 1) return true;

    const pieces = Array.from(this.pieces);
    return Group.isConnectedSet(pieces);
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
