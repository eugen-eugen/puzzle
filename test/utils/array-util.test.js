// array-util.test.js - Unit tests for array utility functions
import { describe, it, expect } from "vitest";
import { isEmptyOrNullish, reversed } from "@/js/utils/array-util.js";

describe("array-util", () => {
  describe("isEmptyOrNullish", () => {
    it("should return true for null", () => {
      expect(isEmptyOrNullish(null)).toBe(true);
    });

    it("should return true for undefined", () => {
      expect(isEmptyOrNullish(undefined)).toBe(true);
    });

    it("should return true for empty array", () => {
      expect(isEmptyOrNullish([])).toBe(true);
    });

    it("should return false for non-empty array", () => {
      expect(isEmptyOrNullish([1, 2, 3])).toBe(false);
    });

    it("should return false for array with one element", () => {
      expect(isEmptyOrNullish([1])).toBe(false);
    });
  });

  describe("reversed", () => {
    it("should return a new array with elements in reversed order", () => {
      const original = [1, 2, 3, 4, 5];
      const result = reversed(original);

      expect(result).toEqual([5, 4, 3, 2, 1]);
    });

    it("should not mutate the original array", () => {
      const original = [1, 2, 3, 4, 5];
      const result = reversed(original);

      expect(original).toEqual([1, 2, 3, 4, 5]);
      expect(result).not.toBe(original);
    });

    it("should handle empty array", () => {
      const original = [];
      const result = reversed(original);

      expect(result).toEqual([]);
      expect(result).not.toBe(original);
    });

    it("should handle single element array", () => {
      const original = [42];
      const result = reversed(original);

      expect(result).toEqual([42]);
      expect(result).not.toBe(original);
    });

    it("should handle array with two elements", () => {
      const original = [1, 2];
      const result = reversed(original);

      expect(result).toEqual([2, 1]);
    });

    it("should handle arrays with objects", () => {
      const obj1 = { x: 1 };
      const obj2 = { x: 2 };
      const obj3 = { x: 3 };
      const original = [obj1, obj2, obj3];
      const result = reversed(original);

      expect(result).toEqual([obj3, obj2, obj1]);
      expect(result[0]).toBe(obj3);
      expect(result[1]).toBe(obj2);
      expect(result[2]).toBe(obj1);
    });

    it("should handle arrays with mixed types", () => {
      const original = [1, "two", { three: 3 }, null, undefined];
      const result = reversed(original);

      expect(result).toEqual([undefined, null, { three: 3 }, "two", 1]);
    });

    it("should create independent copies when called multiple times", () => {
      const original = [1, 2, 3];
      const result1 = reversed(original);
      const result2 = reversed(original);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });
});
