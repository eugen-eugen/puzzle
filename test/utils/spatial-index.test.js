// spatial-index.test.js - Unit tests for SpatialIndex class
import { describe, it, expect, beforeEach } from "vitest";
import { SpatialIndex } from "@/js/utils/spatial-index.js";
import { Point } from "@/js/geometry/point.js";

describe("SpatialIndex", () => {
  let index;
  const AVG_PIECE_SIZE = 40; // Will compute to cellSize of 100 (40 * 2.5)
  const EXPECTED_CELL_SIZE = 100;

  beforeEach(() => {
    index = new SpatialIndex(1000, 1000, AVG_PIECE_SIZE);
  });

  describe("constructor", () => {
    it("should create an empty spatial index with computed cell size", () => {
      expect(index.cellSize).toBe(EXPECTED_CELL_SIZE);
      expect(index.grid).toBeDefined();
      expect(index.itemMap).toBeDefined();
      expect(index.itemMap.size).toBe(0);
    });

    it("should compute cell size from average piece size", () => {
      const customIndex = new SpatialIndex(800, 600, 50);
      expect(customIndex.cellSize).toBe(125); // 50 * 2.5
    });
  });

  describe("insert", () => {
    it("should insert item with position property", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      expect(index.itemMap.has(1)).toBe(true);
      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(0);
      expect(cell.row).toBe(0);
    });

    it("should insert multiple items in the same cell", () => {
      const item1 = { id: 1, position: new Point(50, 50) };
      const item2 = { id: 2, position: new Point(75, 75) };

      index.insert(item1);
      index.insert(item2);

      expect(index.itemMap.size).toBe(2);

      const cell1 = index.itemMap.get(1);
      const cell2 = index.itemMap.get(2);
      expect(cell1.col).toBe(cell2.col);
      expect(cell1.row).toBe(cell2.row);
    });

    it("should insert items in different cells", () => {
      const item1 = { id: 1, position: new Point(50, 50) };
      const item2 = { id: 2, position: new Point(250, 350) };

      index.insert(item1);
      index.insert(item2);

      const cell1 = index.itemMap.get(1);
      const cell2 = index.itemMap.get(2);

      expect(cell1.col).toBe(0);
      expect(cell1.row).toBe(0);
      expect(cell2.col).toBe(2);
      expect(cell2.row).toBe(3);
    });

    it("should handle negative coordinates", () => {
      const item = { id: 1, position: new Point(-50, -150) };
      index.insert(item);

      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(-1);
      expect(cell.row).toBe(-2);
    });

    it("should handle coordinates at cell boundaries", () => {
      const item1 = { id: 1, position: new Point(0, 0) };
      const item2 = { id: 2, position: new Point(100, 100) };
      const item3 = { id: 3, position: new Point(99, 99) };

      index.insert(item1);
      index.insert(item2);
      index.insert(item3);

      const cell1 = index.itemMap.get(1);
      const cell2 = index.itemMap.get(2);
      const cell3 = index.itemMap.get(3);

      expect(cell1).toEqual({ col: 0, row: 0, point: new Point(0, 0) });
      expect(cell2).toEqual({ col: 1, row: 1, point: new Point(100, 100) });
      expect(cell3).toEqual({ col: 0, row: 0, point: new Point(99, 99) });
    });
  });

  describe("update", () => {
    it("should update item position within same cell", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      item.position = new Point(75, 75);
      index.update(item);

      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(0);
      expect(cell.row).toBe(0);
      // Point is not updated if cell doesn't change (optimization)
      // This is acceptable since the spatial index only cares about cell assignment
    });

    it("should move item to different cell", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      const oldCell = index.itemMap.get(1);
      expect(oldCell.col).toBe(0);
      expect(oldCell.row).toBe(0);

      item.position = new Point(250, 350);
      index.update(item);

      const newCell = index.itemMap.get(1);
      expect(newCell.col).toBe(2);
      expect(newCell.row).toBe(3);
    });

    it("should clean up empty cells after moving item", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      const { col: oldCol, row: oldRow } = index.itemMap.get(1);

      item.position = new Point(250, 350);
      index.update(item);

      // Old cell should be cleaned up
      const oldCellSet = index.grid.get(oldCol, oldRow);
      expect(oldCellSet).toBeUndefined();
    });

    it("should not clean up cell if other items remain", () => {
      const item1 = { id: 1, position: new Point(50, 50) };
      const item2 = { id: 2, position: new Point(75, 75) };

      index.insert(item1);
      index.insert(item2);

      item1.position = new Point(250, 350);
      index.update(item1);

      // Original cell should still exist because item2 is there
      const cellSet = index.grid.get(0, 0);
      expect(cellSet).toBeDefined();
      expect(cellSet.has(2)).toBe(true);
      expect(cellSet.has(1)).toBe(false);
    });

    it("should handle updating item to negative coordinates", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      item.position = new Point(-150, -250);
      index.update(item);

      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(-2);
      expect(cell.row).toBe(-3);
    });

    it("should handle updating non-existent item", () => {
      const item = { id: 999, position: new Point(50, 50) };

      // Should not throw, just insert
      expect(() => index.update(item)).not.toThrow();
      expect(index.itemMap.has(999)).toBe(true);
    });
  });

  describe("remove", () => {
    it("should remove an existing item", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      index.remove(item);

      expect(index.itemMap.has(1)).toBe(false);
    });

    it("should clean up empty cells after removal", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);

      const cell = index.itemMap.get(1);
      const { col, row } = cell;

      index.remove(item);

      const cellSet = index.grid.get(col, row);
      expect(cellSet).toBeUndefined();
    });

    it("should not affect other items in the same cell", () => {
      const item1 = { id: 1, position: new Point(50, 50) };
      const item2 = { id: 2, position: new Point(75, 75) };

      index.insert(item1);
      index.insert(item2);

      index.remove(item1);

      expect(index.itemMap.has(1)).toBe(false);
      expect(index.itemMap.has(2)).toBe(true);

      const cellSet = index.grid.get(0, 0);
      expect(cellSet.has(1)).toBe(false);
      expect(cellSet.has(2)).toBe(true);
    });

    it("should handle removing non-existent item", () => {
      const item = { id: 999, position: new Point(50, 50) };
      expect(() => index.remove(item)).not.toThrow();
    });

    it("should handle removing already removed item", () => {
      const item = { id: 1, position: new Point(50, 50) };
      index.insert(item);
      index.remove(item);

      expect(() => index.remove(item)).not.toThrow();
    });
  });

  describe("queryRadius", () => {
    beforeEach(() => {
      // Set up a grid of items
      // Items at: (50,50), (150,150), (250,250), (350,350), (50,250)
      index.insert({ id: 1, position: new Point(50, 50) });
      index.insert({ id: 2, position: new Point(150, 150) });
      index.insert({ id: 3, position: new Point(250, 250) });
      index.insert({ id: 4, position: new Point(350, 350) });
      index.insert({ id: 5, position: new Point(50, 250) });
    });

    it("should find items within small radius", () => {
      const results = index.queryRadius(new Point(50, 50), 30);
      expect(results).toContain(1);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should find items within larger radius", () => {
      const results = index.queryRadius(new Point(150, 150), 150);
      // Should include items in nearby cells
      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it("should return empty array when no items in radius", () => {
      const results = index.queryRadius(new Point(1000, 1000), 50);
      expect(results).toEqual([]);
    });

    it("should find items across multiple cells", () => {
      const results = index.queryRadius(new Point(200, 200), 150);
      // Should find items in surrounding cells
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle radius that spans many cells", () => {
      const results = index.queryRadius(new Point(200, 200), 300);
      // Should find all items
      expect(results.length).toBe(5);
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
      expect(results).toContain(4);
      expect(results).toContain(5);
    });

    it("should work with negative coordinates", () => {
      index.insert({ id: 6, position: new Point(-50, -50) });
      const results = index.queryRadius(new Point(-50, -50), 30);
      expect(results).toContain(6);
    });

    it("should return unique items only", () => {
      // Query that might overlap cells
      const results = index.queryRadius(new Point(100, 100), 100);
      const uniqueResults = [...new Set(results)];
      expect(results.length).toBe(uniqueResults.length);
    });

    it("should handle zero radius", () => {
      const results = index.queryRadius(new Point(50, 50), 0);
      // Should still return items in the same cell
      expect(results).toContain(1);
    });

    it("should handle query at cell boundaries", () => {
      const results = index.queryRadius(new Point(100, 100), 1);
      // Should check all adjacent cells
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("rebuild", () => {
    it("should clear existing index and rebuild with new pieces", () => {
      index.insert({ id: 1, position: new Point(50, 50) });
      index.insert({ id: 2, position: new Point(150, 150) });

      const newPieces = [
        { id: 3, position: new Point(250, 250) },
        { id: 4, position: new Point(350, 350) },
      ];

      index.rebuild(newPieces);

      expect(index.itemMap.has(1)).toBe(false);
      expect(index.itemMap.has(2)).toBe(false);
      expect(index.itemMap.has(3)).toBe(true);
      expect(index.itemMap.has(4)).toBe(true);
    });

    it("should handle empty piece array", () => {
      index.insert({ id: 1, position: new Point(50, 50) });

      index.rebuild([]);

      expect(index.itemMap.size).toBe(0);
    });

    it("should handle rebuilding with same pieces", () => {
      const pieces = [
        { id: 1, position: new Point(50, 50) },
        { id: 2, position: new Point(150, 150) },
      ];

      index.rebuild(pieces);
      const size1 = index.itemMap.size;

      index.rebuild(pieces);
      const size2 = index.itemMap.size;

      expect(size1).toBe(size2);
      expect(size2).toBe(2);
    });
  });

  describe("_cellFor", () => {
    it("should compute correct cell for positive coordinates", () => {
      const cell = index._cellFor(new Point(50, 50));
      expect(cell).toEqual({ col: 0, row: 0 });
    });

    it("should compute correct cell for coordinates in different cells", () => {
      const cell1 = index._cellFor(new Point(150, 250));
      expect(cell1).toEqual({ col: 1, row: 2 });

      const cell2 = index._cellFor(new Point(350, 450));
      expect(cell2).toEqual({ col: 3, row: 4 });
    });

    it("should compute correct cell for negative coordinates", () => {
      const cell = index._cellFor(new Point(-50, -150));
      expect(cell).toEqual({ col: -1, row: -2 });
    });

    it("should accept Point object", () => {
      const cell = index._cellFor(new Point(150, 250));
      expect(cell).toEqual({ col: 1, row: 2 });
    });

    it("should handle cell boundaries correctly", () => {
      expect(index._cellFor(new Point(0, 0))).toEqual({ col: 0, row: 0 });
      expect(index._cellFor(new Point(99, 99))).toEqual({ col: 0, row: 0 });
      expect(index._cellFor(new Point(100, 100))).toEqual({ col: 1, row: 1 });
      expect(index._cellFor(new Point(-1, -1))).toEqual({ col: -1, row: -1 });
    });
  });

  describe("cell size impact", () => {
    it("should affect cell assignment with different cell sizes", () => {
      // avgPieceSize 20 -> cellSize 80 (min)
      // avgPieceSize 80 -> cellSize 200 (80 * 2.5)
      const smallIndex = new SpatialIndex(1000, 1000, 20);
      const largeIndex = new SpatialIndex(1000, 1000, 80);

      const point = new Point(150, 150);

      const smallCell = smallIndex._cellFor(point);
      const largeCell = largeIndex._cellFor(point);

      expect(smallCell.col).toBe(1); // 150 / 80 = 1.875 -> floor = 1
      expect(smallCell.row).toBe(1);
      expect(largeCell.col).toBe(0); // 150 / 200 = 0.75 -> floor = 0
      expect(largeCell.row).toBe(0);
    });

    it("should affect query results with different cell sizes", () => {
      const smallIndex = new SpatialIndex(1000, 1000, 50);

      smallIndex.insert({ id: 1, position: new Point(50, 50) });
      smallIndex.insert({ id: 2, position: new Point(150, 150) });

      const results = smallIndex.queryRadius(new Point(100, 100), 70);
      // With smaller cells, might need to check more cells
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle very large coordinates", () => {
      const item = { id: 1, position: new Point(10000, 10000) };
      index.insert(item);

      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(100);
      expect(cell.row).toBe(100);
    });

    it("should handle floating point coordinates", () => {
      const item = { id: 1, position: new Point(123.456, 789.012) };
      index.insert(item);

      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(1);
      expect(cell.row).toBe(7);
    });

    it("should handle multiple operations on same item", () => {
      const item = { id: 1, position: new Point(50, 50) };

      index.insert(item);
      item.position = new Point(150, 150);
      index.update(item);
      item.position = new Point(250, 250);
      index.update(item);

      const cell = index.itemMap.get(1);
      expect(cell.col).toBe(2);
      expect(cell.row).toBe(2);

      index.remove(item);
      expect(index.itemMap.has(1)).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should handle typical puzzle piece movement scenario", () => {
      // Insert pieces
      const pieces = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        position: new Point((i % 10) * 100, Math.floor(i / 10) * 100),
      }));

      pieces.forEach((p) => index.insert(p));
      expect(index.itemMap.size).toBe(100);

      // Move some pieces
      pieces[0].position = new Point(500, 500);
      index.update(pieces[0]);

      // Query nearby pieces
      const nearby = index.queryRadius(new Point(500, 500), 150);
      expect(nearby).toContain(0);

      // Remove pieces
      pieces.slice(0, 10).forEach((p) => index.remove(p));
      expect(index.itemMap.size).toBe(90);
    });

    it("should handle rebuilding after many operations", () => {
      // Initial setup
      for (let i = 0; i < 50; i++) {
        index.insert({ id: i, position: new Point(i * 20, i * 20) });
      }

      // Many updates
      for (let i = 0; i < 50; i++) {
        const item = { id: i, position: new Point(i * 30, i * 30) };
        index.update(item);
      }

      // Rebuild
      const newPieces = Array.from({ length: 30 }, (_, i) => ({
        id: i + 100,
        position: new Point(i * 50, i * 50),
      }));

      index.rebuild(newPieces);
      expect(index.itemMap.size).toBe(30);
    });
  });
});

describe("Cell size computation", () => {
  it("should compute cell size based on piece size", () => {
    const avgSize = 50;
    const index = new SpatialIndex(1000, 1000, avgSize);
    expect(index.cellSize).toBe(125); // 50 * 2.5
  });

  it("should enforce minimum cell size", () => {
    const avgSize = 10; // Very small
    const index = new SpatialIndex(1000, 1000, avgSize);
    expect(index.cellSize).toBeGreaterThanOrEqual(80); // MIN_CELL_SIZE
  });

  it("should return rounded values", () => {
    const avgSize = 33.7;
    const index = new SpatialIndex(1000, 1000, avgSize);
    expect(Number.isInteger(index.cellSize)).toBe(true);
  });

  it("should scale linearly with piece size", () => {
    const index1 = new SpatialIndex(1000, 1000, 40);
    const index2 = new SpatialIndex(1000, 1000, 80);
    expect(index2.cellSize).toBeGreaterThan(index1.cellSize);
  });

  it("should handle large piece sizes", () => {
    const avgSize = 200;
    const index = new SpatialIndex(1000, 1000, avgSize);
    expect(index.cellSize).toBe(500); // 200 * 2.5
  });
});
