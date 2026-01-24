// rectangle.test.js - Unit tests for Rectangle class
import { describe, it, expect } from "vitest";
import { Rectangle } from "@/js/geometry/rectangle.js";
import { Point } from "@/js/geometry/point.js";

describe("Rectangle", () => {
  describe("constructor", () => {
    it("should create a rectangle with default values (0, 0, 0, 0)", () => {
      const r = new Rectangle();
      expect(r.position.x).toBe(0);
      expect(r.position.y).toBe(0);
      expect(r.width).toBe(0);
      expect(r.height).toBe(0);
    });

    it("should create a rectangle with specified Point and dimensions", () => {
      const pos = new Point(10, 20);
      const r = new Rectangle(pos, 100, 50);
      expect(r.position.x).toBe(10);
      expect(r.position.y).toBe(20);
      expect(r.width).toBe(100);
      expect(r.height).toBe(50);
    });

    it("should clone the position Point to avoid external mutations", () => {
      const pos = new Point(10, 20);
      const r = new Rectangle(pos, 100, 50);
      pos.x = 999;
      expect(r.position.x).toBe(10); // Should not be affected
    });

    it("should handle null position by creating default Point", () => {
      const r = new Rectangle(null, 100, 50);
      expect(r.position.x).toBe(0);
      expect(r.position.y).toBe(0);
      expect(r.width).toBe(100);
      expect(r.height).toBe(50);
    });

    it("should handle negative dimensions", () => {
      const r = new Rectangle(new Point(0, 0), -10, -20);
      expect(r.width).toBe(-10);
      expect(r.height).toBe(-20);
    });
  });

  describe("position getter", () => {
    it("should return the internal position Point", () => {
      const pos = new Point(5, 15);
      const r = new Rectangle(pos, 50, 30);
      expect(r.position.x).toBe(5);
      expect(r.position.y).toBe(15);
    });
  });

  describe("fromPoints factory", () => {
    it("should create rectangle from two corner points", () => {
      const topLeft = new Point(10, 20);
      const bottomRight = new Point(60, 80);
      const r = Rectangle.fromPoints(topLeft, bottomRight);

      expect(r.position.x).toBe(10);
      expect(r.position.y).toBe(20);
      expect(r.width).toBe(50);
      expect(r.height).toBe(60);
    });

    it("should handle negative dimensions when points are reversed", () => {
      const bottomRight = new Point(60, 80);
      const topLeft = new Point(10, 20);
      const r = Rectangle.fromPoints(bottomRight, topLeft);

      expect(r.position.x).toBe(60);
      expect(r.position.y).toBe(80);
      expect(r.width).toBe(-50);
      expect(r.height).toBe(-60);
    });

    it("should create zero-width rectangle when x coordinates are equal", () => {
      const p1 = new Point(10, 20);
      const p2 = new Point(10, 80);
      const r = Rectangle.fromPoints(p1, p2);

      expect(r.width).toBe(0);
      expect(r.height).toBe(60);
    });
  });

  describe("clone", () => {
    it("should create an independent copy", () => {
      const r1 = new Rectangle(new Point(10, 20), 100, 50);
      const r2 = r1.clone();

      expect(r2.position.x).toBe(10);
      expect(r2.position.y).toBe(20);
      expect(r2.width).toBe(100);
      expect(r2.height).toBe(50);
      expect(r2).not.toBe(r1);
    });

    it("should not affect original when clone is modified", () => {
      const r1 = new Rectangle(new Point(10, 20), 100, 50);
      const r2 = r1.clone();

      r2.position.x = 999;
      r2.width = 888;

      expect(r1.position.x).toBe(10);
      expect(r1.width).toBe(100);
    });
  });

  describe("topLeft property", () => {
    it("should return top-left corner as Point", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const topLeft = r.topLeft;

      expect(topLeft.x).toBe(10);
      expect(topLeft.y).toBe(20);
    });

    it("should return a clone, not the internal position", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const topLeft = r.topLeft;
      topLeft.x = 999;

      expect(r.position.x).toBe(10);
    });
  });

  describe("bottomRight property", () => {
    it("should calculate bottom-right corner correctly", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const bottomRight = r.bottomRight;

      expect(bottomRight.x).toBe(110);
      expect(bottomRight.y).toBe(70);
    });

    it("should handle negative dimensions", () => {
      const r = new Rectangle(new Point(50, 50), -30, -20);
      const bottomRight = r.bottomRight;

      expect(bottomRight.x).toBe(20);
      expect(bottomRight.y).toBe(30);
    });

    it("should return zero for zero-sized rectangle", () => {
      const r = new Rectangle(new Point(0, 0), 0, 0);
      const bottomRight = r.bottomRight;

      expect(bottomRight.x).toBe(0);
      expect(bottomRight.y).toBe(0);
    });
  });

  describe("center property", () => {
    it("should calculate center point correctly", () => {
      const r = new Rectangle(new Point(10, 20), 100, 60);
      const center = r.center;

      expect(center.x).toBe(60); // 10 + 100/2
      expect(center.y).toBe(50); // 20 + 60/2
    });

    it("should handle odd dimensions", () => {
      const r = new Rectangle(new Point(0, 0), 11, 9);
      const center = r.center;

      expect(center.x).toBe(5.5);
      expect(center.y).toBe(4.5);
    });

    it("should return position for zero-sized rectangle", () => {
      const r = new Rectangle(new Point(10, 20), 0, 0);
      const center = r.center;

      expect(center.x).toBe(10);
      expect(center.y).toBe(20);
    });
  });

  describe("centerOffset property", () => {
    it("should calculate center offset from origin", () => {
      const r = new Rectangle(new Point(100, 200), 80, 40);
      const offset = r.centerOffset;

      expect(offset.x).toBe(40); // 80/2
      expect(offset.y).toBe(20); // 40/2
    });

    it("should be independent of position", () => {
      const r1 = new Rectangle(new Point(0, 0), 100, 60);
      const r2 = new Rectangle(new Point(1000, 2000), 100, 60);

      expect(r1.centerOffset.x).toBe(r2.centerOffset.x);
      expect(r1.centerOffset.y).toBe(r2.centerOffset.y);
    });
  });

  describe("isEmpty", () => {
    it("should return true for zero width", () => {
      const r = new Rectangle(new Point(10, 20), 0, 50);
      expect(r.isEmpty()).toBe(true);
    });

    it("should return true for zero height", () => {
      const r = new Rectangle(new Point(10, 20), 100, 0);
      expect(r.isEmpty()).toBe(true);
    });

    it("should return true for both zero dimensions", () => {
      const r = new Rectangle(new Point(10, 20), 0, 0);
      expect(r.isEmpty()).toBe(true);
    });

    it("should return true for negative width", () => {
      const r = new Rectangle(new Point(10, 20), -10, 50);
      expect(r.isEmpty()).toBe(true);
    });

    it("should return true for negative height", () => {
      const r = new Rectangle(new Point(10, 20), 100, -5);
      expect(r.isEmpty()).toBe(true);
    });

    it("should return false for positive dimensions", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      expect(r.isEmpty()).toBe(false);
    });
  });

  describe("plus (union)", () => {
    it("should return union of two rectangles", () => {
      const r1 = new Rectangle(new Point(0, 0), 50, 50);
      const r2 = new Rectangle(new Point(30, 30), 50, 50);
      const union = r1.plus(r2);

      expect(union.position.x).toBe(0);
      expect(union.position.y).toBe(0);
      expect(union.width).toBe(80); // From 0 to 80
      expect(union.height).toBe(80); // From 0 to 80
    });

    it("should return clone of non-empty rectangle when other is empty", () => {
      const r1 = new Rectangle(new Point(10, 20), 100, 50);
      const r2 = new Rectangle(new Point(0, 0), 0, 0);
      const union = r1.plus(r2);

      expect(union.position.x).toBe(10);
      expect(union.position.y).toBe(20);
      expect(union.width).toBe(100);
      expect(union.height).toBe(50);
    });

    it("should return clone of other when this is empty", () => {
      const r1 = new Rectangle(new Point(0, 0), 0, 0);
      const r2 = new Rectangle(new Point(10, 20), 100, 50);
      const union = r1.plus(r2);

      expect(union.position.x).toBe(10);
      expect(union.position.y).toBe(20);
      expect(union.width).toBe(100);
      expect(union.height).toBe(50);
    });

    it("should handle non-overlapping rectangles", () => {
      const r1 = new Rectangle(new Point(0, 0), 10, 10);
      const r2 = new Rectangle(new Point(100, 100), 10, 10);
      const union = r1.plus(r2);

      expect(union.position.x).toBe(0);
      expect(union.position.y).toBe(0);
      expect(union.width).toBe(110);
      expect(union.height).toBe(110);
    });

    it("should handle contained rectangle", () => {
      const r1 = new Rectangle(new Point(0, 0), 100, 100);
      const r2 = new Rectangle(new Point(25, 25), 50, 50);
      const union = r1.plus(r2);

      expect(union.position.x).toBe(0);
      expect(union.position.y).toBe(0);
      expect(union.width).toBe(100);
      expect(union.height).toBe(100);
    });
  });

  describe("scaled", () => {
    it("should scale rectangle by factor", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const scaled = r.scaled(2);

      expect(scaled.position.x).toBe(20);
      expect(scaled.position.y).toBe(40);
      expect(scaled.width).toBe(200);
      expect(scaled.height).toBe(100);
    });

    it("should handle scaling by 0.5", () => {
      const r = new Rectangle(new Point(40, 60), 100, 80);
      const scaled = r.scaled(0.5);

      expect(scaled.position.x).toBe(20);
      expect(scaled.position.y).toBe(30);
      expect(scaled.width).toBe(50);
      expect(scaled.height).toBe(40);
    });

    it("should handle scaling by 1 (no change)", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const scaled = r.scaled(1);

      expect(scaled.position.x).toBe(10);
      expect(scaled.position.y).toBe(20);
      expect(scaled.width).toBe(100);
      expect(scaled.height).toBe(50);
    });

    it("should handle negative scale factor", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const scaled = r.scaled(-2);

      expect(scaled.position.x).toBe(-20);
      expect(scaled.position.y).toBe(-40);
      expect(scaled.width).toBe(-200);
      expect(scaled.height).toBe(-100);
    });

    it("should create new instance (not mutate)", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      const scaled = r.scaled(2);

      expect(r.position.x).toBe(10);
      expect(r.width).toBe(100);
      expect(scaled).not.toBe(r);
    });
  });

  describe("toString", () => {
    it("should format rectangle as string", () => {
      const r = new Rectangle(new Point(10, 20), 100, 50);
      expect(r.toString()).toBe("Rectangle(10, 20, 100, 50)");
    });

    it("should handle negative values", () => {
      const r = new Rectangle(new Point(-10, -20), 100, 50);
      expect(r.toString()).toBe("Rectangle(-10, -20, 100, 50)");
    });

    it("should handle floating point values", () => {
      const r = new Rectangle(new Point(10.5, 20.7), 100.3, 50.9);
      expect(r.toString()).toBe("Rectangle(10.5, 20.7, 100.3, 50.9)");
    });
  });

  describe("edge cases", () => {
    it("should handle very large dimensions", () => {
      const r = new Rectangle(
        new Point(
          Number.MAX_SAFE_INTEGER - 1000,
          Number.MAX_SAFE_INTEGER - 1000
        ),
        1000,
        1000
      );
      expect(r.width).toBe(1000);
      expect(r.height).toBe(1000);
    });

    it("should handle fractional dimensions", () => {
      const r = new Rectangle(new Point(0.1, 0.2), 10.5, 20.7);
      expect(r.position.x).toBeCloseTo(0.1);
      expect(r.position.y).toBeCloseTo(0.2);
      expect(r.width).toBeCloseTo(10.5);
      expect(r.height).toBeCloseTo(20.7);
    });
  });
});
