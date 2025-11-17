// GroupManager.js - Centralized group management using Group class
// ------------------------------------------------
// Integrates the Group class with existing puzzle logic
// Handles group creation, merging, detachment, and connectivity validation

import { Group } from "./model/Group.js";
import { state } from "./gameEngine.js";
import { updateProgress } from "./controlBar.js";

class GroupManager {
  constructor() {
    // Map of groupId -> Group instance
    this.groups = new Map();

    // Keep track of next available group ID
    this.nextGroupId = 1;
  }

  /**
   * Initialize the group manager with existing pieces
   * This should be called after pieces are loaded/created
   */
  initialize() {
    // Clear existing groups
    this.groups.clear();

    // Create groups from existing pieces
    const piecesByGroup = new Map();

    state.pieces.forEach((piece) => {
      const groupId = piece.groupId;
      if (!piecesByGroup.has(groupId)) {
        piecesByGroup.set(groupId, []);
      }
      piecesByGroup.get(groupId).push(piece);
    });

    // Create Group instances for each group
    piecesByGroup.forEach((pieces, groupId) => {
      try {
        const group = new Group(groupId, pieces);
        this.groups.set(groupId, group);
        console.log(
          `[GroupManager] Created group ${groupId} with ${pieces.length} pieces`
        );
      } catch (error) {
        console.warn(
          `[GroupManager] Failed to create group ${groupId}:`,
          error
        );
        // Fallback: create individual groups for disconnected pieces
        pieces.forEach((piece) => {
          const newGroupId = this.generateGroupId();
          piece.groupId = newGroupId;
          const singleGroup = new Group(newGroupId, [piece]);
          this.groups.set(newGroupId, singleGroup);
        });
      }
    });

    console.log(
      `[GroupManager] Initialized with ${this.groups.size} groups for ${state.pieces.length} pieces`
    );

    this.updateNextGroupId();
  }

  /**
   * Generate a unique group ID
   */
  generateGroupId() {
    return `g${this.nextGroupId++}`;
  }

  /**
   * Update nextGroupId based on existing groups and pieces
   */
  updateNextGroupId() {
    let maxId = 0;

    // Check existing groups
    this.groups.forEach((group, groupId) => {
      const match = groupId.match(/^g(\d+)/);
      if (match) {
        const id = parseInt(match[1], 10);
        if (id > maxId) maxId = id;
      }
    });

    // Also check all piece groupIds to avoid conflicts
    state.pieces.forEach((piece) => {
      if (piece.groupId) {
        const match = piece.groupId.match(/^g(\d+)/);
        if (match) {
          const id = parseInt(match[1], 10);
          if (id > maxId) maxId = id;
        }
      }
    });

    this.nextGroupId = maxId + 1;
  }

  /**
   * Get group by ID
   */
  getGroup(groupId) {
    return this.groups.get(groupId);
  }

  /**
   * Get all groups
   */
  getAllGroups() {
    return Array.from(this.groups.values());
  }

  /**
   * Get group containing a specific piece
   */
  getGroupForPiece(piece) {
    return this.groups.get(piece.groupId);
  }

  /**
   * Create a new group with a single piece
   */
  createSinglePieceGroup(piece) {
    const newGroupId = this.generateGroupId();
    piece.groupId = newGroupId;

    const group = new Group(newGroupId, [piece]);
    this.groups.set(newGroupId, group);

    console.log(
      `[GroupManager] Created single-piece group ${newGroupId} for piece ${piece.id}`
    );
    return group;
  }

  /**
   * Merge two groups together
   * This is the main method called when pieces connect
   */
  mergeGroups(pieceA, pieceB) {
    const groupA = this.getGroupForPiece(pieceA);
    const groupB = this.getGroupForPiece(pieceB);

    if (!groupA || !groupB) {
      console.warn(
        "[GroupManager] Cannot merge - one or both pieces not in groups"
      );
      return false;
    }

    if (groupA === groupB) {
      console.log("[GroupManager] Pieces already in same group");
      return true; // Already merged
    }

    try {
      // Check connectivity before merging
      const allPieces = [...groupA.getPieces(), ...groupB.getPieces()];
      if (!Group.arePiecesConnected(allPieces)) {
        console.warn(
          "[GroupManager] Cannot merge - would create disconnected group"
        );
        return false;
      }

      // Merge smaller group into larger group
      const [keepGroup, mergeGroup] =
        groupA.size() >= groupB.size() ? [groupA, groupB] : [groupB, groupA];

      // Add all pieces from merge group to keep group
      const piecesToMove = mergeGroup.getPieces();
      keepGroup.addPieces(piecesToMove);

      // Remove the merged group
      this.groups.delete(mergeGroup.id);

      console.log(
        `[GroupManager] Merged group ${mergeGroup.id} into ${keepGroup.id}`
      );
      updateProgress();
      return true;
    } catch (error) {
      console.error("[GroupManager] Error during group merge:", error);
      return false;
    }
  }

