// geometry-utils.test.js - Unit tests for geometry utility functions
import { describe, it, expect } from "vitest";
import {
  normalizePointsToOrigin,
  convertToPoints,
} from "@/js/geometry/geometry-utils.js";
import { Point } from "@/js/geometry/point.js";

describe("geometry-utils", () => {
  describe("normalizePointsToOrigin", () => {
    it("should normalize all Point fields relative to origin", () => {
      const corners = {
        c_ne: new Point(200, 50),
        c_se: new Point(200, 150),
        c_sw: new Point(100, 150),
      };
      const origin = new Point(100, 50);

      const result = normalizePointsToOrigin(corners, origin);

      expect(result.c_ne).toBeInstanceOf(Point);
      expect(result.c_ne.x).toBe(100);
      expect(result.c_ne.y).toBe(0);
      expect(result.c_se.x).toBe(100);
      expect(result.c_se.y).toBe(100);
      expect(result.c_sw.x).toBe(0);
      expect(result.c_sw.y).toBe(100);
    });

    it("should handle origin at (0, 0)", () => {
      const points = {
        p1: new Point(10, 20),
        p2: new Point(30, 40),
      };
      const origin = new Point(0, 0);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.p1.x).toBe(10);
      expect(result.p1.y).toBe(20);
      expect(result.p2.x).toBe(30);
      expect(result.p2.y).toBe(40);
    });

    it("should handle negative coordinates", () => {
      const points = {
        p1: new Point(-10, -20),
        p2: new Point(30, 40),
      };
      const origin = new Point(10, 10);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.p1.x).toBe(-20);
      expect(result.p1.y).toBe(-30);
      expect(result.p2.x).toBe(20);
      expect(result.p2.y).toBe(30);
    });

    it("should create new Point instances (not mutate originals)", () => {
      const original = new Point(100, 100);
      const points = { p1: original };
      const origin = new Point(50, 50);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.p1).not.toBe(original);
      expect(original.x).toBe(100);
      expect(original.y).toBe(100);
      expect(result.p1.x).toBe(50);
      expect(result.p1.y).toBe(50);
    });

    it("should preserve non-Point fields", () => {
      const mixed = {
        point: new Point(100, 100),
        string: "test",
        number: 42,
        boolean: true,
        nullValue: null,
      };
      const origin = new Point(50, 50);

      const result = normalizePointsToOrigin(mixed, origin);

      expect(result.point).toBeInstanceOf(Point);
      expect(result.point.x).toBe(50);
      expect(result.point.y).toBe(50);
      expect(result.string).toBe("test");
      expect(result.number).toBe(42);
      expect(result.boolean).toBe(true);
      expect(result.nullValue).toBe(null);
    });

    it("should handle empty object", () => {
      const empty = {};
      const origin = new Point(10, 20);

      const result = normalizePointsToOrigin(empty, origin);

      expect(result).toEqual({});
    });

    it("should handle object with only non-Point fields", () => {
      const obj = {
        name: "test",
        value: 123,
      };
      const origin = new Point(10, 20);

      const result = normalizePointsToOrigin(obj, origin);

      expect(result).toEqual({
        name: "test",
        value: 123,
      });
    });

    it("should handle floating point coordinates", () => {
      const points = {
        p1: new Point(100.5, 200.7),
        p2: new Point(150.3, 250.9),
      };
      const origin = new Point(100.1, 200.2);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.p1.x).toBeCloseTo(0.4, 10);
      expect(result.p1.y).toBeCloseTo(0.5, 10);
      expect(result.p2.x).toBeCloseTo(50.2, 10);
      expect(result.p2.y).toBeCloseTo(50.7, 10);
    });

    it("should handle multiple Point fields with same origin", () => {
      const points = {
        nw: new Point(100, 100),
        ne: new Point(200, 100),
        se: new Point(200, 200),
        sw: new Point(100, 200),
      };
      const origin = new Point(100, 100);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.nw.x).toBe(0);
      expect(result.nw.y).toBe(0);
      expect(result.ne.x).toBe(100);
      expect(result.ne.y).toBe(0);
      expect(result.se.x).toBe(100);
      expect(result.se.y).toBe(100);
      expect(result.sw.x).toBe(0);
      expect(result.sw.y).toBe(100);
    });

    it("should work with Point objects that have been modified", () => {
      const point = new Point(100, 100);
      point.x = 150;
      point.y = 200;

      const points = { p: point };
      const origin = new Point(50, 50);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.p.x).toBe(100);
      expect(result.p.y).toBe(150);
    });

    it("should handle origin with negative coordinates", () => {
      const points = {
        p1: new Point(0, 0),
        p2: new Point(100, 100),
      };
      const origin = new Point(-50, -50);

      const result = normalizePointsToOrigin(points, origin);

      expect(result.p1.x).toBe(50);
      expect(result.p1.y).toBe(50);
      expect(result.p2.x).toBe(150);
      expect(result.p2.y).toBe(150);
    });

    it("should create a new object (not mutate input)", () => {
      const input = {
        p1: new Point(100, 100),
      };
      const origin = new Point(50, 50);

      const result = normalizePointsToOrigin(input, origin);

      expect(result).not.toBe(input);
      expect(Object.keys(result)).toEqual(Object.keys(input));
    });
  });

  describe("convertToPoints", () => {
    it("should convert objects with x/y attributes to Point instances", () => {
      const raw = {
        north: { x: 10, y: 20 },
        south: { x: 30, y: 40 },
      };

      const result = convertToPoints(raw);

      expect(result.north).toBeInstanceOf(Point);
      expect(result.north.x).toBe(10);
      expect(result.north.y).toBe(20);
      expect(result.south).toBeInstanceOf(Point);
      expect(result.south.x).toBe(30);
      expect(result.south.y).toBe(40);
    });

    it("should preserve null values", () => {
      const raw = {
        north: { x: 10, y: 20 },
        east: null,
        south: { x: 30, y: 40 },
        west: null,
      };

      const result = convertToPoints(raw);

      expect(result.north).toBeInstanceOf(Point);
      expect(result.east).toBeNull();
      expect(result.south).toBeInstanceOf(Point);
      expect(result.west).toBeNull();
    });

    it("should handle all null values", () => {
      const raw = {
        north: null,
        east: null,
        south: null,
        west: null,
      };

      const result = convertToPoints(raw);

      expect(result.north).toBeNull();
      expect(result.east).toBeNull();
      expect(result.south).toBeNull();
      expect(result.west).toBeNull();
    });

    it("should handle empty object", () => {
      const raw = {};

      const result = convertToPoints(raw);

      expect(result).toEqual({});
    });

    it("should handle negative coordinates", () => {
      const raw = {
        p1: { x: -10, y: -20 },
        p2: { x: 30, y: -40 },
      };

      const result = convertToPoints(raw);

      expect(result.p1.x).toBe(-10);
      expect(result.p1.y).toBe(-20);
      expect(result.p2.x).toBe(30);
      expect(result.p2.y).toBe(-40);
    });

    it("should handle floating point coordinates", () => {
      const raw = {
        p1: { x: 10.5, y: 20.7 },
        p2: { x: 30.3, y: 40.9 },
      };

      const result = convertToPoints(raw);

      expect(result.p1.x).toBe(10.5);
      expect(result.p1.y).toBe(20.7);
      expect(result.p2.x).toBe(30.3);
      expect(result.p2.y).toBe(40.9);
    });

    it("should handle zero coordinates", () => {
      const raw = {
        origin: { x: 0, y: 0 },
      };

      const result = convertToPoints(raw);

      expect(result.origin).toBeInstanceOf(Point);
      expect(result.origin.x).toBe(0);
      expect(result.origin.y).toBe(0);
    });

    it("should preserve undefined values", () => {
      const raw = {
        p1: { x: 10, y: 20 },
        p2: undefined,
      };

      const result = convertToPoints(raw);

      expect(result.p1).toBeInstanceOf(Point);
      expect(result.p2).toBeUndefined();
    });

    it("should handle objects without x or y properties", () => {
      const raw = {
        valid: { x: 10, y: 20 },
        onlyX: { x: 10 },
        onlyY: { y: 20 },
        neither: { a: 10, b: 20 },
      };

      const result = convertToPoints(raw);

      expect(result.valid).toBeInstanceOf(Point);
      expect(result.onlyX).toEqual({ x: 10 });
      expect(result.onlyY).toEqual({ y: 20 });
      expect(result.neither).toEqual({ a: 10, b: 20 });
    });

    it("should create new Point instances (not mutate)", () => {
      const original = { x: 100, y: 200 };
      const raw = { p1: original };

      const result = convertToPoints(raw);

      expect(result.p1).toBeInstanceOf(Point);
      expect(result.p1.x).toBe(100);
      expect(result.p1.y).toBe(200);
      // Original object should remain unchanged
      expect(original).toEqual({ x: 100, y: 200 });
    });

    it("should convert already Point instances correctly", () => {
      const raw = {
        p1: new Point(10, 20),
        p2: { x: 30, y: 40 },
      };

      const result = convertToPoints(raw);

      // Point instances should be converted to new Point instances
      expect(result.p1).toBeInstanceOf(Point);
      expect(result.p1.x).toBe(10);
      expect(result.p1.y).toBe(20);
      expect(result.p2).toBeInstanceOf(Point);
      expect(result.p2.x).toBe(30);
      expect(result.p2.y).toBe(40);
    });

    it("should handle corner objects with c_ prefix", () => {
      const raw = {
        c_nw: { x: 0, y: 0 },
        c_ne: { x: 100, y: 0 },
        c_se: { x: 100, y: 100 },
        c_sw: { x: 0, y: 100 },
      };

      const result = convertToPoints(raw);

      expect(result.c_nw).toBeInstanceOf(Point);
      expect(result.c_ne).toBeInstanceOf(Point);
      expect(result.c_se).toBeInstanceOf(Point);
      expect(result.c_sw).toBeInstanceOf(Point);
      expect(result.c_nw.x).toBe(0);
      expect(result.c_nw.y).toBe(0);
      expect(result.c_ne.x).toBe(100);
      expect(result.c_ne.y).toBe(0);
    });

    it("should create a new object (not mutate input)", () => {
      const input = {
        p1: { x: 10, y: 20 },
      };

      const result = convertToPoints(input);

      expect(result).not.toBe(input);
      expect(Object.keys(result)).toEqual(Object.keys(input));
    });
  });
});
