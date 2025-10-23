// spatialIndex.js - uniform grid spatial index for pieces
// Provides efficient neighbor queries for proximity checks & potential connection detection.

export class SpatialIndex {
  constructor(boundsWidth, boundsHeight, cellSize = 180) {
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

  insert(piece) {
    const { col, row } = this._cellFor(piece.x, piece.y);
    this.grid[this._index(col, row)].add(piece.id);
    this.itemMap.set(piece.id, { col, row });
  }

  update(piece, oldX, oldY) {
    const oldCell = this.itemMap.get(piece.id);
    const { col: newCol, row: newRow } = this._cellFor(piece.x, piece.y);
    if (!oldCell || oldCell.col !== newCol || oldCell.row !== newRow) {
      if (oldCell) {
        this.grid[this._index(oldCell.col, oldCell.row)].delete(piece.id);
      }
      this.grid[this._index(newCol, newRow)].add(piece.id);
      console.log("new index: " + newCol + ":" + newRow);
      this.itemMap.set(piece.id, { col: newCol, row: newRow });
    }
  }

  remove(piece) {
    const cell = this.itemMap.get(piece.id);
    if (cell) {
      this.grid[this._index(cell.col, cell.row)].delete(piece.id);
      this.itemMap.delete(piece.id);
    }
  }

  queryRadius(x, y, radius) {
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
  // Rough heuristic: 2.5x average size
  return Math.max(80, Math.round(avgPieceSize * 2.5));
}
