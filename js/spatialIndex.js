// spatialIndex.js - uniform grid spatial index for pieces
// Provides efficient neighbor queries for proximity checks & potential connection detection.
// Refactored to interoperate with Point objects while retaining backward
// compatibility with plain {x, y} inputs.

import { Point } from "./geometry/Point.js";

// ================================
// Module Constants
// ================================
const DEFAULT_CELL_SIZE = 180; // Fallback cell size in pixels
const MIN_CELL_SIZE = 80; // Lower bound for dynamic heuristic
const CELL_SIZE_MULTIPLIER = 2.5; // avg piece size * multiplier

export class SpatialIndex {
  constructor(boundsWidth, boundsHeight, cellSize = DEFAULT_CELL_SIZE) {
    this.w = boundsWidth;
    this.h = boundsHeight;
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(boundsWidth / cellSize));
    this.rows = Math.max(1, Math.ceil(boundsHeight / cellSize));
    this.grid = new Array(this.cols * this.rows)
      .fill(null)
      .map(() => new Set());
    this.itemMap = new Map(); // id -> {col,row}
  }

  _index(col, row) {
    return row * this.cols + col;
  }

  _cellFor(x, y) {
    // Accept either numbers or a Point / object as first param
    if (typeof x === "object" && x !== null) {
      y = x.y;
      x = x.x;
    }
    const col = Math.min(
      this.cols - 1,
      Math.max(0, Math.floor(x / this.cellSize))
    );
    const row = Math.min(
      this.rows - 1,
      Math.max(0, Math.floor(y / this.cellSize))
    );
    return { col, row };
  }

  insert(item) {
    // item may be {id, x, y} OR {id, position: Point} OR {id, x, y, pos:Point}
    const point =
      item.position instanceof Point
        ? item.position
        : item.pos instanceof Point
        ? item.pos
        : new Point(item.x, item.y);
    // Mirror numeric x,y for legacy consumers (not strictly stored but convenient)
    item.x = point.x; // eslint-disable-line no-param-reassign
    item.y = point.y; // eslint-disable-line no-param-reassign
    const { col, row } = this._cellFor(point);
    this.grid[this._index(col, row)].add(item.id);
    this.itemMap.set(item.id, { col, row, point });
  }

  update(item) {
    const point =
      item.position instanceof Point
        ? item.position
        : item.pos instanceof Point
        ? item.pos
        : new Point(item.x, item.y);
    item.x = point.x; // keep numeric mirror
    item.y = point.y;
    const oldCell = this.itemMap.get(item.id);
    const { col: newCol, row: newRow } = this._cellFor(point);
    if (!oldCell || oldCell.col !== newCol || oldCell.row !== newRow) {
      if (oldCell) {
        this.grid[this._index(oldCell.col, oldCell.row)].delete(item.id);
      }
      this.grid[this._index(newCol, newRow)].add(item.id);
      this.itemMap.set(item.id, { col: newCol, row: newRow, point });
    }
  }

  remove(item) {
    const cell = this.itemMap.get(item.id);
    if (cell) {
      this.grid[this._index(cell.col, cell.row)].delete(item.id);
      this.itemMap.delete(item.id);
    }
  }

  queryRadius(x, y, radius) {
    if (typeof x === "object" && x !== null) {
      radius = y; // shift params if called as (point, radius)
      const pt = x instanceof Point ? x : Point.from(x);
      x = pt.x;
      y = pt.y;
    }
    const results = new Set();
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(
      this.cols - 1,
      Math.floor((x + radius) / this.cellSize)
    );
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(
      this.rows - 1,
      Math.floor((y + radius) / this.cellSize)
    );
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const bucket = this.grid[this._index(c, r)];
        bucket.forEach((id) => results.add(id));
      }
    }
    return Array.from(results);
  }

  rebuild(pieces) {
    this.grid.forEach((set) => set.clear());
    this.itemMap.clear();
    pieces.forEach((p) => this.insert(p));
  }
}

export function chooseCellSize(avgPieceSize) {
  // Rough heuristic: MULTIPLIER * average size clamped to minimum
  return Math.max(
    MIN_CELL_SIZE,
    Math.round(avgPieceSize * CELL_SIZE_MULTIPLIER)
  );
}
