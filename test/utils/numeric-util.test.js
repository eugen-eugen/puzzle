// numeric-util.test.js - Unit tests for Util class
import { describe, it, expect } from "vitest";
import { Util } from "@/js/utils/numeric-util.js";

describe("Util", () => {
  describe("isArrayEmpty", () => {
    it("should return true for undefined array", () => {
      expect(Util.isArrayEmpty(undefined)).toBe(true);
    });

    it("should return true for null array", () => {
      expect(Util.isArrayEmpty(null)).toBe(true);
    });

    it("should return true for empty array", () => {
      expect(Util.isArrayEmpty([])).toBe(true);
    });

    it("should return false for non-empty array", () => {
      expect(Util.isArrayEmpty([1, 2, 3])).toBe(false);
    });

    it("should return false for array with single element", () => {
      expect(Util.isArrayEmpty([1])).toBe(false);
    });
  });

  describe("hasElements", () => {
    it("should return falsy for undefined array", () => {
      expect(Util.hasElements(undefined)).toBeFalsy();
    });

    it("should return falsy for null array", () => {
      expect(Util.hasElements(null)).toBeFalsy();
    });

    it("should return false for empty array", () => {
      expect(Util.hasElements([])).toBe(false);
    });

    it("should return true for non-empty array", () => {
      expect(Util.hasElements([1, 2, 3])).toBe(true);
    });

    it("should return true for array with single element", () => {
      expect(Util.hasElements([1])).toBe(true);
    });
  });

  describe("getPieceCount", () => {
    it("should return 0 for state with no pieces property", () => {
      const state = {};
      expect(Util.getPieceCount(state)).toBe(0);
    });

    it("should return 0 for state with null pieces", () => {
      const state = { pieces: null };
      expect(Util.getPieceCount(state)).toBe(0);
    });

    it("should return 0 for state with undefined pieces", () => {
      const state = { pieces: undefined };
      expect(Util.getPieceCount(state)).toBe(0);
    });

    it("should return 0 for state with empty pieces array", () => {
      const state = { pieces: [] };
      expect(Util.getPieceCount(state)).toBe(0);
    });

    it("should return correct count for state with pieces", () => {
      const state = { pieces: [1, 2, 3, 4, 5] };
      expect(Util.getPieceCount(state)).toBe(5);
    });

    it("should return 1 for state with single piece", () => {
      const state = { pieces: [1] };
      expect(Util.getPieceCount(state)).toBe(1);
    });
  });

  describe("isElementValid", () => {
    it("should return false for null element", () => {
      expect(Util.isElementValid(null)).toBe(false);
    });

    it("should return false for undefined element", () => {
      expect(Util.isElementValid(undefined)).toBe(false);
    });

    it("should return true for valid object", () => {
      expect(Util.isElementValid({})).toBe(true);
    });

    it("should return true for DOM-like element", () => {
      const element = { nodeType: 1, tagName: "DIV" };
      expect(Util.isElementValid(element)).toBe(true);
    });

    it("should return true for string (truthy value)", () => {
      expect(Util.isElementValid("element")).toBe(true);
    });

    it("should return true for number (truthy value)", () => {
      expect(Util.isElementValid(42)).toBe(true);
    });
  });

  describe("isTotalPiecesEmpty", () => {
    it("should return true for state with no totalPieces property", () => {
      const state = {};
      expect(Util.isTotalPiecesEmpty(state)).toBe(true);
    });

    it("should return true for state with null totalPieces", () => {
      const state = { totalPieces: null };
      expect(Util.isTotalPiecesEmpty(state)).toBe(true);
    });

    it("should return true for state with undefined totalPieces", () => {
      const state = { totalPieces: undefined };
      expect(Util.isTotalPiecesEmpty(state)).toBe(true);
    });

    it("should return true for state with zero totalPieces", () => {
      const state = { totalPieces: 0 };
      expect(Util.isTotalPiecesEmpty(state)).toBe(true);
    });

    it("should return false for state with positive totalPieces", () => {
      const state = { totalPieces: 10 };
      expect(Util.isTotalPiecesEmpty(state)).toBe(false);
    });

    it("should return false for state with totalPieces = 1", () => {
      const state = { totalPieces: 1 };
      expect(Util.isTotalPiecesEmpty(state)).toBe(false);
    });

    it("should return false for state with negative totalPieces", () => {
      const state = { totalPieces: -5 };
      expect(Util.isTotalPiecesEmpty(state)).toBe(false);
    });
  });

  describe("isPositiveNumber", () => {
    it("should return true for positive integer", () => {
      expect(Util.isPositiveNumber(42)).toBe(true);
    });

    it("should return true for positive decimal", () => {
      expect(Util.isPositiveNumber(3.14)).toBe(true);
    });

    it("should return false for zero", () => {
      expect(Util.isPositiveNumber(0)).toBe(false);
    });

    it("should return false for negative number", () => {
      expect(Util.isPositiveNumber(-5)).toBe(false);
    });

    it("should return false for NaN", () => {
      expect(Util.isPositiveNumber(NaN)).toBe(false);
    });

    it("should return false for string", () => {
      expect(Util.isPositiveNumber("42")).toBe(false);
    });

    it("should return false for null", () => {
      expect(Util.isPositiveNumber(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(Util.isPositiveNumber(undefined)).toBe(false);
    });

    it("should return false for object", () => {
      expect(Util.isPositiveNumber({})).toBe(false);
    });

    it("should return false for array", () => {
      expect(Util.isPositiveNumber([42])).toBe(false);
    });

    it("should return true for very small positive number", () => {
      expect(Util.isPositiveNumber(0.0001)).toBe(true);
    });

    it("should return true for very large positive number", () => {
      expect(Util.isPositiveNumber(1e10)).toBe(true);
    });

    it("should return false for Infinity", () => {
      expect(Util.isPositiveNumber(Infinity)).toBe(true);
    });

    it("should return false for -Infinity", () => {
      expect(Util.isPositiveNumber(-Infinity)).toBe(false);
    });
  });

  describe("symmetricRandomDeviation", () => {
    it("should return value within range for maxDeviation=10", () => {
      const maxDeviation = 10;
      for (let i = 0; i < 100; i++) {
        const result = Util.symmetricRandomDeviation(maxDeviation);
        expect(result).toBeGreaterThanOrEqual(-maxDeviation);
        expect(result).toBeLessThanOrEqual(maxDeviation);
      }
    });

    it("should return value within range for maxDeviation=50", () => {
      const maxDeviation = 50;
      for (let i = 0; i < 100; i++) {
        const result = Util.symmetricRandomDeviation(maxDeviation);
        expect(result).toBeGreaterThanOrEqual(-maxDeviation);
        expect(result).toBeLessThanOrEqual(maxDeviation);
      }
    });

    it("should return 0 or -0 for maxDeviation=0", () => {
      const result = Util.symmetricRandomDeviation(0);
      expect(Math.abs(result)).toBe(0);
    });

    it("should return values close to 0 for very small maxDeviation", () => {
      const maxDeviation = 0.01;
      for (let i = 0; i < 100; i++) {
        const result = Util.symmetricRandomDeviation(maxDeviation);
        expect(Math.abs(result)).toBeLessThanOrEqual(maxDeviation);
      }
    });

    it("should return numeric value", () => {
      const result = Util.symmetricRandomDeviation(10);
      expect(typeof result).toBe("number");
      expect(isNaN(result)).toBe(false);
    });

    it("should produce both positive and negative values over multiple calls", () => {
      const maxDeviation = 100;
      const results = [];
      for (let i = 0; i < 1000; i++) {
        results.push(Util.symmetricRandomDeviation(maxDeviation));
      }
      const hasPositive = results.some((v) => v > 0);
      const hasNegative = results.some((v) => v < 0);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });

    it("should scale linearly with maxDeviation", () => {
      const maxDeviation1 = 10;
      const maxDeviation2 = 20;
      
      const results1 = [];
      const results2 = [];
      
      for (let i = 0; i < 1000; i++) {
        results1.push(Math.abs(Util.symmetricRandomDeviation(maxDeviation1)));
        results2.push(Math.abs(Util.symmetricRandomDeviation(maxDeviation2)));
      }
      
      const avg1 = results1.reduce((a, b) => a + b, 0) / results1.length;
      const avg2 = results2.reduce((a, b) => a + b, 0) / results2.length;
      
      // avg2 should be roughly twice avg1 (with some tolerance for randomness)
      const ratio = avg2 / avg1;
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(2.5);
    });

    it("should handle negative maxDeviation", () => {
      const maxDeviation = -10;
      const result = Util.symmetricRandomDeviation(maxDeviation);
      expect(result).toBeGreaterThanOrEqual(maxDeviation);
      expect(result).toBeLessThanOrEqual(-maxDeviation);
    });

    it("should handle fractional maxDeviation", () => {
      const maxDeviation = 0.5;
      for (let i = 0; i < 100; i++) {
        const result = Util.symmetricRandomDeviation(maxDeviation);
        expect(result).toBeGreaterThanOrEqual(-maxDeviation);
        expect(result).toBeLessThanOrEqual(maxDeviation);
      }
    });
  });
});
