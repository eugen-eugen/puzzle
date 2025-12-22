// piece.test.js - Unit tests for Piece model
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Piece } from "@/js/model/piece.js";
import { Point } from "@/js/geometry/point.js";
import { Rectangle } from "@/js/geometry/rectangle.js";
import { DEFAULT_PIECE_SCALE } from "@/js/constants/piece-constants.js";
import { gameTableController } from "@/js/logic/game-table-controller.js";

// Mock dependencies
vi.mock("@/js/logic/game-table-controller.js", () => ({
  gameTableController: {
    setPiecePosition: vi.fn(),
    getPiecePosition: vi.fn((id) => new Point(100, 200)),
    getWorldData: vi.fn((piece) => ({
      worldCorners: {
        nw: new Point(0, 0),
        ne: new Point(10, 0),
        se: new Point(10, 10),
        sw: new Point(0, 10),
      },
      worldSPoints: {
        north: new Point(5, 0),
        east: new Point(10, 5),
        south: new Point(5, 10),
        west: new Point(0, 5),
      },
    })),
    getCenter: vi.fn((piece, element) => new Point(150, 250)),
  },
}));

// Helper to create minimal piece data
function createPieceData(overrides = {}) {
  return {
    id: "piece-1",
    gridX: 0,
    gridY: 0,
    imgX: 0,
    imgY: 0,
    w: 100,
    h: 100,
    bitmap: document.createElement("canvas"),
    path: new Path2D(),
    corners: {
      nw: new Point(0, 0),
      ne: new Point(100, 0),
      se: new Point(100, 100),
      sw: new Point(0, 100),
    },
    sPoints: {
      north: new Point(50, -10),
      east: new Point(110, 50),
      south: new Point(50, 110),
      west: new Point(-10, 50),
    },
    ...overrides,
  };
}

