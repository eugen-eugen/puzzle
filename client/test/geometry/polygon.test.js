import { describe, it, expect } from "vitest";
import { boundingFrame } from "@/js/geometry/polygon.js";
import { Point } from "@/js/geometry/point.js";
import { Rectangle } from "@/js/geometry/rectangle.js";

describe("polygon", () => {
  describe("boundingFrame", () => {
    it("should calculate bounding frame for simple rectangle", () => {
      const points = [
        new Point(10, 20),
        new Point(50, 20),
        new Point(50, 60),
        new Point(10, 60),
      ];

      const frame = boundingFrame(points);

      expect(frame).toBeInstanceOf(Rectangle);
      expect(frame.topLeft.x).toBe(10);
      expect(frame.topLeft.y).toBe(20);
      expect(frame.bottomRight.x).toBe(50);
      expect(frame.bottomRight.y).toBe(60);
      expect(frame.width).toBe(40);
      expect(frame.height).toBe(40);
    });

    it("should handle points in random order", () => {
      const points = [
        new Point(30, 40),
        new Point(10, 20),
        new Point(50, 60),
        new Point(20, 30),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(10);
      expect(frame.topLeft.y).toBe(20);
      expect(frame.bottomRight.x).toBe(50);
      expect(frame.bottomRight.y).toBe(60);
    });

    it("should handle single point", () => {
      const points = [new Point(100, 200)];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(100);
      expect(frame.topLeft.y).toBe(200);
      expect(frame.bottomRight.x).toBe(100);
      expect(frame.bottomRight.y).toBe(200);
      expect(frame.width).toBe(0);
      expect(frame.height).toBe(0);
    });

    it("should handle negative coordinates", () => {
      const points = [
        new Point(-50, -30),
        new Point(-10, -5),
        new Point(-20, -40),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(-50);
      expect(frame.topLeft.y).toBe(-40);
      expect(frame.bottomRight.x).toBe(-10);
      expect(frame.bottomRight.y).toBe(-5);
    });

    it("should handle mixed positive and negative coordinates", () => {
      const points = [
        new Point(-10, -20),
        new Point(30, 40),
        new Point(-5, 15),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(-10);
      expect(frame.topLeft.y).toBe(-20);
      expect(frame.bottomRight.x).toBe(30);
      expect(frame.bottomRight.y).toBe(40);
    });

    it("should handle points with zero coordinates", () => {
      const points = [
        new Point(0, 0),
        new Point(100, 0),
        new Point(100, 100),
        new Point(0, 100),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(0);
      expect(frame.topLeft.y).toBe(0);
      expect(frame.bottomRight.x).toBe(100);
      expect(frame.bottomRight.y).toBe(100);
    });

    it("should return zero rectangle for empty array", () => {
      const frame = boundingFrame([]);

      expect(frame).toBeInstanceOf(Rectangle);
      expect(frame.topLeft.x).toBe(0);
      expect(frame.topLeft.y).toBe(0);
      expect(frame.bottomRight.x).toBe(0);
      expect(frame.bottomRight.y).toBe(0);
      expect(frame.width).toBe(0);
      expect(frame.height).toBe(0);
    });

    it("should return zero rectangle for null input", () => {
      const frame = boundingFrame(null);

      expect(frame).toBeInstanceOf(Rectangle);
      expect(frame.width).toBe(0);
      expect(frame.height).toBe(0);
    });

    it("should return zero rectangle for undefined input", () => {
      const frame = boundingFrame(undefined);

      expect(frame).toBeInstanceOf(Rectangle);
      expect(frame.width).toBe(0);
      expect(frame.height).toBe(0);
    });

    it("should skip null points in the array", () => {
      const points = [new Point(10, 20), null, new Point(50, 60), null];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(10);
      expect(frame.topLeft.y).toBe(20);
      expect(frame.bottomRight.x).toBe(50);
      expect(frame.bottomRight.y).toBe(60);
    });

    it("should skip points with undefined coordinates", () => {
      const points = [
        new Point(10, 20),
        { x: undefined, y: 30 },
        { x: 40, y: undefined },
        new Point(50, 60),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(10);
      expect(frame.topLeft.y).toBe(20);
      expect(frame.bottomRight.x).toBe(50);
      expect(frame.bottomRight.y).toBe(60);
    });

    it("should return zero rectangle when all points are invalid", () => {
      const points = [null, { x: undefined, y: undefined }, {}];

      const frame = boundingFrame(points);

      expect(frame).toBeInstanceOf(Rectangle);
      expect(frame.width).toBe(0);
      expect(frame.height).toBe(0);
    });

    it("should handle floating point coordinates", () => {
      const points = [
        new Point(10.5, 20.7),
        new Point(50.3, 60.9),
        new Point(15.2, 25.4),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBeCloseTo(10.5);
      expect(frame.topLeft.y).toBeCloseTo(20.7);
      expect(frame.bottomRight.x).toBeCloseTo(50.3);
      expect(frame.bottomRight.y).toBeCloseTo(60.9);
    });

    it("should handle very large coordinate values", () => {
      const points = [new Point(1000000, 2000000), new Point(5000000, 6000000)];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(1000000);
      expect(frame.topLeft.y).toBe(2000000);
      expect(frame.bottomRight.x).toBe(5000000);
      expect(frame.bottomRight.y).toBe(6000000);
    });

    it("should handle points forming a horizontal line", () => {
      const points = [new Point(10, 50), new Point(30, 50), new Point(60, 50)];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(10);
      expect(frame.topLeft.y).toBe(50);
      expect(frame.bottomRight.x).toBe(60);
      expect(frame.bottomRight.y).toBe(50);
      expect(frame.width).toBe(50);
      expect(frame.height).toBe(0);
    });

    it("should handle points forming a vertical line", () => {
      const points = [
        new Point(100, 10),
        new Point(100, 50),
        new Point(100, 90),
      ];

      const frame = boundingFrame(points);

      expect(frame.topLeft.x).toBe(100);
      expect(frame.topLeft.y).toBe(10);
      expect(frame.bottomRight.x).toBe(100);
      expect(frame.bottomRight.y).toBe(90);
      expect(frame.width).toBe(0);
      expect(frame.height).toBe(80);
    });
  });
});