  /**
   * Detach a piece from its group
   * Handles fragmentation and creates new groups as needed
   */
  detachPiece(piece) {
    const currentGroup = this.getGroupForPiece(piece);
    if (!currentGroup) {
      console.warn("[GroupManager] Cannot detach - piece not in a group");
      return null;
    }

    if (currentGroup.size() === 1) {
      console.log("[GroupManager] Piece is already in single-piece group");
      return currentGroup;
    }

    try {
      // Remove piece from current group
      const fragmentGroups = currentGroup.removePiece(piece);

      // Create new single-piece group for detached piece
      const newGroup = this.createSinglePieceGroup(piece);

      // Handle any fragments created by removal
      fragmentGroups.forEach((fragmentGroup) => {
        this.groups.set(fragmentGroup.id, fragmentGroup);
        console.log(
          `[GroupManager] Created fragment group ${
            fragmentGroup.id
          } with ${fragmentGroup.size()} pieces`
        );
      });

      updateProgress();
      return newGroup;
    } catch (error) {
      console.error("[GroupManager] Error during piece detachment:", error);
      return null;
    }
  }

  /**
   * Move an entire group by an offset
   */
  moveGroup(groupId, offset) {
    const group = this.getGroup(groupId);
    if (!group) return false;

    try {
      group.translate(offset);
      return true;
    } catch (error) {
      console.error("[GroupManager] Error moving group:", error);
      return false;
    }
  }

  /**
   * Rotate an entire group around a pivot piece
   * @param {string} groupId - ID of the group to rotate
   * @param {number} angleDegrees - Rotation angle in degrees
   * @param {Piece} pivotPiece - Piece to use as rotation pivot
   * @param {Function} getPieceElement - Function to get DOM element by piece ID
   * @param {Object} spatialIndex - Spatial index for updating piece positions
   */
  rotateGroup(
    groupId,
    angleDegrees,
    pivotPiece,
    getPieceElement,
    spatialIndex
  ) {
    const group = this.getGroup(groupId);
    if (!group) return false;

    try {
      group.rotate(angleDegrees, pivotPiece, getPieceElement, spatialIndex);
      return true;
    } catch (error) {
      console.error("[GroupManager] Error rotating group:", error);
      return false;
    }
  }

  /**
   * Validate connectivity of a set of pieces
   */
  validateConnectivity(pieces) {
    if (!pieces || pieces.length <= 1) return true;

    // Use Group's connectivity validation
    try {
      const tempGroup = new Group("temp", pieces);
      return tempGroup.isConnected();
    } catch (error) {
      // If Group constructor fails, pieces are not connected
      return false;
    }
  }

  /**
   * Get group statistics for debugging/monitoring
   */
  getGroupStats() {
    const stats = {
      totalGroups: this.groups.size,
      singlePieceGroups: 0,
      multiPieceGroups: 0,
      largestGroupSize: 0,
      totalPieces: 0,
      groups: [],
    };

    this.groups.forEach((group) => {
      const groupStats = group.getStats();
      stats.groups.push(groupStats);
      stats.totalPieces += groupStats.pieceCount;

      if (groupStats.pieceCount === 1) {
        stats.singlePieceGroups++;
      } else {
        stats.multiPieceGroups++;
      }

      if (groupStats.pieceCount > stats.largestGroupSize) {
        stats.largestGroupSize = groupStats.pieceCount;
      }
    });

    return stats;
  }

  /**
   * Validate all groups for integrity
   */
  validateAllGroups() {
    let issues = [];

    this.groups.forEach((group, groupId) => {
      if (!group.validate()) {
        issues.push(`Group ${groupId} has integrity issues`);
      }

      if (!group.isConnected()) {
        issues.push(`Group ${groupId} is not connected`);
      }
    });

    return issues;
  }

  /**
   * Repair all groups with integrity issues
   */
  repairAllGroups() {
    this.groups.forEach((group) => {
      group.repair();
    });
  }

  /**
   * Clean up empty groups
   */
  cleanup() {
    const emptyGroups = [];

    this.groups.forEach((group, groupId) => {
      if (group.isEmpty()) {
        emptyGroups.push(groupId);
      }
    });

    emptyGroups.forEach((groupId) => {
      this.groups.delete(groupId);
      console.log(`[GroupManager] Removed empty group ${groupId}`);
    });

    return emptyGroups.length;
  }

  /**
   * Debug method to check GroupManager status
   */
  debugStatus() {
    console.log("=== GroupManager Debug Status ===");
    console.log(`Total pieces in state: ${state.pieces.length}`);
    console.log(`Total groups in manager: ${this.groups.size}`);
    console.log(`Next group ID: ${this.nextGroupId}`);

    const pieceGroupIds = new Set();
    state.pieces.forEach((piece) => {
      pieceGroupIds.add(piece.groupId);
    });
    console.log(`Unique piece group IDs: ${pieceGroupIds.size}`);
    console.log(`Piece group IDs:`, Array.from(pieceGroupIds).sort());
    console.log(`Manager group IDs:`, Array.from(this.groups.keys()).sort());

    // Check for mismatches
    const managerGroupIds = new Set(this.groups.keys());
    const missingInManager = Array.from(pieceGroupIds).filter(
      (id) => !managerGroupIds.has(id)
    );
    const extraInManager = Array.from(managerGroupIds).filter(
      (id) => !pieceGroupIds.has(id)
    );

    if (missingInManager.length > 0) {
      console.warn(`Groups missing in manager:`, missingInManager);
    }
    if (extraInManager.length > 0) {
      console.warn(`Extra groups in manager:`, extraInManager);
    }

    console.log("================================");
  }
}

// Create singleton instance
export const groupManager = new GroupManager();

// Export for direct integration with existing code
export { GroupManager };

// Make groupManager available globally for debugging
if (typeof window !== "undefined") {
  window.groupManager = groupManager;
}
