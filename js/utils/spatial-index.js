// spatialIndex.js - uniform grid spatial index for pieces
// Provides efficient neighbor queries for proximity checks & potential connection detection.

import { SparseGrid } from "./sparse-grid.js";

// ================================
// Module Constants
// ================================
const MIN_CELL_SIZE = 80; // Lower bound for dynamic heuristic
const CELL_SIZE_MULTIPLIER = 2.5; // avg piece size * multiplier

export class SpatialIndex {
  constructor(boundsWidth, boundsHeight, avgPieceSize) {
    // Compute cell size from average piece size
    // Rough heuristic: MULTIPLIER * average size clamped to minimum
    this.cellSize = Math.max(
      MIN_CELL_SIZE,
      Math.round(avgPieceSize * CELL_SIZE_MULTIPLIER)
    );
    this.grid = new SparseGrid();
    this.itemMap = new Map(); // id -> {col, row, point}
  }

  _cellFor(point) {
    const col = Math.floor(point.x / this.cellSize);
    const row = Math.floor(point.y / this.cellSize);
    return { col, row };
  }

  insert(item) {
    const { col, row } = this._cellFor(item.position);

    // Get or create Set for this cell
    let cellSet = this.grid.get(col, row);
    if (!cellSet) {
      cellSet = new Set();
      this.grid.set(col, row, cellSet);
    }

    cellSet.add(item.id);
    this.itemMap.set(item.id, { col, row, point: item.position });
  }

  update(item) {
    const oldCell = this.itemMap.get(item.id);
    const { col: newCol, row: newRow } = this._cellFor(item.position);

    // Debug: Log spatial index coordinates
    if (!oldCell || oldCell.col !== newCol || oldCell.row !== newRow) {
      // Remove from old cell
      if (oldCell) {
        const oldCellSet = this.grid.get(oldCell.col, oldCell.row);
        if (oldCellSet) {
          oldCellSet.delete(item.id);
          // Clean up empty cells
          if (oldCellSet.size === 0) {
            this.grid.delete(oldCell.col, oldCell.row);
          }
        }
      }

      // Add to new cell
      let newCellSet = this.grid.get(newCol, newRow);
      if (!newCellSet) {
        newCellSet = new Set();
        this.grid.set(newCol, newRow, newCellSet);
      }
      newCellSet.add(item.id);

      this.itemMap.set(item.id, {
        col: newCol,
        row: newRow,
        point: item.position,
      });
    }
  }

  remove(item) {
    const cell = this.itemMap.get(item.id);
    if (cell) {
      const cellSet = this.grid.get(cell.col, cell.row);
      if (cellSet) {
        cellSet.delete(item.id);
        // Clean up empty cells
        if (cellSet.size === 0) {
          this.grid.delete(cell.col, cell.row);
        }
      }
      this.itemMap.delete(item.id);
    }
  }

  queryRadius(point, radius) {
    const results = new Set();
    const minCol = Math.floor((point.x - radius) / this.cellSize);
    const maxCol = Math.floor((point.x + radius) / this.cellSize);
    const minRow = Math.floor((point.y - radius) / this.cellSize);
    const maxRow = Math.floor((point.y + radius) / this.cellSize);

    // Query all cells in range (SparseGrid handles missing cells)
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellSet = this.grid.get(col, row);
        if (cellSet) {
          cellSet.forEach((id) => results.add(id));
        }
      }
    }

    return Array.from(results);
  }

  rebuild(pieces) {
    this.grid.clear();
    this.itemMap.clear();
    pieces.forEach((p) => this.insert(p));
  }
}
