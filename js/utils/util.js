// Util.js - Utility class for common checks and calculations
export class Util {
  /**
   * Check if an array is empty or undefined
   * @param {Array} array - Array to check
   * @returns {boolean} true if array is empty or undefined
   */
  static isArrayEmpty(array) {
    return !array || array.length === 0;
  }

  /**
   * Check if an array has elements
   * @param {Array} array - Array to check
   * @returns {boolean} true if array has elements
   */
  static hasElements(array) {
    return array && array.length > 0;
  }

  /**
   * Get the number of pieces in state, safely handling undefined/null
   * @param {Object} state - Game state object
   * @returns {number} number of pieces, 0 if undefined
   */
  static getPieceCount(state) {
    return state.pieces ? state.pieces.length : 0;
  }

  /**
   * Check if DOM element exists
   * @param {HTMLElement} element - DOM element to check
   * @returns {boolean} true if element exists
   */
  static isElementValid(element) {
    return element != null;
  }

  /**
   * Check if totalPieces is zero or undefined
   * @param {Object} state - Game state object
   * @returns {boolean} true if totalPieces is zero or undefined
   */
  static isTotalPiecesEmpty(state) {
    return !state.totalPieces || state.totalPieces === 0;
  }

  /**
   * Check if a value is a positive number
   * @param {any} value - Value to check
   * @returns {boolean} true if value is a positive number
   */
  static isPositiveNumber(value) {
    return typeof value === "number" && !isNaN(value) && value > 0;
  }
}
