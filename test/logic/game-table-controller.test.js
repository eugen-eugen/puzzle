// game-table-controller.test.js - Unit tests for GameTableController
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameTableController } from "@/js/logic/game-table-controller.js";
import { Point } from "@/js/geometry/point.js";
import { Rectangle } from "@/js/geometry/rectangle.js";

// Mock dependencies
vi.mock("@/js/ui/display.js", () => ({
  applyPieceTransform: vi.fn(),
  applyPieceZIndex: vi.fn(),
  setPieceElements: vi.fn(),
}));

vi.mock("@/js/logic/group-manager.js", () => ({
  groupManager: {
    getGroup: vi.fn(),
  },
}));

vi.mock("@/js/game-engine.js", () => ({
  state: {
    pieces: [],
  },
}));

describe("GameTableController", () => {
  let controller;
  let mockState;
  let mockGroupManager;
  let mockDisplay;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Import fresh mocks
    mockDisplay = await import("@/js/ui/display.js");
    mockGroupManager = await import("@/js/logic/group-manager.js");
    const gameEngine = await import("@/js/game-engine.js");
    mockState = gameEngine.state;

    // Create fresh controller
    controller = new GameTableController();

    // Setup default state
    mockState.pieces = [];
  });

  describe("bringToFront", () => {
    it("should bring single piece to front", () => {
      const piece = { id: 1, zIndex: 5, groupId: null };
      mockState.pieces = [piece];
      controller.maxZIndex = 10;

      controller.bringToFront(1);

      expect(piece.zIndex).toBe(11);
      expect(controller.maxZIndex).toBe(11);
      expect(mockDisplay.applyPieceZIndex).toHaveBeenCalledWith(1, 11);
    });

    it("should bring entire group to front", () => {
      const piece1 = { id: 1, zIndex: 5, groupId: "g1" };
      const piece2 = { id: 2, zIndex: 5, groupId: "g1" };
      const piece3 = { id: 3, zIndex: 3, groupId: null };
      mockState.pieces = [piece1, piece2, piece3];

      const mockGroup = {
        allPieces: [piece1, piece2],
      };
      mockGroupManager.groupManager.getGroup.mockReturnValue(mockGroup);

      controller.maxZIndex = 10;
      controller.bringToFront(1);

      expect(piece1.zIndex).toBe(11);
      expect(piece2.zIndex).toBe(11);
      expect(piece3.zIndex).toBe(3); // Unchanged
      expect(controller.maxZIndex).toBe(11);
      expect(mockDisplay.applyPieceZIndex).toHaveBeenCalledTimes(2);
    });

    it("should handle non-existent piece gracefully", () => {
      mockState.pieces = [];
      controller.maxZIndex = 10;

      controller.bringToFront(999);

      expect(controller.maxZIndex).toBe(10); // Unchanged
      expect(mockDisplay.applyPieceZIndex).not.toHaveBeenCalled();
    });

    it("should increment maxZIndex from zero", () => {
      const piece = { id: 1, zIndex: 0, groupId: null };
      mockState.pieces = [piece];
      mockGroupManager.groupManager.getGroup.mockReturnValue(null);
      controller.maxZIndex = 0;

      controller.bringToFront(1);

      expect(piece.zIndex).toBe(1);
      expect(controller.maxZIndex).toBe(1);
    });
  });

  describe("_computeAvgPieceSize", () => {
    it("should return 0 for empty pieces array", () => {
      mockState.pieces = [];
      expect(controller._computeAvgPieceSize()).toBe(0);
    });

    it("should compute average of minimum dimensions", () => {
      mockState.pieces = [
        { imgRect: { width: 100, height: 80 }, scale: 1 }, // min: 80
        { imgRect: { width: 60, height: 90 }, scale: 1 }, // min: 60
        { imgRect: { width: 70, height: 70 }, scale: 1 }, // min: 70
      ];
      // Average: (80 + 60 + 70) / 3 = 70
      expect(controller._computeAvgPieceSize()).toBe(70);
    });

    it("should apply scale factor", () => {
      mockState.pieces = [
        { imgRect: { width: 100, height: 100 }, scale: 0.5 },
      ];
      // min(100, 100) * 0.5 = 50
      expect(controller._computeAvgPieceSize()).toBe(50);
    });

    it("should handle pieces with different scales", () => {
      mockState.pieces = [
        { imgRect: { width: 100, height: 80 }, scale: 0.5 }, // min: 80
        { imgRect: { width: 60, height: 90 }, scale: 0.5 }, // min: 60
      ];
      // Average: (80 + 60) / 2 * 0.5 = 35
      expect(controller._computeAvgPieceSize()).toBe(35);
    });

    it("should return 0 when state is null", () => {
      mockState.pieces = null;

      expect(controller._computeAvgPieceSize()).toBe(0);

      // Reset
      mockState.pieces = [];
    });
  });

  describe("getWorldData", () => {
    beforeEach(() => {
      // Setup a basic piece with required geometry
      const piece = {
        id: 1,
        rotation: 0,
        scale: 1,
        bitmap: { width: 100, height: 100 },
        corners: {
          nw: new Point(0, 0),
          ne: new Point(100, 0),
          se: new Point(100, 100),
          sw: new Point(0, 100),
        },
        sPoints: {
          north: new Point(50, 0),
          east: new Point(100, 50),
          south: new Point(50, 100),
          west: new Point(0, 50),
        },
        calculateBoundingFrame: () => ({
          topLeft: new Point(0, 0),
          bottomRight: new Point(100, 100),
          width: 100,
          height: 100,
          centerOffset: new Point(50, 50),
        }),
      };

      controller.setPiecePosition(1, new Point(200, 200));
      controller._testPiece = piece; // Store for use in tests
    });

    it("should return empty worldData for unpositioned piece", () => {
      const piece = { id: 999 };
      const result = controller.getWorldData(piece);

      expect(result).toEqual({
        worldCorners: {},
        worldSPoints: {},
      });
    });

    it("should compute and cache worldData", () => {
      const piece = controller._testPiece;
      const result1 = controller.getWorldData(piece);

      expect(result1).toHaveProperty("worldCorners");
      expect(result1).toHaveProperty("worldSPoints");
      expect(result1.worldCorners).toHaveProperty("nw");
      expect(result1.worldCorners).toHaveProperty("ne");
      expect(result1.worldCorners).toHaveProperty("se");
      expect(result1.worldCorners).toHaveProperty("sw");

      // Should use cache on second call (same result)
      const result2 = controller.getWorldData(piece);
      expect(result2).toBe(result1.data || result1);
    });

    it("should invalidate cache when position changes", () => {
      const piece = controller._testPiece;
      const result1 = controller.getWorldData(piece);

      // Change position
      controller.setPiecePosition(1, new Point(300, 300));
      const result2 = controller.getWorldData(piece);

      // Results should be different objects (cache was invalidated)
      expect(result2).not.toBe(result1);
    });

    it("should invalidate cache when rotation changes", () => {
      const piece = controller._testPiece;
      const result1 = controller.getWorldData(piece);

      // Change rotation
      piece.rotation = 90;
      const result2 = controller.getWorldData(piece);

      expect(result2).not.toBe(result1);
    });

    it("should invalidate cache when scale changes", () => {
      const piece = controller._testPiece;
      const result1 = controller.getWorldData(piece);

      // Change scale
      piece.scale = 0.5;
      const result2 = controller.getWorldData(piece);

      expect(result2).not.toBe(result1);
    });
  });

  describe("getCenter", () => {
    let piece;

    beforeEach(() => {
      piece = {
        id: 1,
        scale: 1,
        calculateBoundingFrame: () => ({
          width: 100,
          height: 100,
          centerOffset: new Point(50, 50),
        }),
      };
      controller.setPiecePosition(1, new Point(200, 200));
    });

    it("should compute center without element", () => {
      const center = controller.getCenter(piece);

      expect(center).toBeInstanceOf(Point);
      expect(center.x).toBe(250); // position (200) + canvasCenter (50)
      expect(center.y).toBe(250);
    });

    it("should compute center with element dimensions", () => {
      const mockElement = {
        offsetWidth: 120,
        offsetHeight: 120,
      };

      const center = controller.getCenter(piece, mockElement);

      expect(center).toBeInstanceOf(Point);
      // Center calculation includes element dimensions
      expect(typeof center.x).toBe("number");
      expect(typeof center.y).toBe("number");
    });

    it("should handle scaled pieces", () => {
      piece.scale = 0.5;
      const center = controller.getCenter(piece);

      expect(center).toBeInstanceOf(Point);
      // w=50, h=50, canvasCenter=(25,25), scaledCenterOffset=(25,25)
      // offset=(0,0), center = pos + canvasCenter = (200,200) + (25,25)
      expect(center.x).toBe(225);
      expect(center.y).toBe(225);
    });

    it("should handle pieces with offset bounding frames", () => {
      piece.calculateBoundingFrame = () => ({
        width: 100,
        height: 100,
        centerOffset: new Point(60, 40), // Offset center
      });

      const center = controller.getCenter(piece);

      expect(center).toBeInstanceOf(Point);
      // Center should account for offset
      expect(typeof center.x).toBe("number");
      expect(typeof center.y).toBe("number");
    });
  });

  describe("placePieceCenter", () => {
    let piece;
    let mockElement;

    beforeEach(() => {
      piece = {
        id: 1,
        scale: 1,
        calculateBoundingFrame: () => ({
          width: 100,
          height: 100,
          centerOffset: new Point(50, 50),
        }),
      };
      mockElement = {
        offsetWidth: 100,
        offsetHeight: 100,
      };

      mockState.pieces = [piece];
    });

    it("should position piece by its center point", () => {
      const targetCenter = new Point(300, 300);

      controller.placePieceCenter(1, targetCenter, mockElement);

      const position = controller.getPiecePosition(1);
      expect(position).toBeInstanceOf(Point);

      // Verify the center is at the target
      const actualCenter = controller.getCenter(piece, mockElement);
      expect(actualCenter.x).toBeCloseTo(targetCenter.x, 5);
      expect(actualCenter.y).toBeCloseTo(targetCenter.y, 5);
    });

    it("should handle non-existent piece gracefully", () => {
      const targetCenter = new Point(300, 300);

      controller.placePieceCenter(999, targetCenter, mockElement);

      // Should not throw, position map should be unchanged
      expect(controller.getPiecePosition(999)).toBeNull();
    });

    it("should work with scaled pieces", () => {
      piece.scale = 0.5;
      const targetCenter = new Point(250, 250);

      controller.placePieceCenter(1, targetCenter, mockElement);

      const actualCenter = controller.getCenter(piece, mockElement);
      expect(actualCenter.x).toBeCloseTo(targetCenter.x, 5);
      expect(actualCenter.y).toBeCloseTo(targetCenter.y, 5);
    });

    it("should update spatial index after positioning", () => {
      const targetCenter = new Point(300, 300);
      const spy = vi.spyOn(controller, "_updateSpatialIndexFor");

      controller.placePieceCenter(1, targetCenter, mockElement);

      expect(spy).toHaveBeenCalledWith(1);
    });
  });

  describe("arePiecesNeighbors", () => {
    it("should return false if either piece is null", () => {
      const piece = { worldData: {} };

      expect(controller.arePiecesNeighbors(null, piece)).toBe(false);
      expect(controller.arePiecesNeighbors(piece, null)).toBe(false);
      expect(controller.arePiecesNeighbors(null, null)).toBe(false);
    });

    it("should return false if worldData is missing", () => {
      const pieceA = { scale: 0.35 };
      const pieceB = { scale: 0.35, worldData: {} };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(false);
    });

    it("should return false if corners are missing", () => {
      const pieceA = { scale: 0.35, worldData: {} };
      const pieceB = { scale: 0.35, worldData: {} };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(false);
    });

    it("should detect north neighbor (A above B)", () => {
      const pieceA = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0),
            se: new Point(100, 100),
            sw: new Point(0, 100),
          },
        },
      };

      const pieceB = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 100), // Matches pieceA.sw
            ne: new Point(100, 100), // Matches pieceA.se
            se: new Point(100, 200),
            sw: new Point(0, 200),
          },
        },
      };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(true);
    });

    it("should detect south neighbor (A below B)", () => {
      const pieceA = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 100),
            ne: new Point(100, 100),
            se: new Point(100, 200),
            sw: new Point(0, 200),
          },
        },
      };

      const pieceB = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0),
            se: new Point(100, 100), // Matches pieceA.ne
            sw: new Point(0, 100), // Matches pieceA.nw
          },
        },
      };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(true);
    });

    it("should detect east neighbor (A to right of B)", () => {
      const pieceA = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(100, 0), // Matches pieceB.ne
            ne: new Point(200, 0),
            se: new Point(200, 100),
            sw: new Point(100, 100), // Matches pieceB.se
          },
        },
      };

      const pieceB = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0),
            se: new Point(100, 100),
            sw: new Point(0, 100),
          },
        },
      };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(true);
    });

    it("should detect west neighbor (A to left of B)", () => {
      const pieceA = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0), // Matches pieceB.nw
            se: new Point(100, 100), // Matches pieceB.sw
            sw: new Point(0, 100),
          },
        },
      };

      const pieceB = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(100, 0),
            ne: new Point(200, 0),
            se: new Point(200, 100),
            sw: new Point(100, 100),
          },
        },
      };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(true);
    });

    it("should return false for pieces that are close but not neighbors", () => {
      const pieceA = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0),
            se: new Point(100, 100),
            sw: new Point(0, 100),
          },
        },
      };

      const pieceB = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 150), // Gap of 50 pixels
            ne: new Point(100, 150),
            se: new Point(100, 250),
            sw: new Point(0, 250),
          },
        },
      };

      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(false);
    });

    it("should handle different scales", () => {
      const pieceA = {
        scale: 0.5,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0),
            se: new Point(100, 100),
            sw: new Point(0, 100),
          },
        },
      };

      const pieceB = {
        scale: 0.3,
        worldData: {
          worldCorners: {
            nw: new Point(0, 100),
            ne: new Point(100, 100),
            se: new Point(100, 200),
            sw: new Point(0, 200),
          },
        },
      };

      // Average scale affects tolerance
      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(true);
    });

    it("should require both corner pairs to match for a direction", () => {
      const pieceA = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 0),
            ne: new Point(100, 0),
            se: new Point(100, 100),
            sw: new Point(0, 100),
          },
        },
      };

      const pieceB = {
        scale: 0.35,
        worldData: {
          worldCorners: {
            nw: new Point(0, 100), // Matches pieceA.sw
            ne: new Point(150, 100), // Does NOT match pieceA.se
            se: new Point(150, 200),
            sw: new Point(0, 200),
          },
        },
      };

      // Should fail because ne/se don't align properly
      expect(controller.arePiecesNeighbors(pieceA, pieceB)).toBe(false);
    });
  });
});
