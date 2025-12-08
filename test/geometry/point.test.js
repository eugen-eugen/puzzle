// point.test.js - Unit tests for Point class
import { describe, it, expect, beforeEach } from "vitest";
import { Point, dist2 } from "@/js/geometry/point.js";

describe("Point", () => {
  describe("constructor", () => {
    it("should create a point with default coordinates (0, 0)", () => {
      const p = new Point();
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    });

    it("should create a point with specified coordinates", () => {
      const p = new Point(3, 4);
      expect(p.x).toBe(3);
      expect(p.y).toBe(4);
    });

    it("should handle negative coordinates", () => {
      const p = new Point(-5, -10);
      expect(p.x).toBe(-5);
      expect(p.y).toBe(-10);
    });

    it("should handle floating point coordinates", () => {
      const p = new Point(3.14, 2.71);
      expect(p.x).toBeCloseTo(3.14);
      expect(p.y).toBeCloseTo(2.71);
    });
  });

  describe("getters and setters", () => {
    it("should allow setting x coordinate", () => {
      const p = new Point(1, 2);
      p.x = 10;
      expect(p.x).toBe(10);
      expect(p.y).toBe(2);
    });

    it("should allow setting y coordinate", () => {
      const p = new Point(1, 2);
      p.y = 20;
      expect(p.x).toBe(1);
      expect(p.y).toBe(20);
    });
  });

  describe("clone", () => {
    it("should create an independent copy", () => {
      const p1 = new Point(5, 10);
      const p2 = p1.clone();
      
      expect(p2.x).toBe(5);
      expect(p2.y).toBe(10);
      expect(p2).not.toBe(p1);
    });

    it("should not affect original when clone is modified", () => {
      const p1 = new Point(5, 10);
      const p2 = p1.clone();
      
      p2.x = 100;
      p2.y = 200;
      
      expect(p1.x).toBe(5);
      expect(p1.y).toBe(10);
    });
  });

  describe("add", () => {
    it("should add two points and return new point", () => {
      const p1 = new Point(3, 4);
      const p2 = new Point(1, 2);
      const result = p1.add(p2);
      
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
      expect(result).not.toBe(p1);
      expect(result).not.toBe(p2);
    });

    it("should not modify original points", () => {
      const p1 = new Point(3, 4);
      const p2 = new Point(1, 2);
      p1.add(p2);
      
      expect(p1.x).toBe(3);
      expect(p1.y).toBe(4);
      expect(p2.x).toBe(1);
      expect(p2.y).toBe(2);
    });

    it("should handle negative values", () => {
      const p1 = new Point(5, 10);
      const p2 = new Point(-3, -7);
      const result = p1.add(p2);
      
      expect(result.x).toBe(2);
      expect(result.y).toBe(3);
    });

    it("should handle zero point", () => {
      const p1 = new Point(5, 10);
      const p2 = new Point(0, 0);
      const result = p1.add(p2);
      
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
    });
  });

  describe("sub", () => {
    it("should subtract two points and return new point", () => {
      const p1 = new Point(5, 8);
      const p2 = new Point(2, 3);
      const result = p1.sub(p2);
      
      expect(result.x).toBe(3);
      expect(result.y).toBe(5);
      expect(result).not.toBe(p1);
      expect(result).not.toBe(p2);
    });

    it("should not modify original points", () => {
      const p1 = new Point(5, 8);
      const p2 = new Point(2, 3);
      p1.sub(p2);
      
      expect(p1.x).toBe(5);
      expect(p1.y).toBe(8);
      expect(p2.x).toBe(2);
      expect(p2.y).toBe(3);
    });

    it("should handle negative results", () => {
      const p1 = new Point(2, 3);
      const p2 = new Point(5, 8);
      const result = p1.sub(p2);
      
      expect(result.x).toBe(-3);
      expect(result.y).toBe(-5);
    });

    it("should handle zero point", () => {
      const p1 = new Point(5, 10);
      const p2 = new Point(0, 0);
      const result = p1.sub(p2);
      
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
    });
  });

  describe("scaled", () => {
    it("should scale point by factor", () => {
      const p = new Point(3, 4);
      const result = p.scaled(2);
      
      expect(result.x).toBe(6);
      expect(result.y).toBe(8);
      expect(result).not.toBe(p);
    });

    it("should not modify original point", () => {
      const p = new Point(3, 4);
      p.scaled(2);
      
      expect(p.x).toBe(3);
      expect(p.y).toBe(4);
    });

    it("should handle fractional scaling", () => {
      const p = new Point(10, 20);
      const result = p.scaled(0.5);
      
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
    });

    it("should handle negative scaling", () => {
      const p = new Point(3, 4);
      const result = p.scaled(-1);
      
      expect(result.x).toBe(-3);
      expect(result.y).toBe(-4);
    });

    it("should handle zero scaling", () => {
      const p = new Point(3, 4);
      const result = p.scaled(0);
      
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });
  });

  describe("rotatedAroundDeg", () => {
    it("should rotate point 90 degrees around origin", () => {
      const p = new Point(1, 0);
      const pivot = new Point(0, 0);
      const result = p.rotatedAroundDeg(pivot, 90);
      
      expect(result.x).toBeCloseTo(0, 10);
      expect(result.y).toBeCloseTo(1, 10);
    });

    it("should rotate point 180 degrees around origin", () => {
      const p = new Point(1, 0);
      const pivot = new Point(0, 0);
      const result = p.rotatedAroundDeg(pivot, 180);
      
      expect(result.x).toBeCloseTo(-1, 10);
      expect(result.y).toBeCloseTo(0, 10);
    });

    it("should rotate point 360 degrees (full circle)", () => {
      const p = new Point(3, 4);
      const pivot = new Point(0, 0);
      const result = p.rotatedAroundDeg(pivot, 360);
      
      expect(result.x).toBeCloseTo(3, 10);
      expect(result.y).toBeCloseTo(4, 10);
    });

    it("should rotate around non-origin pivot", () => {
      const p = new Point(2, 0);
      const pivot = new Point(1, 0);
      const result = p.rotatedAroundDeg(pivot, 90);
      
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(1, 5);
    });

    it("should not modify original point", () => {
      const p = new Point(1, 0);
      const pivot = new Point(0, 0);
      p.rotatedAroundDeg(pivot, 90);
      
      expect(p.x).toBe(1);
      expect(p.y).toBe(0);
    });

    it("should handle negative angles", () => {
      const p = new Point(1, 0);
      const pivot = new Point(0, 0);
      const result = p.rotatedAroundDeg(pivot, -90);
      
      expect(result.x).toBeCloseTo(0, 10);
      expect(result.y).toBeCloseTo(-1, 10);
    });

    it("should rotate point around itself (no change)", () => {
      const p = new Point(5, 5);
      const result = p.rotatedAroundDeg(p, 90);
      
      expect(result.x).toBeCloseTo(5, 5);
      expect(result.y).toBeCloseTo(5, 5);
    });
  });

  describe("mutAdd", () => {
    it("should add to point in place", () => {
      const p1 = new Point(3, 4);
      const p2 = new Point(1, 2);
      const result = p1.mutAdd(p2);
      
      expect(p1.x).toBe(4);
      expect(p1.y).toBe(6);
      expect(result).toBe(p1); // Returns this for chaining
    });

    it("should return this for method chaining", () => {
      const p1 = new Point(1, 2);
      const p2 = new Point(3, 4);
      const p3 = new Point(5, 6);
      
      const result = p1.mutAdd(p2).mutAdd(p3);
      
      expect(p1.x).toBe(9);
      expect(p1.y).toBe(12);
      expect(result).toBe(p1);
    });

    it("should handle negative values", () => {
      const p1 = new Point(5, 10);
      const p2 = new Point(-3, -7);
      p1.mutAdd(p2);
      
      expect(p1.x).toBe(2);
      expect(p1.y).toBe(3);
    });
  });

  describe("distance2", () => {
    it("should calculate squared distance between two points", () => {
      const p1 = new Point(0, 0);
      const p2 = new Point(3, 4);
      const result = p1.distance2(p2);
      
      expect(result).toBe(25); // 3^2 + 4^2 = 9 + 16 = 25
    });

    it("should return 0 for same point", () => {
      const p1 = new Point(5, 10);
      const p2 = new Point(5, 10);
      const result = p1.distance2(p2);
      
      expect(result).toBe(0);
    });

    it("should handle negative coordinates", () => {
      const p1 = new Point(-1, -1);
      const p2 = new Point(2, 3);
      const result = p1.distance2(p2);
      
      expect(result).toBe(25); // (2-(-1))^2 + (3-(-1))^2 = 9 + 16 = 25
    });

    it("should be symmetric", () => {
      const p1 = new Point(1, 2);
      const p2 = new Point(4, 6);
      
      expect(p1.distance2(p2)).toBe(p2.distance2(p1));
    });
  });

  describe("toString", () => {
    it("should return string representation", () => {
      const p = new Point(3, 4);
      expect(p.toString()).toBe("Point(3, 4)");
    });

    it("should handle negative coordinates", () => {
      const p = new Point(-5, -10);
      expect(p.toString()).toBe("Point(-5, -10)");
    });

    it("should handle floating point coordinates", () => {
      const p = new Point(3.14, 2.71);
      expect(p.toString()).toBe("Point(3.14, 2.71)");
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation", () => {
      const p = new Point(3, 4);
      const json = p.toJSON();
      
      expect(json).toEqual({ x: 3, y: 4 });
    });

    it("should be serializable", () => {
      const p = new Point(3, 4);
      const serialized = JSON.stringify(p);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.x).toBe(3);
      expect(deserialized.y).toBe(4);
    });
  });

  describe("static min", () => {
    it("should return point with minimum coordinates", () => {
      const p1 = new Point(5, 2);
      const p2 = new Point(3, 8);
      const result = Point.min(p1, p2);
      
      expect(result.x).toBe(3);
      expect(result.y).toBe(2);
    });

    it("should handle negative coordinates", () => {
      const p1 = new Point(-5, 10);
      const p2 = new Point(3, -8);
      const result = Point.min(p1, p2);
      
      expect(result.x).toBe(-5);
      expect(result.y).toBe(-8);
    });

    it("should not modify original points", () => {
      const p1 = new Point(5, 2);
      const p2 = new Point(3, 8);
      Point.min(p1, p2);
      
      expect(p1.x).toBe(5);
      expect(p1.y).toBe(2);
      expect(p2.x).toBe(3);
      expect(p2.y).toBe(8);
    });
  });

  describe("static max", () => {
    it("should return point with maximum coordinates", () => {
      const p1 = new Point(5, 2);
      const p2 = new Point(3, 8);
      const result = Point.max(p1, p2);
      
      expect(result.x).toBe(5);
      expect(result.y).toBe(8);
    });

    it("should handle negative coordinates", () => {
      const p1 = new Point(-5, 10);
      const p2 = new Point(3, -8);
      const result = Point.max(p1, p2);
      
      expect(result.x).toBe(3);
      expect(result.y).toBe(10);
    });

    it("should not modify original points", () => {
      const p1 = new Point(5, 2);
      const p2 = new Point(3, 8);
      Point.max(p1, p2);
      
      expect(p1.x).toBe(5);
      expect(p1.y).toBe(2);
      expect(p2.x).toBe(3);
      expect(p2.y).toBe(8);
    });
  });

  describe("legacy helper: dist2", () => {
    it("should calculate squared distance using helper function", () => {
      const p1 = new Point(0, 0);
      const p2 = new Point(3, 4);
      const result = dist2(p1, p2);
      
      expect(result).toBe(25);
    });

    it("should match instance method result", () => {
      const p1 = new Point(1, 2);
      const p2 = new Point(4, 6);
      
      expect(dist2(p1, p2)).toBe(p1.distance2(p2));
    });
  });

  describe("immutability of immutable methods", () => {
    it("should not modify original point when using add", () => {
      const original = new Point(1, 2);
      const originalX = original.x;
      const originalY = original.y;
      
      original.add(new Point(3, 4));
      
      expect(original.x).toBe(originalX);
      expect(original.y).toBe(originalY);
    });

    it("should not modify original point when using sub", () => {
      const original = new Point(5, 6);
      const originalX = original.x;
      const originalY = original.y;
      
      original.sub(new Point(1, 2));
      
      expect(original.x).toBe(originalX);
      expect(original.y).toBe(originalY);
    });

    it("should not modify original point when using scaled", () => {
      const original = new Point(3, 4);
      const originalX = original.x;
      const originalY = original.y;
      
      original.scaled(2);
      
      expect(original.x).toBe(originalX);
      expect(original.y).toBe(originalY);
    });

    it("should not modify original point when using rotatedAroundDeg", () => {
      const original = new Point(1, 0);
      const originalX = original.x;
      const originalY = original.y;
      
      original.rotatedAroundDeg(new Point(0, 0), 90);
      
      expect(original.x).toBe(originalX);
      expect(original.y).toBe(originalY);
    });
  });

  describe("method chaining", () => {
    it("should allow chaining of mutAdd operations", () => {
      const p = new Point(1, 1);
      const result = p
        .mutAdd(new Point(1, 0))
        .mutAdd(new Point(0, 1))
        .mutAdd(new Point(2, 2));
      
      expect(p.x).toBe(4);
      expect(p.y).toBe(4);
      expect(result).toBe(p);
    });

    it("should allow chaining of immutable operations", () => {
      const p = new Point(10, 10);
      const result = p
        .add(new Point(5, 5))
        .sub(new Point(3, 3))
        .scaled(2);
      
      expect(result.x).toBe(24);
      expect(result.y).toBe(24);
      expect(p.x).toBe(10); // Original unchanged
      expect(p.y).toBe(10);
    });
  });

  describe("edge cases", () => {
    it("should handle very large numbers", () => {
      const p1 = new Point(1e10, 1e10);
      const p2 = new Point(1e10, 1e10);
      const result = p1.add(p2);
      
      expect(result.x).toBe(2e10);
      expect(result.y).toBe(2e10);
    });

    it("should handle very small numbers", () => {
      const p1 = new Point(1e-10, 1e-10);
      const p2 = new Point(1e-10, 1e-10);
      const result = p1.add(p2);
      
      expect(result.x).toBeCloseTo(2e-10);
      expect(result.y).toBeCloseTo(2e-10);
    });

    it("should handle mixed large and small numbers", () => {
      const p1 = new Point(1e10, 1e-10);
      const p2 = new Point(1e-10, 1e10);
      const result = p1.add(p2);
      
      expect(result.x).toBeCloseTo(1e10);
      expect(result.y).toBeCloseTo(1e10);
    });
  });
});
