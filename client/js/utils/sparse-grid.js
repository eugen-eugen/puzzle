// sparse-grid.js - Sparse 2D grid with integer coordinates (positive and negative)
// Provides efficient storage and access for a grid that can expand in any direction

/**
 * SparseGrid class
 * Manages a 2D grid that can handle both positive and negative integer coordinates.
 * Only stores cells that contain data, making it memory-efficient for sparse datasets.
 */
export class SparseGrid {
  constructor() {
    // Map structure: "col,row" -> value
    this._cells = new Map();
  }

  /**
   * Convert integer coordinates to a string key
   * @private
   */
  _key(col, row) {
    return `${col},${row}`;
  }

  /**
   * Set a value at the given coordinates
   * @param {number} col - Column coordinate (can be negative)
   * @param {number} row - Row coordinate (can be negative)
   * @param {*} value - Value to store
   */
  set(col, row, value) {
    this._cells.set(this._key(col, row), value);
  }

  /**
   * Get a value at the given coordinates
   * @param {number} col - Column coordinate
   * @param {number} row - Row coordinate
   * @returns {*} The stored value, or undefined if not set
   */
  get(col, row) {
    return this._cells.get(this._key(col, row));
  }

  /**
   * Check if a cell exists at the given coordinates
   * @param {number} col - Column coordinate
   * @param {number} row - Row coordinate
   * @returns {boolean} True if cell exists
   */
  has(col, row) {
    return this._cells.has(this._key(col, row));
  }

  /**
   * Delete a cell at the given coordinates
   * @param {number} col - Column coordinate
   * @param {number} row - Row coordinate
   * @returns {boolean} True if cell was deleted
   */
  delete(col, row) {
    return this._cells.delete(this._key(col, row));
  }

  /**
   * Clear all cells
   */
  clear() {
    this._cells.clear();
  }

  /**
   * Get all values in a rectangular range
   * @param {number} minCol - Minimum column
   * @param {number} maxCol - Maximum column
   * @param {number} minRow - Minimum row
   * @param {number} maxRow - Maximum row
   * @returns {Array} Array of {col, row, value} objects
   */
  getRange(minCol, maxCol, minRow, maxRow) {
    const results = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const key = this._key(col, row);
        if (this._cells.has(key)) {
          results.push({
            col,
            row,
            value: this._cells.get(key),
          });
        }
      }
    }
    return results;
  }

  /**
   * Get the number of cells stored
   * @returns {number} Cell count
   */
  get size() {
    return this._cells.size;
  }

  /**
   * Iterate over all cells
   * @param {Function} callback - Called with (value, col, row) for each cell
   */
  forEach(callback) {
    this._cells.forEach((value, key) => {
      const [col, row] = key.split(",").map(Number);
      callback(value, col, row);
    });
  }
}
