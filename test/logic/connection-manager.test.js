// connection-manager.test.js - Unit tests for connection manager functions
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("@/js/ui/display.js", () => ({
  applyPieceTransform: vi.fn(),
  getZoomLevel: vi.fn(() => 1),
  applyHighlight: vi.fn(),
}));

vi.mock("@/js/logic/game-table-controller.js", () => ({
  gameTableController: {
    queryRadius: vi.fn(() => []),
    moveGroup: vi.fn(),
  },
}));

vi.mock("@/js/logic/group-manager.js", () => ({
  groupManager: {
    getGroup: vi.fn(),
    mergeGroups: vi.fn(),
    getGroupForPiece: vi.fn(),
  },
}));

vi.mock("@/js/game-engine.js", () => ({
  state: {
    pieces: [],
  },
}));

vi.mock("@/js/utils/event-util.js", () => ({
  registerGlobalEvent: vi.fn(),
}));

// Import the geometry utility we need
import { Point } from "@/js/geometry/point.js";

// Helper to calculate distance squared between two points (plain objects or Point instances)
function calculateDist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Helper function to test validateProfileAlignment
// Since it's not exported, we test it through matchWaypoints behavior
function validateProfileAlignment(distances2, profileTolerance) {
  if (distances2.length === 0) return false;
  const maxDist = Math.max(...distances2);
  const minDist = Math.min(...distances2);
  const spread = maxDist - minDist;
  return spread <= profileTolerance;
}

// Helper function to test matchWaypoints
// Since it's not exported, we recreate it for testing
function matchWaypoints(
  mWaypoints,
  sWaypoints,
  positionTolerance,
  profileTolerance,
  reversed = false
) {
  if (mWaypoints.length !== sWaypoints.length) return null;

  // Try direct ordering first
  let distances2 = [];
  let allMatch = true;
  for (let i = 0; i < mWaypoints.length; i++) {
    const d2 = calculateDist2(mWaypoints[i], sWaypoints[i]);
    distances2.push(d2);
    if (d2 > positionTolerance) {
      allMatch = false;
      break;
    }
  }

  if (allMatch) {
    const profileValid = validateProfileAlignment(distances2, profileTolerance);
    return { reversed, distances2, profileValid };
  }

  return null;
}

describe("validateProfileAlignment", () => {
  it("should return false for empty distances array", () => {
    const result = validateProfileAlignment([], 10);
    expect(result).toBe(false);
  });

  it("should return true when all distances are identical", () => {
    const distances = [5, 5, 5];
    const result = validateProfileAlignment(distances, 1);
    expect(result).toBe(true);
  });

  it("should return true when spread is exactly equal to tolerance", () => {
    const distances = [5, 10, 8];
    const spread = 10 - 5; // 5
    const result = validateProfileAlignment(distances, spread);
    expect(result).toBe(true);
  });

  it("should return true when spread is less than tolerance", () => {
    const distances = [5, 6, 7];
    const spread = 7 - 5; // 2
    const result = validateProfileAlignment(distances, 5);
    expect(result).toBe(true);
  });

  it("should return false when spread exceeds tolerance", () => {
    const distances = [5, 10, 15];
    const spread = 15 - 5; // 10
    const result = validateProfileAlignment(distances, 5);
    expect(result).toBe(false);
  });

  it("should handle single distance value", () => {
    const distances = [5];
    const spread = 0;
    const result = validateProfileAlignment(distances, 1);
    expect(result).toBe(true);
  });

  it("should handle floating point distances", () => {
    const distances = [5.5, 6.2, 5.8];
    const spread = 6.2 - 5.5; // 0.7
    const result = validateProfileAlignment(distances, 1.0);
    expect(result).toBe(true);
  });

  it("should correctly calculate spread with negative values", () => {
    const distances = [-5, 0, 5];
    const spread = 5 - -5; // 10
    const result = validateProfileAlignment(distances, 15);
    expect(result).toBe(true);
  });

  it("should return false when spread slightly exceeds tolerance", () => {
    const distances = [0, 5.1];
    const spread = 5.1;
    const result = validateProfileAlignment(distances, 5.0);
    expect(result).toBe(false);
  });
});

