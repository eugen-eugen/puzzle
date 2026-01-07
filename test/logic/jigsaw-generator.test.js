import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateJigsawPieces } from "@/js/logic/jigsaw-generator.js";
import { Point } from "@/js/geometry/point.js";

// Mock dependencies
vi.mock("@/js/model/piece.js", () => ({
  Piece: class MockPiece {
    constructor(data) {
      this.id = data.id;
      this.gridX = data.gridX;
      this.gridY = data.gridY;

      // Mock corners
      this.corners = {
        nw: { x: 0, y: 0 },
        ne: { x: 100, y: 0 },
        se: { x: 100, y: 100 },
        sw: { x: 0, y: 100 },
      };

      // Mock sPoints
      this.sPoints = {
        north: null,
        east: null,
        south: null,
        west: null,
      };

      // Mock bitmap (canvas element)
      this.bitmap = document.createElement("canvas");

      // Mock paths
      this.paths = {
        north: new Path2D(),
        east: new Path2D(),
        south: new Path2D(),
        west: new Path2D(),
      };
    }
  },
}));

vi.mock("@/js/geometry/lattice.js", () => ({
  Lattice: class MockLattice {
    constructor(rows, cols, width, height, minDepth, maxDepth) {
      this.rows = rows;
      this.cols = cols;
      this.width = width;
      this.height = height;
      this.minDepth = minDepth;
      this.maxDepth = maxDepth;
    }
    getCorners() {
      const corners = [];
      for (let r = 0; r <= this.rows; r++) {
        corners[r] = [];
        for (let c = 0; c <= this.cols; c++) {
          corners[r][c] = { x: c * 100, y: r * 100 };
        }
      }
      return corners;
    }
    getHSides() {
      const hSides = [];
      for (let r = 0; r < this.rows - 1; r++) {
        hSides[r] = [];
        for (let c = 0; c < this.cols; c++) {
          const point = new Point(c * 100 + 50, r * 100 + 100);
          hSides[r][c] = { points: [point, point.clone(), point.clone()] };
        }
      }
      return hSides;
    }
    getVSides() {
      const vSides = [];
      for (let r = 0; r < this.rows; r++) {
        vSides[r] = [];
        for (let c = 0; c < this.cols - 1; c++) {
          const point = new Point(c * 100 + 100, r * 100 + 50);
          vSides[r][c] = { points: [point, point.clone(), point.clone()] };
        }
      }
      return vSides;
    }
  },
}));

vi.mock("@/js/geometry/polygon.js", () => ({
  boundingFrame: () => ({
    width: 100,
    height: 100,
    topLeft: { x: 0, y: 0 },
    bottomRight: { x: 100, y: 100 },
  }),
}));

