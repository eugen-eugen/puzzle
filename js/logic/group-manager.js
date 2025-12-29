// GroupManager.js - Centralized group management using Group class
// ------------------------------------------------
// Integrates the Group class with existing puzzle logic
// Handles group creation, merging, detachment, and connectivity validation

import { Group } from "../model/group.js";
import { state } from "../game-engine.js";
import { gameTableController } from "./game-table-controller.js";
import {
  GROUPS_CHANGED,
  PIECES_CONNECTED,
} from "../constants/custom-events.js";

// Regular expression to match group ID format (e.g., "g123")
const GROUP_ID_PATTERN = /^g(\d+)/;

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
   * GroupManager is responsible for assigning groupIds to pieces
   */
  initialize() {
    // Clear existing groups
    this.groups.clear();

    // Assign groupIds to pieces and group them
    const piecesByGroup = new Map();

    state.pieces.forEach((piece) => {
      // Get groupId from piece (from deserialized data or null)
      let groupId = piece.groupId;

      // If no groupId, generate a unique one (new pieces)
      if (!groupId) {
        groupId = `g${piece.id}`;
        piece._setGroupId(groupId);
      }

      // Get existing array or create new one
      let groupPieces = piecesByGroup.get(groupId);
      if (!groupPieces) {
        groupPieces = [];
        piecesByGroup.set(groupId, groupPieces);
      }
      groupPieces.push(piece);
    });

    // Create Group instances for each group
    piecesByGroup.forEach((pieces, groupId) => {
      // Find connected components to handle potentially fragmented groups
      const components = Group._findConnectedComponents(pieces);

      if (components.length > 1) {
        console.warn(
          `[GroupManager] Group ${groupId} is fragmented into ${components.length} components`
        );
      }

      // Create a new group for each component
      components.forEach((componentPieces) => {
        const newGroupId = this.generateGroupId();

        // Update pieces with their new groupId
        componentPieces.forEach((piece) => {
          piece._setGroupId(newGroupId);
        });

        const group = new Group(newGroupId, componentPieces, {
          validateConnectivity: false,
        });
        this.groups.set(newGroupId, group);
      });
    });

    console.log(
      `[GroupManager] Initialized with ${this.groups.size} groups for ${state.pieces.length} pieces`
    );

    this.updateNextGroupId();
  }

  /**
   * Generate a unique group ID
   * @returns {string} A unique group ID in the format "g<number>"
   */
  generateGroupId() {
    return `g${this.nextGroupId++}`;
  }

  /**
   * Update nextGroupId based on existing groups and pieces
   */
  updateNextGroupId() {
    // Collect all groupIds from groups and pieces
    const groupIds = [
      ...Array.from(this.groups.keys()),
      ...state.pieces.map((piece) => piece.groupId),
    ];

    // Filter valid group IDs, extract numbers, and find maximum
    const maxId = groupIds
      .filter((id) => id && id.match(GROUP_ID_PATTERN))
      .map((id) => parseInt(id.match(GROUP_ID_PATTERN)[1], 10))
      .reduce((max, id) => Math.max(max, id), 0);

    this.nextGroupId = maxId + 1;
  }

  /**
   * Get group by ID
   * @param {string} groupId - The ID of the group to retrieve
   * @returns {Group|undefined} The group instance or undefined if not found
   */
  getGroup(groupId) {
    return this.groups.get(groupId);
  }

  /**
   * Get the count of all groups
   * @returns {number} The total number of groups
   */
  getGroupCount() {
    return this.groups.size;
  }

  /**
   * Get group containing a specific piece
   * @param {Piece} piece - The piece to find the group for
   * @returns {Group|undefined} The group containing the piece or undefined if not found
   */
  getGroupForPiece(piece) {
    return this.groups.get(piece.groupId);
  }

  /**
   * Create a new group with a single piece
   * @param {Piece} piece - The piece to create a group for
   * @returns {Group} The newly created group
   */
  createSinglePieceGroup(piece) {
    const newGroupId = this.generateGroupId();
    piece._setGroupId(newGroupId);

    const group = new Group(newGroupId, [piece]);
    this.groups.set(newGroupId, group);

    return group;
  }

  /**
   * Merge two groups together
   * This is the main method called when pieces connect
   * @param {Piece} pieceA - First piece whose group will be merged
   * @param {Piece} pieceB - Second piece whose group will be merged
   * @returns {boolean} True if merge was successful, false otherwise
   */
  mergeGroups(pieceA, pieceB) {
    const groupA = this.getGroupForPiece(pieceA);
    const groupB = this.getGroupForPiece(pieceB);

    if (!groupA || !groupB) {
      return false;
    }

    if (groupA === groupB) {
      return true; // Already merged
    }

    try {
      // Check connectivity before merging
      const allPieces = [...groupA.allPieces, ...groupB.allPieces];
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
      const piecesToMove = mergeGroup.allPieces;
      keepGroup.addPieces(piecesToMove);

      // Remove the merged group
      this.groups.delete(mergeGroup.id);

      // Dispatch group change event
      document.dispatchEvent(
        new CustomEvent(GROUPS_CHANGED, {
          detail: {
            type: "merged",
            fromGroupId: mergeGroup.id,
            toGroupId: keepGroup.id,
          },
        })
      );

      // Dispatch pieces connected event for persistence
      document.dispatchEvent(
        new CustomEvent(PIECES_CONNECTED, {
          detail: {
            pieceAId: pieceA.id,
            pieceBId: pieceB.id,
            groupId: keepGroup.id,
          },
        })
      );

      return true;
    } catch (error) {
      console.error("[GroupManager] Error during group merge:", error);
      return false;
    }
  }

  /**
   * Detach a piece from its group
   * Handles fragmentation and creates new groups as needed
   * @param {Piece} piece - The piece to detach from its group
   * @returns {Group|null} The new single-piece group or null if detachment failed
   */
  detachPiece(piece) {
    const currentGroup = this.getGroupForPiece(piece);
    if (!currentGroup) {
      return null;
    }

    if (currentGroup.size() === 1) {
      return currentGroup;
    }

    try {
      // Remove piece from current group
      const fragmentGroups = currentGroup.removePieces([piece]);

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

      // Dispatch group change event
      document.dispatchEvent(
        new CustomEvent(GROUPS_CHANGED, {
          detail: {
            type: "detached",
            pieceId: piece.id,
            newGroupId: newGroup.id,
          },
        })
      );
      return newGroup;
    } catch (error) {
      console.error("[GroupManager] Error during piece detachment:", error);
      return null;
    }
  }

  /**
   * Validate connectivity of a set of pieces
   * @param {Piece[]} pieces - Array of pieces to validate connectivity for
   * @returns {boolean} True if all pieces are connected, false otherwise
   */
  validateConnectivity(pieces) {
    if (!pieces || pieces.length <= 1) return true;

    const tempGroup = new Group("temp", pieces);
    return tempGroup.isConnected();
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
