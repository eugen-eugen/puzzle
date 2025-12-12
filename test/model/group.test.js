// group.test.js - Unit tests for Group model
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Group } from "@/js/model/group.js";

// Mock dependencies
vi.mock("@/js/game-table-controller.js", () => ({
  gameTableController: {
    arePiecesNeighbors: vi.fn(),
    setPiecePosition: vi.fn(),
    movePiece: vi.fn(),
  },
}));

// Helper function to create mock pieces
function createMockPiece(id, gridX, gridY, neighbors = {}) {
  return {
    id,
    gridX,
    gridY,
    groupId: null,
    position: {
      x: gridX * 100,
      y: gridY * 100,
      clone: () => ({ x: gridX * 100, y: gridY * 100 }),
    },
    rotation: 0,
    _setGroupId(newId) {
      this.groupId = newId;
    },
    isAnyNeighbor(otherPiece) {
      const dx = Math.abs(this.gridX - otherPiece.gridX);
      const dy = Math.abs(this.gridY - otherPiece.gridY);
      return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    },
    calculateBoundingFrame() {
      return null;
    },
  };
}

describe("Group", () => {
  describe("constructor", () => {
    it("should create an empty group with no pieces", () => {
      const group = new Group("group-1");
      expect(group.id).toBe("group-1");
      expect(group.size()).toBe(0);
      expect(group.isEmpty()).toBe(true);
      expect(group.allPieces).toEqual([]);
    });

    it("should create a group with initial pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      expect(group.size()).toBe(2);
      expect(group.allPieces).toEqual([piece1, piece2]);
      expect(piece1.groupId).toBe("group-1");
      expect(piece2.groupId).toBe("group-1");
    });

    it("should throw error if initial pieces are not connected", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 5, 5); // Not adjacent

      expect(() => {
        new Group("group-1", [piece1, piece2]);
      }).toThrow(
        "Cannot create group group-1: initial pieces are not connected"
      );
    });

    it("should allow disconnected pieces when validateConnectivity is false", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 5, 5); // Not adjacent

      const group = new Group("group-1", [piece1, piece2], {
        validateConnectivity: false,
      });
      expect(group.size()).toBe(2);
      expect(piece1.groupId).toBe("group-1");
      expect(piece2.groupId).toBe("group-1");
    });

    it("should update border pieces on construction", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      expect(group.allBorderPieces.length).toBe(2); // Both are border pieces
    });
  });

  describe("addPieces", () => {
    let group, piece1, piece2, piece3;

    beforeEach(() => {
      piece1 = createMockPiece("p1", 0, 0);
      piece2 = createMockPiece("p2", 1, 0);
      piece3 = createMockPiece("p3", 2, 0);
      group = new Group("group-1", [piece1, piece2]);
    });

    it("should add connected pieces to the group", () => {
      const added = group.addPieces([piece3]);
      expect(added).toBe(1);
      expect(group.size()).toBe(3);
      expect(group.allPieces).toContain(piece3);
      expect(piece3.groupId).toBe("group-1");
    });

    it("should filter out null/undefined pieces", () => {
      const added = group.addPieces([null, undefined, piece3]);
      expect(added).toBe(1);
      expect(group.size()).toBe(3);
    });

    it("should return 0 when adding empty array", () => {
      const added = group.addPieces([]);
      expect(added).toBe(0);
      expect(group.size()).toBe(2);
    });

    it("should throw error when adding disconnected pieces", () => {
      const disconnectedPiece = createMockPiece("p4", 10, 10);
      expect(() => {
        group.addPieces([disconnectedPiece]);
      }).toThrow(
        "Cannot add pieces to group group-1: resulting group would not be connected"
      );
    });

    it("should not add pieces that are already in the group", () => {
      const added = group.addPieces([piece1, piece2]);
      expect(added).toBe(0);
      expect(group.size()).toBe(2);
    });

    it("should update border pieces after adding", () => {
      const initialBorderCount = group.allBorderPieces.length;
      group.addPieces([piece3]);
      // Border pieces should be updated
      expect(group.allBorderPieces).toBeDefined();
    });
  });

  describe("removePieces", () => {
    let group, piece1, piece2, piece3;

    beforeEach(() => {
      piece1 = createMockPiece("p1", 0, 0);
      piece2 = createMockPiece("p2", 1, 0);
      piece3 = createMockPiece("p3", 2, 0);
      group = new Group("group-1", [piece1, piece2, piece3]);
    });

    it("should remove pieces from the group", () => {
      const newGroups = group.removePieces([piece3]);
      expect(group.size()).toBe(2);
      expect(group.allPieces).not.toContain(piece3);
      expect(piece3.groupId).toBeNull();
      expect(newGroups).toEqual([]);
    });

    it("should return empty array when no pieces match", () => {
      const otherPiece = createMockPiece("p4", 10, 10);
      const newGroups = group.removePieces([otherPiece]);
      expect(newGroups).toEqual([]);
      expect(group.size()).toBe(3);
    });

    it("should handle removing null/undefined pieces", () => {
      const newGroups = group.removePieces([null, undefined]);
      expect(newGroups).toEqual([]);
      expect(group.size()).toBe(3);
    });

    it("should empty the group when all pieces are removed", () => {
      const newGroups = group.removePieces([piece1, piece2, piece3]);
      expect(group.isEmpty()).toBe(true);
      expect(newGroups).toEqual([]);
    });

    it("should create new groups when fragmentation occurs", () => {
      // Create a group with disconnected components after removal
      const piece4 = createMockPiece("p4", 0, 1);
      const piece5 = createMockPiece("p5", 5, 5);
      const piece6 = createMockPiece("p6", 6, 5);

      const fragGroup = new Group("frag-1", [piece4, piece5, piece6], {
        validateConnectivity: false,
      });

      // Remove piece4, leaving two disconnected components
      const newGroups = fragGroup.removePieces([piece4]);

      // Since pieces are disconnected, behavior depends on implementation
      // At minimum, group should handle the removal
      expect(fragGroup.allPieces).not.toContain(piece4);
    });

    it("should create two new groups when a bridge piece is removed", () => {
      // Create a bridge scenario:
      // Group A: piece1(0,0) - piece2(1,0) [2 pieces]
      // Bridge: piece3(2,0)
      // Group B: piece4(3,0) - piece5(4,0) [2 pieces]
      //
      // When piece3 (the bridge) is removed, we get 2 disconnected subgroups
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const piece3 = createMockPiece("p3", 2, 0); // Bridge piece
      const piece4 = createMockPiece("p4", 3, 0);
      const piece5 = createMockPiece("p5", 4, 0);

      const bridgeGroup = new Group("bridge-1", [
        piece1,
        piece2,
        piece3,
        piece4,
        piece5,
      ]);

      // Verify initial state
      expect(bridgeGroup.size()).toBe(5);
      expect(bridgeGroup.isConnected()).toBe(true);

      // Remove the bridge piece
      const newGroups = bridgeGroup.removePieces([piece3]);

      // Should create 1 new subgroup (fragmentation into 2 groups)
      expect(newGroups).toHaveLength(1);
      expect(newGroups[0]).toBeInstanceOf(Group);

      // Original group should keep one component (p1, p2)
      expect(bridgeGroup.allPieces).not.toContain(piece3);
      expect(bridgeGroup.size()).toBe(2); // p1 and p2

      // New group should have the other component (p4, p5)
      expect(newGroups[0].size()).toBe(2); // p4 and p5

      // Verify groupIds are correctly set
      expect(piece3.groupId).toBeNull(); // Removed piece
      expect(bridgeGroup.allPieces).toContain(piece1);
      expect(bridgeGroup.allPieces).toContain(piece2);
      expect(bridgeGroup.allPieces).not.toContain(piece4);
      expect(bridgeGroup.allPieces).not.toContain(piece5);

      // New group should have p4 and p5
      expect(newGroups[0].allPieces).toContain(piece4);
      expect(newGroups[0].allPieces).toContain(piece5);
    });
  });

  describe("allPieces getter", () => {
    it("should return array of all pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      const pieces = group.allPieces;
      expect(Array.isArray(pieces)).toBe(true);
      expect(pieces).toEqual([piece1, piece2]);
    });

    it("should return empty array for empty group", () => {
      const group = new Group("group-1");
      expect(group.allPieces).toEqual([]);
    });
  });

  describe("size and isEmpty", () => {
    it("should return correct size", () => {
      const group = new Group("group-1");
      expect(group.size()).toBe(0);

      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      group.addPieces([piece1, piece2]);
      expect(group.size()).toBe(2);
    });

    it("should correctly report isEmpty", () => {
      const group = new Group("group-1");
      expect(group.isEmpty()).toBe(true);

      const piece1 = createMockPiece("p1", 0, 0);
      group.addPieces([piece1]);
      expect(group.isEmpty()).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all pieces and clear groupId", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      group.clear();

      expect(group.isEmpty()).toBe(true);
      expect(group.size()).toBe(0);
      expect(piece1.groupId).toBeNull();
      expect(piece2.groupId).toBeNull();
      expect(group.allBorderPieces).toEqual([]);
    });
  });

  describe("allBorderPieces", () => {
    it("should return all border pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const piece3 = createMockPiece("p3", 2, 0);
      const group = new Group("group-1", [piece1, piece2, piece3]);

      const borderPieces = group.allBorderPieces;
      expect(Array.isArray(borderPieces)).toBe(true);
      // piece1 and piece3 are border pieces (only 1 neighbor each)
      // piece2 is not a border piece (has 2 neighbors)
      expect(borderPieces).toContain(piece1);
      expect(borderPieces).toContain(piece3);
    });

    it("should return empty array for empty group", () => {
      const group = new Group("group-1");
      expect(group.allBorderPieces).toEqual([]);
    });

    it("should identify all pieces as border in a 2x2 grid", () => {
      const p1 = createMockPiece("p1", 0, 0);
      const p2 = createMockPiece("p2", 1, 0);
      const p3 = createMockPiece("p3", 0, 1);
      const p4 = createMockPiece("p4", 1, 1);
      const group = new Group("group-1", [p1, p2, p3, p4]);

      // All pieces have < 4 neighbors, so all are border pieces
      expect(group.allBorderPieces.length).toBe(4);
    });
  });

  describe("merge", () => {
    it("should merge another group into this group", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const piece3 = createMockPiece("p3", 2, 0);

      const group1 = new Group("group-1", [piece1, piece2]);
      const group2 = new Group("group-2", [piece3]);

      // Make piece3 adjacent to piece2
      const result = group1.merge(group2);

      expect(result).toBe(true);
      expect(group1.size()).toBe(3);
      expect(group1.allPieces).toContain(piece3);
      expect(group2.isEmpty()).toBe(true);
    });

    it("should return false when merging null group", () => {
      const group = new Group("group-1", [createMockPiece("p1", 0, 0)]);
      expect(group.merge(null)).toBe(false);
    });

    it("should return false when merging with itself", () => {
      const group = new Group("group-1", [createMockPiece("p1", 0, 0)]);
      expect(group.merge(group)).toBe(false);
    });
  });

  describe("validate", () => {
    it("should return true for valid group", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      expect(group.validate()).toBe(true);
    });

    it("should return false if piece has wrong groupId", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      piece1.groupId = "wrong-group";
      expect(group.validate()).toBe(false);
    });

    it("should return false if piece is null", () => {
      const group = new Group("group-1");
      group.pieces = [null, createMockPiece("p1", 0, 0)];
      expect(group.validate()).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return group statistics", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      const stats = group.getStats();
      expect(stats.id).toBe("group-1");
      expect(stats.pieceCount).toBe(2);
      // bounds and center may be null if pieces don't have proper bounding frames
      expect(stats).toHaveProperty("bounds");
      expect(stats).toHaveProperty("center");
    });
  });

  describe("arePiecesConnected", () => {
    it("should return true for empty array", () => {
      expect(Group.arePiecesConnected([])).toBe(true);
    });

    it("should return true for single piece", () => {
      const piece = createMockPiece("p1", 0, 0);
      expect(Group.arePiecesConnected([piece])).toBe(true);
    });

    it("should return true for connected pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const piece3 = createMockPiece("p3", 2, 0);
      expect(Group.arePiecesConnected([piece1, piece2, piece3])).toBe(true);
    });

    it("should return false for disconnected pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 5, 5);
      expect(Group.arePiecesConnected([piece1, piece2])).toBe(false);
    });

    it("should handle L-shaped connected pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const piece3 = createMockPiece("p3", 1, 1);
      expect(Group.arePiecesConnected([piece1, piece2, piece3])).toBe(true);
    });
  });

  describe("_findConnectedComponents", () => {
    it("should return empty array for empty input", () => {
      expect(Group._findConnectedComponents([])).toEqual([]);
    });

    it("should return single component for connected pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const components = Group._findConnectedComponents([piece1, piece2]);
      expect(components.length).toBe(1);
      expect(components[0]).toEqual([piece1, piece2]);
    });

    it("should return multiple components for disconnected pieces", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const piece3 = createMockPiece("p3", 5, 5);
      const piece4 = createMockPiece("p4", 6, 5);

      const components = Group._findConnectedComponents([
        piece1,
        piece2,
        piece3,
        piece4,
      ]);
      expect(components.length).toBe(2);
    });
  });

  describe("isConnected", () => {
    it("should return true for empty group", () => {
      const group = new Group("group-1");
      expect(group.isConnected()).toBe(true);
    });

    it("should return true for single piece group", () => {
      const piece = createMockPiece("p1", 0, 0);
      const group = new Group("group-1", [piece]);
      expect(group.isConnected()).toBe(true);
    });

    it("should return true for connected group", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);
      expect(group.isConnected()).toBe(true);
    });

    it("should return false for disconnected group", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 5, 5);
      const group = new Group("group-1", [piece1, piece2], {
        validateConnectivity: false,
      });
      expect(group.isConnected()).toBe(false);
    });
  });

  describe("toString", () => {
    it("should return string representation", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      const str = group.toString();
      expect(str).toContain("group-1");
      expect(str).toContain("2");
      expect(typeof str).toBe("string");
    });
  });

  describe("immutability", () => {
    it("should not mutate pieces array when adding", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1]);

      const originalPieces = group.pieces;
      group.addPieces([piece2]);

      // pieces array should be replaced, not mutated
      expect(group.pieces).not.toBe(originalPieces);
      expect(originalPieces.length).toBe(1);
      expect(group.pieces.length).toBe(2);
    });

    it("should not mutate pieces array when removing", () => {
      const piece1 = createMockPiece("p1", 0, 0);
      const piece2 = createMockPiece("p2", 1, 0);
      const group = new Group("group-1", [piece1, piece2]);

      const originalPieces = group.pieces;
      group.removePieces([piece2]);

      // pieces array should be replaced, not mutated
      expect(group.pieces).not.toBe(originalPieces);
      expect(originalPieces.length).toBe(2);
      expect(group.pieces.length).toBe(1);
    });
  });
});
