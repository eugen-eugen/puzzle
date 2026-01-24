// sparse-grid.test.js - Unit tests for SparseGrid class
import { describe, it, expect, beforeEach } from "vitest";
import { SparseGrid } from "@/js/utils/sparse-grid.js";

describe("SparseGrid", () => {
  let grid;

  beforeEach(() => {
    grid = new SparseGrid();
  });

  describe("constructor", () => {
    it("should create an empty grid", () => {
      expect(grid.size).toBe(0);
    });
  });

  describe("set and get", () => {
    it("should store and retrieve a value at positive coordinates", () => {
      grid.set(5, 10, "value1");
      expect(grid.get(5, 10)).toBe("value1");
    });

    it("should store and retrieve a value at negative coordinates", () => {
      grid.set(-5, -10, "value2");
      expect(grid.get(-5, -10)).toBe("value2");
    });

    it("should store and retrieve a value at mixed coordinates", () => {
      grid.set(-3, 7, "value3");
      expect(grid.get(-3, 7)).toBe("value3");
    });

    it("should store and retrieve a value at zero coordinates", () => {
      grid.set(0, 0, "origin");
      expect(grid.get(0, 0)).toBe("origin");
    });

    it("should return undefined for non-existent cells", () => {
      expect(grid.get(100, 100)).toBeUndefined();
    });

    it("should overwrite existing values", () => {
      grid.set(5, 5, "first");
      grid.set(5, 5, "second");
      expect(grid.get(5, 5)).toBe("second");
    });

    it("should handle different types of values", () => {
      grid.set(0, 0, 42);
      grid.set(1, 1, "string");
      grid.set(2, 2, { key: "value" });
      grid.set(3, 3, [1, 2, 3]);
      grid.set(4, 4, null);
      grid.set(5, 5, true);

      expect(grid.get(0, 0)).toBe(42);
      expect(grid.get(1, 1)).toBe("string");
      expect(grid.get(2, 2)).toEqual({ key: "value" });
      expect(grid.get(3, 3)).toEqual([1, 2, 3]);
      expect(grid.get(4, 4)).toBeNull();
      expect(grid.get(5, 5)).toBe(true);
    });

    it("should handle large coordinates", () => {
      grid.set(10000, -10000, "far");
      expect(grid.get(10000, -10000)).toBe("far");
    });
  });

  describe("has", () => {
    it("should return true for existing cells", () => {
      grid.set(3, 4, "value");
      expect(grid.has(3, 4)).toBe(true);
    });

    it("should return false for non-existent cells", () => {
      expect(grid.has(10, 20)).toBe(false);
    });

    it("should return true even if value is undefined", () => {
      grid.set(5, 5, undefined);
      expect(grid.has(5, 5)).toBe(true);
    });

    it("should return true even if value is null", () => {
      grid.set(5, 5, null);
      expect(grid.has(5, 5)).toBe(true);
    });

    it("should work with negative coordinates", () => {
      grid.set(-10, -20, "value");
      expect(grid.has(-10, -20)).toBe(true);
      expect(grid.has(-10, -21)).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete an existing cell and return true", () => {
      grid.set(5, 5, "value");
      expect(grid.delete(5, 5)).toBe(true);
      expect(grid.has(5, 5)).toBe(false);
      expect(grid.get(5, 5)).toBeUndefined();
    });

    it("should return false when deleting non-existent cell", () => {
      expect(grid.delete(100, 100)).toBe(false);
    });

    it("should decrease size after deletion", () => {
      grid.set(1, 1, "a");
      grid.set(2, 2, "b");
      expect(grid.size).toBe(2);
      grid.delete(1, 1);
      expect(grid.size).toBe(1);
    });

    it("should work with negative coordinates", () => {
      grid.set(-5, -10, "value");
      expect(grid.delete(-5, -10)).toBe(true);
      expect(grid.has(-5, -10)).toBe(false);
    });
  });

  describe("clear", () => {
    it("should remove all cells", () => {
      grid.set(1, 1, "a");
      grid.set(2, 2, "b");
      grid.set(3, 3, "c");
      expect(grid.size).toBe(3);

      grid.clear();
      expect(grid.size).toBe(0);
      expect(grid.has(1, 1)).toBe(false);
      expect(grid.has(2, 2)).toBe(false);
      expect(grid.has(3, 3)).toBe(false);
    });

    it("should work on an already empty grid", () => {
      expect(grid.size).toBe(0);
      grid.clear();
      expect(grid.size).toBe(0);
    });
  });

  describe("size", () => {
    it("should return 0 for empty grid", () => {
      expect(grid.size).toBe(0);
    });

    it("should return correct count after adding cells", () => {
      grid.set(0, 0, "a");
      expect(grid.size).toBe(1);
      grid.set(1, 1, "b");
      expect(grid.size).toBe(2);
      grid.set(2, 2, "c");
      expect(grid.size).toBe(3);
    });

    it("should not increase when overwriting cells", () => {
      grid.set(5, 5, "first");
      expect(grid.size).toBe(1);
      grid.set(5, 5, "second");
      expect(grid.size).toBe(1);
    });

    it("should decrease after deletion", () => {
      grid.set(1, 1, "a");
      grid.set(2, 2, "b");
      expect(grid.size).toBe(2);
      grid.delete(1, 1);
      expect(grid.size).toBe(1);
    });
  });

  describe("getRange", () => {
    beforeEach(() => {
      // Create a grid with some values
      // Pattern:
      //   0 1 2 3
      // 0 A . . .
      // 1 . B . .
      // 2 . . C .
      // 3 . . . D
      grid.set(0, 0, "A");
      grid.set(1, 1, "B");
      grid.set(2, 2, "C");
      grid.set(3, 3, "D");
    });

    it("should return all cells in range", () => {
      const result = grid.getRange(0, 3, 0, 3);
      expect(result).toHaveLength(4);
      expect(result).toEqual(
        expect.arrayContaining([
          { col: 0, row: 0, value: "A" },
          { col: 1, row: 1, value: "B" },
          { col: 2, row: 2, value: "C" },
          { col: 3, row: 3, value: "D" },
        ])
      );
    });

    it("should return cells in a partial range", () => {
      const result = grid.getRange(0, 1, 0, 1);
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { col: 0, row: 0, value: "A" },
          { col: 1, row: 1, value: "B" },
        ])
      );
    });

    it("should return empty array for range with no cells", () => {
      const result = grid.getRange(10, 20, 10, 20);
      expect(result).toEqual([]);
    });

    it("should work with negative coordinates", () => {
      grid.set(-2, -2, "X");
      grid.set(-1, -1, "Y");
      const result = grid.getRange(-3, 0, -3, 0);
      expect(result).toHaveLength(3); // A, X, Y
      expect(result).toEqual(
        expect.arrayContaining([
          { col: 0, row: 0, value: "A" },
          { col: -2, row: -2, value: "X" },
          { col: -1, row: -1, value: "Y" },
        ])
      );
    });

    it("should return cells in correct order (row by row, col by col)", () => {
      grid.clear();
      grid.set(0, 0, "A");
      grid.set(1, 0, "B");
      grid.set(0, 1, "C");
      grid.set(1, 1, "D");

      const result = grid.getRange(0, 1, 0, 1);
      expect(result).toHaveLength(4);
      // Results should be in row-major order: A, B, C, D
      expect(result[0]).toEqual({ col: 0, row: 0, value: "A" });
      expect(result[1]).toEqual({ col: 1, row: 0, value: "B" });
      expect(result[2]).toEqual({ col: 0, row: 1, value: "C" });
      expect(result[3]).toEqual({ col: 1, row: 1, value: "D" });
    });

    it("should handle single cell range", () => {
      const result = grid.getRange(1, 1, 1, 1);
      expect(result).toEqual([{ col: 1, row: 1, value: "B" }]);
    });

    it("should handle range with mixed positive and negative coordinates", () => {
      grid.set(-1, 0, "X");
      grid.set(0, -1, "Y");
      const result = grid.getRange(-1, 0, -1, 0);
      expect(result).toEqual(
        expect.arrayContaining([
          { col: -1, row: 0, value: "X" },
          { col: 0, row: -1, value: "Y" },
          { col: 0, row: 0, value: "A" },
        ])
      );
    });
  });

  describe("forEach", () => {
    it("should iterate over all cells", () => {
      grid.set(0, 0, "A");
      grid.set(1, 1, "B");
      grid.set(2, 2, "C");

      const results = [];
      grid.forEach((value, col, row) => {
        results.push({ col, row, value });
      });

      expect(results).toHaveLength(3);
      expect(results).toEqual(
        expect.arrayContaining([
          { col: 0, row: 0, value: "A" },
          { col: 1, row: 1, value: "B" },
          { col: 2, row: 2, value: "C" },
        ])
      );
    });

    it("should not iterate on empty grid", () => {
      const callback = vi.fn();
      grid.forEach(callback);
      expect(callback).not.toHaveBeenCalled();
    });

    it("should work with negative coordinates", () => {
      grid.set(-5, -10, "X");
      grid.set(3, 7, "Y");

      const results = [];
      grid.forEach((value, col, row) => {
        results.push({ col, row, value });
      });

      expect(results).toEqual(
        expect.arrayContaining([
          { col: -5, row: -10, value: "X" },
          { col: 3, row: 7, value: "Y" },
        ])
      );
    });

    it("should handle all value types", () => {
      grid.set(0, 0, 42);
      grid.set(1, 1, "string");
      grid.set(2, 2, null);
      grid.set(3, 3, { key: "value" });

      const results = [];
      grid.forEach((value, col, row) => {
        results.push({ col, row, value });
      });

      expect(results).toHaveLength(4);
    });
  });

  describe("coordinate parsing", () => {
    it("should correctly parse integer coordinates", () => {
      grid.set(123, 456, "test");
      expect(grid.get(123, 456)).toBe("test");
    });

    it("should handle coordinates that might create ambiguous keys", () => {
      // Test that "1,23" and "12,3" are different
      grid.set(1, 23, "first");
      grid.set(12, 3, "second");

      expect(grid.get(1, 23)).toBe("first");
      expect(grid.get(12, 3)).toBe("second");
    });

    it("should handle coordinates with many digits", () => {
      grid.set(999999, -999999, "large");
      expect(grid.get(999999, -999999)).toBe("large");
    });
  });

  describe("memory efficiency", () => {
    it("should not store empty cells", () => {
      // Even if we try to get many cells, size should remain 0
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 100; j++) {
          grid.get(i, j); // Just reading, not setting
        }
      }
      expect(grid.size).toBe(0);
    });

    it("should only store cells with values", () => {
      grid.set(0, 0, "a");
      grid.set(100, 100, "b");
      grid.set(-100, -100, "c");

      // Only 3 cells stored despite large coordinate range
      expect(grid.size).toBe(3);
    });
  });

  describe("edge cases", () => {
    it("should handle zero as a value", () => {
      grid.set(0, 0, 0);
      expect(grid.get(0, 0)).toBe(0);
      expect(grid.has(0, 0)).toBe(true);
    });

    it("should handle empty string as a value", () => {
      grid.set(0, 0, "");
      expect(grid.get(0, 0)).toBe("");
      expect(grid.has(0, 0)).toBe(true);
    });

    it("should handle false as a value", () => {
      grid.set(0, 0, false);
      expect(grid.get(0, 0)).toBe(false);
      expect(grid.has(0, 0)).toBe(true);
    });

    it("should distinguish between undefined value and non-existent cell", () => {
      grid.set(0, 0, undefined);
      expect(grid.has(0, 0)).toBe(true);
      expect(grid.get(0, 0)).toBeUndefined();
      expect(grid.has(1, 1)).toBe(false);
      expect(grid.get(1, 1)).toBeUndefined();
    });
  });

  describe("complex operations", () => {
    it("should handle a checkerboard pattern", () => {
      // Create checkerboard
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if ((row + col) % 2 === 0) {
            grid.set(col, row, "black");
          }
        }
      }

      expect(grid.size).toBe(32); // 8x8 checkerboard has 32 squares of each color

      // Verify pattern
      expect(grid.get(0, 0)).toBe("black");
      expect(grid.get(1, 0)).toBeUndefined();
      expect(grid.get(0, 1)).toBeUndefined();
      expect(grid.get(1, 1)).toBe("black");
    });

    it("should handle sparse data with gaps", () => {
      grid.set(0, 0, "start");
      grid.set(1000, 1000, "end");

      expect(grid.size).toBe(2);

      const range = grid.getRange(0, 1000, 0, 1000);
      expect(range).toHaveLength(2);
    });

    it("should handle updating and deleting in sequence", () => {
      grid.set(5, 5, "first");
      expect(grid.size).toBe(1);

      grid.set(5, 5, "second");
      expect(grid.size).toBe(1);

      grid.delete(5, 5);
      expect(grid.size).toBe(0);

      grid.set(5, 5, "third");
      expect(grid.size).toBe(1);
      expect(grid.get(5, 5)).toBe("third");
    });
  });
});