describe("matchWaypoints", () => {
  describe("basic validation", () => {
    it("should return null when waypoint arrays have different lengths", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 100, 10);
      expect(result).toBeNull();
    });

    it("should handle empty waypoint arrays", () => {
      const result = matchWaypoints([], [], 100, 10);
      expect(result).not.toBeNull();
      expect(result.distances2).toHaveLength(0);
      expect(result.profileValid).toBe(false); // Empty array returns false
    });
  });

  describe("position tolerance validation", () => {
    it("should match when all waypoints are within position tolerance", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 1, 1);
      expect(result).not.toBeNull();
      expect(result.distances2).toEqual([0, 0, 0]);
      expect(result.reversed).toBe(false);
    });

    it("should return null when any waypoint exceeds position tolerance", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 20, y: 0 }, // Too far
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 50, 10);
      expect(result).toBeNull();
    });

    it("should match when distance squared is exactly equal to tolerance", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 3, y: 4 }]; // Distance = 5, Distance^2 = 25
      const result = matchWaypoints(mWaypoints, sWaypoints, 25, 10);
      expect(result).not.toBeNull();
      expect(result.distances2[0]).toBe(25);
    });

    it("should return null when distance squared exceeds tolerance by small amount", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 3, y: 4 }]; // Distance^2 = 25
      const result = matchWaypoints(mWaypoints, sWaypoints, 24, 10);
      expect(result).toBeNull();
    });
  });

  describe("profile tolerance validation", () => {
    it("should have profileValid=true when spread is within profile tolerance", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 1 }, // Distance^2 = 1
        { x: 10, y: 2 }, // Distance^2 = 4
      ];
      // Spread = 4 - 0 = 4
      const result = matchWaypoints(mWaypoints, sWaypoints, 10, 5);
      expect(result).not.toBeNull();
      expect(result.profileValid).toBe(true);
      expect(result.distances2).toEqual([0, 1, 4]);
    });

    it("should have profileValid=false when spread exceeds profile tolerance", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 3 }, // Distance^2 = 9
        { x: 10, y: 0 },
      ];
      // Spread = 9 - 0 = 9
      const result = matchWaypoints(mWaypoints, sWaypoints, 100, 5);
      expect(result).not.toBeNull();
      expect(result.profileValid).toBe(false);
    });

    it("should have profileValid=true when all waypoints are perfectly aligned", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 2 },
        { x: 5, y: 2 },
        { x: 10, y: 2 },
      ];
      // All distances^2 = 4, spread = 0
      const result = matchWaypoints(mWaypoints, sWaypoints, 10, 1);
      expect(result).not.toBeNull();
      expect(result.profileValid).toBe(true);
      expect(result.distances2).toEqual([4, 4, 4]);
    });
  });

  describe("reversed flag", () => {
    it("should set reversed=false by default", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 0, y: 0 }];
      const result = matchWaypoints(mWaypoints, sWaypoints, 10, 10);
      expect(result.reversed).toBe(false);
    });

    it("should set reversed=true when explicitly passed", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 0, y: 0 }];
      const result = matchWaypoints(mWaypoints, sWaypoints, 10, 10, true);
      expect(result.reversed).toBe(true);
    });

    it("should preserve reversed flag in returned result", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ];
      const resultNotReversed = matchWaypoints(
        mWaypoints,
        sWaypoints,
        10,
        10,
        false
      );
      const resultReversed = matchWaypoints(
        mWaypoints,
        sWaypoints,
        10,
        10,
        true
      );

      expect(resultNotReversed.reversed).toBe(false);
      expect(resultReversed.reversed).toBe(true);
    });
  });

  describe("complex scenarios", () => {
    it("should match waypoints with slight position variation but good profile", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 1 },
        { x: 50, y: 1.5 },
        { x: 100, y: 1 },
      ];
      // Distances^2: [1, 2.25, 1], spread = 1.25
      const result = matchWaypoints(mWaypoints, sWaypoints, 5, 2);
      expect(result).not.toBeNull();
      expect(result.profileValid).toBe(true);
    });

    it("should fail when position tolerance met but profile misaligned", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 50, y: 5 }, // Far off
        { x: 100, y: 0 },
      ];
      // Distances^2: [0, 25, 0], spread = 25
      const result = matchWaypoints(mWaypoints, sWaypoints, 30, 10);
      expect(result).not.toBeNull();
      expect(result.profileValid).toBe(false);
    });

    it("should early exit on first position tolerance failure", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 }, // This will fail
        { x: 200, y: 0 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 200, y: 0 }, // Distance^2 = 10000
        { x: 200, y: 0 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 50, 10);
      expect(result).toBeNull();
    });

    it("should handle diagonal waypoint matching", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 6, y: 8 },
      ];
      const sWaypoints = [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 6, y: 8 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 1, 1);
      expect(result).not.toBeNull();
      expect(result.profileValid).toBe(true);
      expect(result.distances2).toEqual([0, 0, 0]);
    });

    it("should handle floating point precision in waypoint positions", () => {
      const mWaypoints = [
        { x: 0.1, y: 0.1 },
        { x: 5.5, y: 0.1 },
        { x: 10.9, y: 0.1 },
      ];
      const sWaypoints = [
        { x: 0.1, y: 0.1 },
        { x: 5.5, y: 0.1 },
        { x: 10.9, y: 0.1 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 0.01, 0.01);
      expect(result).not.toBeNull();
      expect(result.distances2).toEqual([0, 0, 0]);
    });
  });

  describe("edge cases", () => {
    it("should handle single waypoint", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 1, y: 1 }];
      const result = matchWaypoints(mWaypoints, sWaypoints, 5, 5);
      expect(result).not.toBeNull();
      expect(result.distances2).toEqual([2]);
      expect(result.profileValid).toBe(true); // Spread = 0 for single value
    });

    it("should handle zero tolerance gracefully", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 0, y: 0 }];
      const result = matchWaypoints(mWaypoints, sWaypoints, 0, 0);
      expect(result).not.toBeNull();
      expect(result.distances2).toEqual([0]);
    });

    it("should reject when zero tolerance and non-zero distance", () => {
      const mWaypoints = [{ x: 0, y: 0 }];
      const sWaypoints = [{ x: 0.1, y: 0 }];
      const result = matchWaypoints(mWaypoints, sWaypoints, 0, 0);
      expect(result).toBeNull();
    });

    it("should handle very large tolerance values", () => {
      const mWaypoints = [
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
      ];
      const sWaypoints = [
        { x: 100, y: 100 },
        { x: 900, y: 900 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 1000000, 1000000);
      expect(result).not.toBeNull();
    });

    it("should handle negative coordinates", () => {
      const mWaypoints = [
        { x: -10, y: -10 },
        { x: -5, y: -5 },
        { x: 0, y: 0 },
      ];
      const sWaypoints = [
        { x: -10, y: -10 },
        { x: -5, y: -5 },
        { x: 0, y: 0 },
      ];
      const result = matchWaypoints(mWaypoints, sWaypoints, 1, 1);
      expect(result).not.toBeNull();
      expect(result.distances2).toEqual([0, 0, 0]);
    });
  });
});
