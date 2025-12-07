// Rectangle.js - 2D rectangle utility class
// ------------------------------------------------
// Provides rectangle operations including union, intersection, and bounds calculations.
// Designed to work seamlessly with Point class for consistent geometry operations.

import { Point } from "./point.js";

export class Rectangle {
  /**
   * Create a new Rectangle
   * @param {Point|null} position - Top-left corner position (cloned internally), defaults to Point(0,0) if null
   * @param {number} width - Rectangle width
   * @param {number} height - Rectangle height
   */
  constructor(position = null, width = 0, height = 0) {
    this._position = position instanceof Point ? position.clone() : new Point();
    this.width = width;
    this.height = height;
  }

  /**
   * Get the top-left position of the rectangle
   * @returns {Point} The position Point
   */
  get position() {
    return this._position;
  }

  // ---------------- Factory / Conversion ----------------
  /**
   * Create a rectangle from two corner points
   * @param {Point} topLeft - Top-left corner
   * @param {Point} bottomRight - Bottom-right corner
   * @returns {Rectangle} New rectangle spanning from topLeft to bottomRight
   */
  static fromPoints(topLeft, bottomRight) {
    return new Rectangle(
      topLeft,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );
  }

  /**
   * Create a deep copy of this rectangle
   * @returns {Rectangle} Independent copy of the rectangle
   */
  clone() {
    return new Rectangle(this.position, this.width, this.height);
  }

  // ---------------- Properties ----------------

  /**
   * Get the top-left corner position
   * @returns {Point} Clone of the position
   */
  get topLeft() {
    return this.position.clone();
  }

  /**
   * Get the bottom-right corner position
   * @returns {Point} Bottom-right corner (position + width/height)
   */
  get bottomRight() {
    return new Point(
      this.position.x + this.width,
      this.position.y + this.height
    );
  }

  /**
   * Get the center point of the rectangle
   * @returns {Point} Center point
   */
  get center() {
    return new Point(
      this.position.x + this.width / 2,
      this.position.y + this.height / 2
    );
  }

  /**
   * Get center offset from origin (0,0)
   * @returns {Point} Center point relative to origin
   */
  get centerOffset() {
    return new Point(this.width / 2, this.height / 2);
  }

  // ---------------- Validation ----------------
  /**
   * Check if the rectangle has zero or negative area
   * @returns {boolean} True if width or height is <= 0
   */
  isEmpty() {
    return this.width <= 0 || this.height <= 0;
  }

  // ---------------- Core Operations ----------------

  /**
   * Union operation - returns a new rectangle that encompasses both this rectangle and the given rectangle
   * @param {Rectangle} r - Rectangle to union with
   * @returns {Rectangle} New rectangle encompassing both rectangles
   */
  plus(r) {
    if (this.isEmpty()) return r.clone();
    if (r.isEmpty()) return this.clone();

    const minPoint = new Point(
      Math.min(this.topLeft.x, r.topLeft.x),
      Math.min(this.topLeft.y, r.topLeft.y)
    );
    const maxPoint = new Point(
      Math.max(this.bottomRight.x, r.bottomRight.x),
      Math.max(this.bottomRight.y, r.bottomRight.y)
    );
    return Rectangle.fromPoints(minPoint, maxPoint);
  }

  /**
   * Scale rectangle by factor
   * @param {number} factor - Scale factor
   * @returns {Rectangle} New scaled rectangle
   */
  scaled(factor) {
    return new Rectangle(
      this.position.scaled(factor),
      this.width * factor,
      this.height * factor
    );
  }

  // ---------------- Utility ----------------

  /**
   * Convert rectangle to string representation
   * @returns {string} String format: "Rectangle(x, y, width, height)"
   */
  toString() {
    return `Rectangle(${this.position.x}, ${this.position.y}, ${this.width}, ${this.height})`;
  }

}