describe("Piece", () => {
  describe("constructor", () => {
    it("should initialize with minimal required data", () => {
      const data = createPieceData();
      const piece = new Piece(data);

      expect(piece.id).toBe("piece-1");
      expect(piece.gridPos).toEqual(new Point(0, 0));
      expect(piece.imgRect).toBeInstanceOf(Rectangle);
      expect(piece.imgRect.position).toEqual(new Point(0, 0));
      expect(piece.imgRect.width).toBe(100);
      expect(piece.imgRect.height).toBe(100);
      expect(piece.rotation).toBe(0);
      expect(piece.scale).toBe(DEFAULT_PIECE_SCALE);
    });

    it("should use provided scale value", () => {
      const data = createPieceData({ scale: 0.5 });
      const piece = new Piece(data);

      expect(piece.scale).toBe(0.5);
    });

    it("should use DEFAULT_PIECE_SCALE when scale not provided", () => {
      const data = createPieceData();
      const piece = new Piece(data);

      expect(piece.scale).toBe(DEFAULT_PIECE_SCALE);
    });

    it("should initialize groupId as null and store requestedGroupId", () => {
      const data = createPieceData({ groupId: "group-123" });
      const piece = new Piece(data);

      expect(piece.groupId).toBeNull();
      expect(piece._requestedGroupId).toBe("group-123");
    });

    it("should handle displayX/displayY for position", () => {
      const data = createPieceData({ displayX: 250, displayY: 350 });
      const piece = new Piece(data);

      expect(gameTableController.setPiecePosition).toHaveBeenCalledWith(
        "piece-1",
        new Point(250, 350)
      );
    });

    it("should prefer nw Point over displayX/displayY", () => {
      const data = createPieceData({
        nw: new Point(500, 600),
        displayX: 250,
        displayY: 350,
      });
      const piece = new Piece(data);

      expect(gameTableController.setPiecePosition).toHaveBeenCalledWith(
        "piece-1",
        new Point(500, 600)
      );
    });

    it("should handle geometry data with normalization", () => {
      const nwOrigin = new Point(50, 60);
      const data = createPieceData({
        nw: nwOrigin,
        geometryCorners: {
          nw: new Point(50, 60),
          ne: new Point(150, 60),
          se: new Point(150, 160),
          sw: new Point(50, 160),
        },
        geometrySidePoints: {
          north: new Point(100, 50),
          east: new Point(160, 110),
          south: new Point(100, 170),
          west: new Point(40, 110),
        },
      });
      const piece = new Piece(data);

      // Should be normalized to origin
      expect(piece.corners.nw).toEqual(new Point(0, 0));
      expect(piece.corners.ne).toEqual(new Point(100, 0));
      expect(piece.sPoints.north).toEqual(new Point(50, -10));
    });

    it("should set zIndex or default to null", () => {
      const piece1 = new Piece(createPieceData({ zIndex: 5 }));
      const piece2 = new Piece(createPieceData());

      expect(piece1.zIndex).toBe(5);
      expect(piece2.zIndex).toBeNull();
    });

    it("should set rotation or default to 0", () => {
      const piece1 = new Piece(createPieceData({ rotation: 45 }));
      const piece2 = new Piece(createPieceData());

      expect(piece1.rotation).toBe(45);
      expect(piece2.rotation).toBe(0);
    });
  });

  describe("rotate", () => {
    it("should add positive degrees clockwise", () => {
      const piece = new Piece(createPieceData({ rotation: 0 }));
      piece.rotate(90);
      expect(piece.rotation).toBe(90);
    });

    it("should add negative degrees counter-clockwise", () => {
      const piece = new Piece(createPieceData({ rotation: 90 }));
      piece.rotate(-45);
      expect(piece.rotation).toBe(45);
    });

    it("should wrap around at 360 degrees", () => {
      const piece = new Piece(createPieceData({ rotation: 350 }));
      piece.rotate(20);
      expect(piece.rotation).toBe(10);
    });

    it("should handle negative wrap-around", () => {
      const piece = new Piece(createPieceData({ rotation: 10 }));
      piece.rotate(-20);
      expect(piece.rotation).toBe(350);
    });

    it("should handle multiple rotations", () => {
      const piece = new Piece(createPieceData({ rotation: 0 }));
      piece.rotate(45);
      piece.rotate(45);
      piece.rotate(45);
      expect(piece.rotation).toBe(135);
    });
  });

  describe("setRotation", () => {
    it("should set absolute rotation", () => {
      const piece = new Piece(createPieceData({ rotation: 45 }));
      piece.setRotation(180);
      expect(piece.rotation).toBe(180);
    });

    it("should normalize rotation to 0-359 range", () => {
      const piece = new Piece(createPieceData());
      piece.setRotation(400);
      expect(piece.rotation).toBe(40);
    });

    it("should handle negative rotation values", () => {
      const piece = new Piece(createPieceData());
      piece.setRotation(-45);
      expect(piece.rotation).toBe(315);
    });

    it("should handle exact 360 degree rotation", () => {
      const piece = new Piece(createPieceData());
      piece.setRotation(360);
      expect(piece.rotation).toBe(0);
    });
  });

  describe("_setGroupId", () => {
    it("should update internal groupId", () => {
      const piece = new Piece(createPieceData());
      expect(piece.groupId).toBeNull();

      piece._setGroupId("group-456");
      expect(piece.groupId).toBe("group-456");
    });

    it("should allow changing groupId multiple times", () => {
      const piece = new Piece(createPieceData());
      piece._setGroupId("group-1");
      expect(piece.groupId).toBe("group-1");

      piece._setGroupId("group-2");
      expect(piece.groupId).toBe("group-2");
    });
  });

  describe("calculateBoundingFrame", () => {
    it("should calculate bounds from corners only", () => {
      const data = createPieceData({
        corners: {
          nw: new Point(0, 0),
          ne: new Point(100, 0),
          se: new Point(100, 100),
          sw: new Point(0, 100),
        },
        sPoints: {},
      });
      const piece = new Piece(data);
      const frame = piece.calculateBoundingFrame();

      expect(frame).toBeInstanceOf(Rectangle);
      expect(frame.topLeft).toEqual(new Point(0, 0));
      expect(frame.bottomRight).toEqual(new Point(100, 100));
      expect(frame.width).toBe(100);
      expect(frame.height).toBe(100);
    });

    it("should include side points in bounds calculation", () => {
      const data = createPieceData({
        corners: {
          nw: new Point(0, 0),
          ne: new Point(100, 0),
          se: new Point(100, 100),
          sw: new Point(0, 100),
        },
        sPoints: {
          north: new Point(50, -20), // Extends above
          south: new Point(50, 120), // Extends below
          east: new Point(120, 50), // Extends right
          west: new Point(-10, 50), // Extends left
        },
      });
      const piece = new Piece(data);
      const frame = piece.calculateBoundingFrame();

      expect(frame.topLeft.x).toBe(-10);
      expect(frame.topLeft.y).toBe(-20);
      expect(frame.bottomRight.x).toBe(120);
      expect(frame.bottomRight.y).toBe(120);
      expect(frame.width).toBe(130);
      expect(frame.height).toBe(140);
    });

    it("should handle partial side points", () => {
      const data = createPieceData({
        corners: {
          nw: new Point(0, 0),
          ne: new Point(100, 0),
          se: new Point(100, 100),
          sw: new Point(0, 100),
        },
        sPoints: {
          north: new Point(50, -10),
          east: new Point(110, 50),
          // south and west missing
        },
      });
      const piece = new Piece(data);
      const frame = piece.calculateBoundingFrame();

      expect(frame.topLeft.x).toBe(0);
      expect(frame.topLeft.y).toBe(-10);
      expect(frame.bottomRight.x).toBe(110);
      expect(frame.bottomRight.y).toBe(100);
    });

    it("should handle edge case with no valid points", () => {
      // When corners/sPoints are truly invalid (undefined values),
      // the method should return a fallback based on imgRect
      const data = createPieceData({
        corners: {
          nw: undefined,
          ne: undefined,
          se: undefined,
          sw: undefined,
        },
        sPoints: {},
      });
      const piece = new Piece(data);
      const frame = piece.calculateBoundingFrame();

      // Should fallback to imgRect dimensions
      expect(frame.width).toBe(100);
      expect(frame.height).toBe(100);
    });
  });

  describe("generatePath", () => {
    it("should generate Path2D from corners and side points", () => {
      const piece = new Piece(createPieceData());
      const path = piece.generatePath();

      expect(path).toBeInstanceOf(Path2D);
    });

    it("should handle pieces without side points", () => {
      const data = createPieceData({
        corners: {
          nw: new Point(0, 0),
          ne: new Point(100, 0),
          se: new Point(100, 100),
          sw: new Point(0, 100),
        },
        sPoints: {},
      });
      const piece = new Piece(data);
      const path = piece.generatePath();

      expect(path).toBeInstanceOf(Path2D);
    });

    it("should include all provided side points", () => {
      const data = createPieceData({
        sPoints: {
          north: new Point(50, -10),
          east: new Point(110, 50),
          south: new Point(50, 110),
          west: new Point(-10, 50),
        },
      });
      const piece = new Piece(data);
      const path = piece.generatePath();

      expect(path).toBeInstanceOf(Path2D);
    });
  });

  describe("serialize", () => {
    it("should serialize all piece data", () => {
      gameTableController.getPiecePosition.mockReturnValue(new Point(300, 400));

      const piece = new Piece(
        createPieceData({
          rotation: 45,
          groupId: "group-789",
          zIndex: 10,
        })
      );
      piece._setGroupId("group-789");

      const serialized = piece.serialize();

      expect(serialized.id).toBe("piece-1");
      expect(serialized.gridX).toBe(0);
      expect(serialized.gridY).toBe(0);
      expect(serialized.rotation).toBe(45);
      expect(serialized.displayX).toBe(300);
      expect(serialized.displayY).toBe(400);
      expect(serialized.groupId).toBe("group-789");
      expect(serialized.zIndex).toBe(10);
      expect(serialized.imgX).toBe(0);
      expect(serialized.imgY).toBe(0);
      expect(serialized.w).toBe(100);
      expect(serialized.h).toBe(100);
      expect(serialized.scale).toBe(DEFAULT_PIECE_SCALE);
      expect(serialized.corners).toBeDefined();
      expect(serialized.sPoints).toBeDefined();
    });

    it("should not include bitmap by default", () => {
      const piece = new Piece(createPieceData());
      const serialized = piece.serialize();

      expect(serialized.bitmapData).toBeUndefined();
    });

    it.skip("should include bitmap when requested", () => {
      // Skip this test in jsdom - toDataURL requires canvas npm package
      const canvas = document.createElement("canvas");
      canvas.width = 10;
      canvas.height = 10;
      const data = createPieceData({ bitmap: canvas });
      const piece = new Piece(data);

      const serialized = piece.serialize(true);

      expect(serialized.bitmapData).toBeDefined();
      expect(typeof serialized.bitmapData).toBe("string");
      expect(serialized.bitmapData).toContain("data:image");
    });

    it("should handle bitmap serialization failure gracefully", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mockBitmap = {
        toDataURL: () => {
          throw new Error("Canvas is tainted");
        },
      };
      const data = createPieceData({ bitmap: mockBitmap });
      const piece = new Piece(data);

      const serialized = piece.serialize(true);

      expect(serialized.bitmapData).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("deserialize", () => {
    it("should create piece from serialized data", () => {
      const canvas = document.createElement("canvas");
      const path = new Path2D();
      const data = {
        id: "piece-2",
        gridX: 2,
        gridY: 3,
        rotation: 90,
        displayX: 500,
        displayY: 600,
        groupId: "group-abc",
        zIndex: 15,
        imgX: 200,
        imgY: 300,
        w: 150,
        h: 150,
        scale: 0.8,
        corners: {
          nw: new Point(0, 0),
          ne: new Point(150, 0),
          se: new Point(150, 150),
          sw: new Point(0, 150),
        },
        sPoints: {
          north: new Point(75, -15),
        },
      };

      const piece = Piece.deserialize(data, canvas, path);

      expect(piece).toBeInstanceOf(Piece);
      expect(piece.id).toBe("piece-2");
      expect(piece.gridPos).toEqual(new Point(2, 3));
      expect(piece.rotation).toBe(90);
      expect(piece._requestedGroupId).toBe("group-abc");
      expect(piece.zIndex).toBe(15);
      expect(piece.bitmap).toBe(canvas);
      expect(piece.path).toBe(path);
      expect(piece.scale).toBe(0.8);
      expect(piece.imgRect.width).toBe(150);
      expect(piece.imgRect.height).toBe(150);
    });

    it("should handle missing optional fields", () => {
      const canvas = document.createElement("canvas");
      const path = new Path2D();
      const minimalData = {
        id: "piece-3",
        gridX: 0,
        gridY: 0,
        imgX: 0,
        imgY: 0,
        w: 100,
        h: 100,
        corners: {
          nw: new Point(0, 0),
          ne: new Point(100, 0),
          se: new Point(100, 100),
          sw: new Point(0, 100),
        },
        sPoints: {},
      };

      const piece = Piece.deserialize(minimalData, canvas, path);

      expect(piece).toBeInstanceOf(Piece);
      expect(piece.rotation).toBe(0);
      expect(piece.scale).toBe(DEFAULT_PIECE_SCALE);
      expect(piece.zIndex).toBeNull();
    });
  });

  describe("toString", () => {
    it("should return debug string with piece info", () => {
      gameTableController.getPiecePosition.mockReturnValue(
        new Point(123.456, 789.012)
      );

      const piece = new Piece(
        createPieceData({
          id: "piece-debug",
          gridX: 5,
          gridY: 7,
          rotation: 45,
        })
      );
      piece._setGroupId("group-xyz");

      const str = piece.toString();

      expect(str).toContain("piece-debug");
      expect(str).toContain("5");
      expect(str).toContain("7");
      expect(str).toContain("123.5");
      expect(str).toContain("789.0");
      expect(str).toContain("45");
      expect(str).toContain("group-xyz");
    });

    it("should handle null groupId", async () => {
      const piece = new Piece(createPieceData());
      const str = piece.toString();

      expect(str).toContain("group:null");
    });
  });
});
