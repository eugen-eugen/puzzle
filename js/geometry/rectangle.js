// Rectangle.js - 2D rectangle utility class
// ------------------------------------------------
// Provides rectangle operations including union, intersection, and bounds calculations.
// Designed to work seamlessly with Point class for consistent geometry operations.

import { Point } from "./point.js";

export class Rectangle {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // ---------------- Factory / Conversion ----------------
  static fromMinMax(minX, minY, maxX, maxY) {
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  static fromPoints(topLeft, bottomRight) {
    return new Rectangle(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  static empty() {
    return new Rectangle(0, 0, 0, 0);
  }

  clone() {
    return new Rectangle(this.x, this.y, this.width, this.height);
  }

  // ---------------- Properties ----------------

  get topLeft() {
    return new Point(this.x, this.y);
  }

  get bottomRight() {
    return new Point(this.x + this.width, this.y + this.height);
  }

  get center() {
    return new Point(this.x + this.width / 2, this.y + this.height / 2);
  }

  /**
   * Get center offset from origin (0,0)
   * @returns {Point} Center point relative to origin
   */
  get centerOffset() {
    return new Point(this.width / 2, this.height / 2);
  }

  // ---------------- Validation ----------------
  isEmpty() {
    return this.width <= 0 || this.height <= 0;
  }

  isValid() {
    return (
      typeof this.x === "number" &&
      typeof this.y === "number" &&
      typeof this.width === "number" &&
      typeof this.height === "number" &&
      isFinite(this.x) &&
      isFinite(this.y) &&
      isFinite(this.width) &&
      isFinite(this.height) &&
      this.width >= 0 &&
      this.height >= 0
    );
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

    return Rectangle.fromMinMax(
      Math.min(this.topLeft.x, r.topLeft.x),
      Math.min(this.topLeft.y, r.topLeft.y),
      Math.max(this.bottomRight.x, r.bottomRight.x),
      Math.max(this.bottomRight.y, r.bottomRight.y)
    );
  }

  /**
   * Scale rectangle by factor
   * @param {number} factor - Scale factor
   * @returns {Rectangle} New scaled rectangle
   */
  scaled(factor) {
    return new Rectangle(
      this.x * factor,
      this.y * factor,
      this.width * factor,
      this.height * factor
    );
  }

  // ---------------- Utility ----------------
  equals(r) {
    return (
      this.x === r.x &&
      this.y === r.y &&
      this.width === r.width &&
      this.height === r.height
    );
  }

  toString() {
    return `Rectangle(${this.x}, ${this.y}, ${this.width}, ${this.height})`;
  }

  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    };
  }

  // ---------------- Static Utilities ----------------

  /**
   * Create a rectangle from a bounding frame object with position offset
   * @param {Object} boundingFrame - Object with minX, minY, maxX, maxY
   * @param {Point} position - Position to offset the bounding frame
   * @returns {Rectangle} Rectangle in world coordinates
   */
  static fromBoundingFrameAtPosition(boundingFrame, position) {
    if (!boundingFrame || !position) return Rectangle.empty();

    const worldMin = position.add(boundingFrame.topLeft);
    const worldMax = position.add(boundingFrame.bottomRight);

    return Rectangle.fromPoints(worldMin, worldMax);
  }
}
