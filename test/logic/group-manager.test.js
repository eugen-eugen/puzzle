// group-manager.test.js - Unit tests for GroupManager
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { GroupManager } from "@/js/logic/group-manager.js";
import { Group } from "@/js/model/group.js";

// Mock dependencies
vi.mock("@/js/game-engine.js", () => ({
  state: {
    pieces: [],
  },
}));

vi.mock("@/js/logic/game-table-controller.js", () => ({
  gameTableController: {
    arePiecesNeighbors: vi.fn((piece1, piece2) => {
      // Mock neighbor logic based on grid positions
      const dx = Math.abs(piece1.gridX - piece2.gridX);
      const dy = Math.abs(piece1.gridY - piece2.gridY);
      return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    }),
  },
}));

vi.mock("@/js/constants/custom-events.js", () => ({
  GROUPS_CHANGED: "groups:changed",
}));

// Helper function to create mock pieces
function createMockPiece(id, gridX, gridY) {
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
    calculateBoundingFrame() {
      return null;
    },
  };
}

describe("GroupManager", () => {
  let groupManager;
  let dispatchEventSpy;

  beforeEach(() => {
    groupManager = new GroupManager();
    dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
  });

  afterEach(() => {
    dispatchEventSpy.mockRestore();
  });

  describe("createSinglePieceGroup", () => {
    it("should create a new group with a single piece", () => {
      const piece = createMockPiece(1, 0, 0);

      const group = groupManager.createSinglePieceGroup(piece);

      expect(group).toBeInstanceOf(Group);
      expect(group.size()).toBe(1);
      expect(group.allPieces).toContain(piece);
      expect(piece.groupId).toBe(group.id);
      expect(groupManager.getGroup(group.id)).toBe(group);
    });

    it("should assign a unique group ID to the piece", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group1 = groupManager.createSinglePieceGroup(piece1);
      const group2 = groupManager.createSinglePieceGroup(piece2);

      expect(group1.id).not.toBe(group2.id);
      expect(piece1.groupId).toBe(group1.id);
      expect(piece2.groupId).toBe(group2.id);
    });

    it("should increment nextGroupId counter", () => {
      const initialId = groupManager.nextGroupId;
      const piece = createMockPiece(1, 0, 0);

      groupManager.createSinglePieceGroup(piece);

      expect(groupManager.nextGroupId).toBe(initialId + 1);
    });
  });

  describe("updateNextGroupId", () => {
    it("should update nextGroupId based on existing group IDs", () => {
      const piece1 = createMockPiece(1, 0, 0);
      piece1._setGroupId("g5");
      const piece2 = createMockPiece(2, 1, 0);
      piece2._setGroupId("g10");

      const group1 = new Group("g5", [piece1]);
      const group2 = new Group("g10", [piece2]);
      groupManager.groups.set("g5", group1);
      groupManager.groups.set("g10", group2);

      groupManager.updateNextGroupId();

      expect(groupManager.nextGroupId).toBe(11);
    });

    it("should handle non-numeric group IDs", () => {
      const piece = createMockPiece(1, 0, 0);
      piece._setGroupId("custom-group");

      const group = new Group("custom-group", [piece]);
      groupManager.groups.set("custom-group", group);

      groupManager.updateNextGroupId();

      expect(groupManager.nextGroupId).toBe(1);
    });

    it("should handle empty group manager", () => {
      groupManager.nextGroupId = 5;
      groupManager.updateNextGroupId();

      expect(groupManager.nextGroupId).toBe(1);
    });
  });

  describe("mergeGroups", () => {
    it("should merge two groups successfully", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group1 = groupManager.createSinglePieceGroup(piece1);
      const group2 = groupManager.createSinglePieceGroup(piece2);

      const result = groupManager.mergeGroups(piece1, piece2);

      expect(result).toBe(true);
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "groups:changed",
          detail: expect.objectContaining({
            type: "merged",
          }),
        })
      );
    });

    it("should return false if pieces are not in groups", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const result = groupManager.mergeGroups(piece1, piece2);

      expect(result).toBe(false);
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("should return true if pieces are already in the same group", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group = new Group("g110", [piece1, piece2]);
      piece1._setGroupId("g110");
      piece2._setGroupId("g110");
      groupManager.groups.set("g110", group);

      const result = groupManager.mergeGroups(piece1, piece2);

      expect(result).toBe(true);
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("should merge smaller group into larger group", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);
      const piece3 = createMockPiece(3, 2, 0);

      // Create larger group with 2 pieces
      const group1 = new Group("g100", [piece1, piece2]);
      piece1._setGroupId("g100");
      piece2._setGroupId("g100");
      groupManager.groups.set("g100", group1);

      // Create smaller group with 1 piece
      const group2 = groupManager.createSinglePieceGroup(piece3);
      const group2Id = group2.id;

      const result = groupManager.mergeGroups(piece2, piece3);

      expect(result).toBe(true);
      // The larger group (g100) should remain
      expect(groupManager.groups.has("g100")).toBe(true);
      // The smaller group should be deleted
      expect(groupManager.groups.has(group2Id)).toBe(false);
    });

    it("should delete the merged group from manager", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group1 = groupManager.createSinglePieceGroup(piece1);
      const group2 = groupManager.createSinglePieceGroup(piece2);

      const initialGroupCount = groupManager.getGroupCount();
      groupManager.mergeGroups(piece1, piece2);

      expect(groupManager.getGroupCount()).toBe(initialGroupCount - 1);
    });

    it("should dispatch groups:changed event with correct details", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group1 = groupManager.createSinglePieceGroup(piece1);
      const group2 = groupManager.createSinglePieceGroup(piece2);
      const smallerGroupId = group2.id;

      groupManager.mergeGroups(piece1, piece2);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "groups:changed",
          detail: expect.objectContaining({
            type: "merged",
            fromGroupId: smallerGroupId,
            toGroupId: group1.id,
          }),
        })
      );
    });
  });

  describe("detachPiece - remaining part is connected", () => {
    it("should detach a piece from a two-piece group", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group = new Group("g101", [piece1, piece2]);
      piece1._setGroupId("g101");
      piece2._setGroupId("g101");
      groupManager.groups.set("g101", group);

      const newGroup = groupManager.detachPiece(piece1);

      expect(newGroup).toBeInstanceOf(Group);
      expect(newGroup.size()).toBe(1);
      expect(newGroup.allPieces).toContain(piece1);
      expect(piece1.groupId).toBe(newGroup.id);
    });

    it("should return null if piece is not in any group", () => {
      const piece = createMockPiece(1, 0, 0);

      const result = groupManager.detachPiece(piece);

      expect(result).toBeNull();
    });

    it("should return current group if piece is already alone", () => {
      const piece = createMockPiece(1, 0, 0);
      const group = groupManager.createSinglePieceGroup(piece);

      const result = groupManager.detachPiece(piece);

      expect(result).toBe(group);
    });

    it("should keep remaining pieces in a single group", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);
      const piece3 = createMockPiece(3, 2, 0);

      // Create a line of 3 connected pieces (use high ID to avoid collision with generated IDs)
      const group = new Group("g100", [piece1, piece2, piece3]);
      piece1._setGroupId("g100");
      piece2._setGroupId("g100");
      piece3._setGroupId("g100");
      groupManager.groups.set("g100", group);

      const initialGroupCount = groupManager.getGroupCount();

      // Detach piece from one end
      const newGroup = groupManager.detachPiece(piece1);

      expect(newGroup).not.toBeNull();
      expect(newGroup.id).not.toBe("g100");
      expect(newGroup.size()).toBe(1);

      // Original group keeps the largest fragment (2 pieces), new group for detached piece (1 piece)
      // Total = initialGroupCount + 1
      expect(groupManager.getGroupCount()).toBe(initialGroupCount + 1);

      // Verify original group still has the 2 remaining pieces
      expect(group.size()).toBe(2);
      expect(piece2.groupId).toBe("g100");
      expect(piece3.groupId).toBe("g100");
    });

    it("should dispatch groups:changed event when detaching", () => {
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);

      const group = new Group("g102", [piece1, piece2]);
      piece1._setGroupId("g102");
      piece2._setGroupId("g102");
      groupManager.groups.set("g102", group);

      const newGroup = groupManager.detachPiece(piece1);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "groups:changed",
          detail: expect.objectContaining({
            type: "detached",
            pieceId: piece1.id,
            newGroupId: newGroup.id,
          }),
        })
      );
    });
  });

  describe("detachPiece - remaining part has 2 connected subgroups", () => {
    it("should create separate groups for disconnected fragments", () => {
      // Create a T-shaped group:
      //   piece2
      //   |
      // piece1 - piece3 - piece4
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 0, 1);
      const piece3 = createMockPiece(3, 1, 0);
      const piece4 = createMockPiece(4, 2, 0);

      const group = new Group("g103", [piece1, piece2, piece3, piece4]);
      piece1._setGroupId("g103");
      piece2._setGroupId("g103");
      piece3._setGroupId("g103");
      piece4._setGroupId("g103");
      groupManager.groups.set("g103", group);

      const initialGroupCount = groupManager.getGroupCount();

      // Detach piece3 (the connecting piece)
      groupManager.detachPiece(piece3);

      // After detaching piece3:
      // - Original group keeps largest fragment (piece1-piece2, 2 pieces)
      // - New group for detached piece3 (1 piece)
      // - New fragment group for piece4 (1 piece)
      // Total = initialCount + 2
      expect(groupManager.getGroupCount()).toBe(initialGroupCount + 2);

      // Verify fragments are in different groups
      expect(piece1.groupId).toBe("g103"); // largest fragment stays in original
      expect(piece2.groupId).toBe("g103");
      expect(piece3.groupId).not.toBe("g103"); // detached
      expect(piece4.groupId).not.toBe("g103"); // fragment
      expect(piece3.groupId).not.toBe(piece4.groupId); // different groups
    });

    it("should register fragment groups in the manager", () => {
      // Create a line: piece1 - piece2 - piece3
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 1, 0);
      const piece3 = createMockPiece(3, 2, 0);

      const group = new Group("g104", [piece1, piece2, piece3]);
      piece1._setGroupId("g104");
      piece2._setGroupId("g104");
      piece3._setGroupId("g104");
      groupManager.groups.set("g104", group);

      // Detach middle piece
      groupManager.detachPiece(piece2);

      // Each piece should be in a valid group
      expect(piece1.groupId).toBeTruthy();
      expect(piece2.groupId).toBeTruthy();
      expect(piece3.groupId).toBeTruthy();

      // All groups should be registered
      expect(groupManager.getGroup(piece1.groupId)).toBeTruthy();
      expect(groupManager.getGroup(piece2.groupId)).toBeTruthy();
      expect(groupManager.getGroup(piece3.groupId)).toBeTruthy();
    });

    it("should handle complex fragmentation patterns", () => {
      // Create a cross pattern:
      //     piece2
      //     |
      // piece1 - piece3 - piece5
      //     |
      //   piece4
      const piece1 = createMockPiece(1, 0, 0);
      const piece2 = createMockPiece(2, 0, 1);
      const piece3 = createMockPiece(3, 1, 0);
      const piece4 = createMockPiece(4, 0, -1);
      const piece5 = createMockPiece(5, 2, 0);

      const group = new Group("g105", [piece1, piece2, piece3, piece4, piece5]);
      piece1._setGroupId("g105");
      piece2._setGroupId("g105");
      piece3._setGroupId("g105");
      piece4._setGroupId("g105");
      piece5._setGroupId("g105");
      groupManager.groups.set("g105", group);

      // Detach center piece (piece3)
      const detachedGroup = groupManager.detachPiece(piece3);

      // piece3 should be in its own group
      expect(detachedGroup.size()).toBe(1);
      expect(detachedGroup.allPieces).toContain(piece3);

      // All other pieces should still have groups
      expect(piece1.groupId).toBeTruthy();
      expect(piece2.groupId).toBeTruthy();
      expect(piece4.groupId).toBeTruthy();
      expect(piece5.groupId).toBeTruthy();
    });
  });
});