describe("jigsaw-generator", () => {
  let dispatchEventSpy;
  let mockImage;

  beforeEach(() => {
    // Spy on window.dispatchEvent
    dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    // Create mock image
    mockImage = {
      width: 800,
      height: 600,
    };

    // Mock canvas for bitmap generation
    const mockCanvas = document.createElement("canvas");
    const mockContext = {
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      clip: vi.fn(),
      stroke: vi.fn(),
    };
    mockCanvas.getContext = vi.fn(() => mockContext);
    vi.spyOn(document, "createElement").mockReturnValue(mockCanvas);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("calculateSizes (via generateJigsawPieces)", () => {
    it("should calculate grid for square aspect ratio", () => {
      const squareImage = { width: 400, height: 400 };
      const result = generateJigsawPieces(squareImage, 16);

      // For 16 pieces with 1:1 aspect ratio, should be 4x4
      expect(result.rows).toBe(4);
      expect(result.cols).toBe(4);
      expect(result.actualCount).toBe(16);
    });

    it("should calculate grid for wide aspect ratio (landscape)", () => {
      const landscapeImage = { width: 800, height: 400 };
      const result = generateJigsawPieces(landscapeImage, 20);

      // For landscape (2:1), should have more columns than rows
      expect(result.cols).toBeGreaterThan(result.rows);
      expect(result.actualCount).toBeGreaterThanOrEqual(20);
    });

    it("should calculate grid for tall aspect ratio (portrait)", () => {
      const portraitImage = { width: 400, height: 800 };
      const result = generateJigsawPieces(portraitImage, 20);

      // For portrait (1:2), should have more rows than columns
      expect(result.rows).toBeGreaterThan(result.cols);
      expect(result.actualCount).toBeGreaterThanOrEqual(20);
    });

    it("should enforce minimum grid dimension of 2x2", () => {
      const result = generateJigsawPieces(mockImage, 1);

      // Even for targetCount=1, should be at least 2x2
      expect(result.rows).toBeGreaterThanOrEqual(2);
      expect(result.cols).toBeGreaterThanOrEqual(2);
      expect(result.actualCount).toBeGreaterThanOrEqual(4);
    });

    it("should adjust cols to meet or exceed target count", () => {
      const result = generateJigsawPieces(mockImage, 25);

      // actualCount should be >= targetCount
      expect(result.actualCount).toBeGreaterThanOrEqual(25);
      // actualCount should equal rows * cols
      expect(result.actualCount).toBe(result.rows * result.cols);
    });

    it("should dispatch PIECES_GENERATED event with correct count", () => {
      generateJigsawPieces(mockImage, 20);

      expect(dispatchEventSpy).toHaveBeenCalled();

      const eventCall = dispatchEventSpy.mock.calls[0][0];
      expect(eventCall).toBeInstanceOf(CustomEvent);
      expect(eventCall.type).toBe("piecesGenerated");
      expect(eventCall.detail).toBeDefined();
      expect(eventCall.detail.totalPieces).toBeGreaterThanOrEqual(20);
    });

    it("should generate correct number of pieces", () => {
      const result = generateJigsawPieces(mockImage, 12);

      expect(result.pieces).toHaveLength(result.actualCount);
      expect(result.pieces).toHaveLength(result.rows * result.cols);
    });

    it("should handle large target counts", () => {
      const result = generateJigsawPieces(mockImage, 100);

      expect(result.actualCount).toBeGreaterThanOrEqual(100);
      expect(result.pieces).toHaveLength(result.actualCount);
    });

    it("should maintain aspect ratio in grid calculation", () => {
      // 4:3 aspect ratio
      const aspectImage = { width: 1200, height: 900 };
      const result = generateJigsawPieces(aspectImage, 24);

      // For 4:3, cols should be roughly 4/3 of rows
      const expectedRatio = 1200 / 900; // 1.333...
      const actualRatio = result.cols / result.rows;

      // Allow some tolerance since we're rounding to integers
      expect(actualRatio).toBeGreaterThan(1.0);
      expect(actualRatio).toBeLessThan(1.8);
    });

    it("should assign unique IDs to all pieces", () => {
      const result = generateJigsawPieces(mockImage, 12);

      const ids = result.pieces.map((p) => p.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(result.pieces.length);
    });

    it("should assign correct grid positions", () => {
      const result = generateJigsawPieces(mockImage, 6);

      // Check that all grid positions are within bounds
      result.pieces.forEach((piece) => {
        expect(piece.gridX).toBeGreaterThanOrEqual(0);
        expect(piece.gridX).toBeLessThan(result.cols);
        expect(piece.gridY).toBeGreaterThanOrEqual(0);
        expect(piece.gridY).toBeLessThan(result.rows);
      });

      // Check that each grid position is unique
      const positions = result.pieces.map((p) => `${p.gridX},${p.gridY}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(result.pieces.length);
    });
  });

  describe("generateJigsawPieces", () => {
    it("should generate pieces with corners, sidePoints, bitmap and path", () => {
      const result = generateJigsawPieces(mockImage, 12);

      // Verify all pieces were created
      expect(result.pieces.length).toBeGreaterThan(0);

      // Check each piece has all required properties
      result.pieces.forEach((piece) => {
        // Corners should be defined and have all four corners
        expect(piece.corners).toBeDefined();
        expect(piece.corners.nw).toBeDefined();
        expect(piece.corners.ne).toBeDefined();
        expect(piece.corners.se).toBeDefined();
        expect(piece.corners.sw).toBeDefined();

        // Side points should be defined
        expect(piece.sPoints).toBeDefined();

        // Bitmap should be defined and be an HTMLCanvasElement
        expect(piece.bitmap).toBeDefined();
        expect(piece.bitmap).toBeInstanceOf(HTMLCanvasElement);

        // Paths should be defined with all 4 directions
        expect(piece.paths).toBeDefined();
        expect(piece.paths.north).toBeInstanceOf(Path2D);
        expect(piece.paths.east).toBeInstanceOf(Path2D);
        expect(piece.paths.south).toBeInstanceOf(Path2D);
        expect(piece.paths.west).toBeInstanceOf(Path2D);
      });
    });
  });
});
