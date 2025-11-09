// Rectangle.js - 2D rectangle utility class
// ------------------------------------------------
// Provides rectangle operations including union, intersection, and bounds calculations.
// Designed to work seamlessly with Point class for consistent geometry operations.

import { Point } from "./Point.js";

export class Rectangle {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // ---------------- Factory / Conversion ----------------
  static from(obj) {
    if (!obj) return new Rectangle(0, 0, 0, 0);
    if (obj instanceof Rectangle) return obj;
    if (
      obj.x !== undefined &&
      obj.y !== undefined &&
      obj.width !== undefined &&
      obj.height !== undefined
    ) {
      return new Rectangle(obj.x, obj.y, obj.width, obj.height);
    }
    // Support {minX, minY, maxX, maxY} format
    if (
      obj.minX !== undefined &&
      obj.minY !== undefined &&
      obj.maxX !== undefined &&
      obj.maxY !== undefined
    ) {
      return new Rectangle(
        obj.minX,
        obj.minY,
        obj.maxX - obj.minX,
        obj.maxY - obj.minY
      );
    }
    return new Rectangle(0, 0, 0, 0);
  }

  static fromMinMax(minX, minY, maxX, maxY) {
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  static fromPoints(topLeft, bottomRight) {
    const tl = Point.from(topLeft);
    const br = Point.from(bottomRight);
    return new Rectangle(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  }

  static empty() {
    return new Rectangle(0, 0, 0, 0);
  }

  clone() {
    return new Rectangle(this.x, this.y, this.width, this.height);
  }

  // ---------------- Properties ----------------
  get minX() {
    return this.x;
  }

  get minY() {
    return this.y;
  }

  get maxX() {
    return this.x + this.width;
  }

  get maxY() {
    return this.y + this.height;
  }

  get topLeft() {
    return new Point(this.x, this.y);
  }

  get topRight() {
    return new Point(this.x + this.width, this.y);
  }

  get bottomLeft() {
    return new Point(this.x, this.y + this.height);
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
    const rect = Rectangle.from(r);
    if (this.isEmpty()) return rect.clone();
    if (rect.isEmpty()) return this.clone();

    const minX = Math.min(this.minX, rect.minX);
    const minY = Math.min(this.minY, rect.minY);
    const maxX = Math.max(this.maxX, rect.maxX);
    const maxY = Math.max(this.maxY, rect.maxY);

    return Rectangle.fromMinMax(minX, minY, maxX, maxY);
  }

  /**
   * Mutating union operation - expands this rectangle to encompass the given rectangle
   * @param {Rectangle} r - Rectangle to union with
   * @returns {Rectangle} This rectangle (for chaining)
   */
  mutPlus(r) {
    const rect = Rectangle.from(r);
    if (this.isEmpty()) {
      this.x = rect.x;
      this.y = rect.y;
      this.width = rect.width;
      this.height = rect.height;
      return this;
    }
    if (rect.isEmpty()) return this;

    const minX = Math.min(this.minX, rect.minX);
    const minY = Math.min(this.minY, rect.minY);
    const maxX = Math.max(this.maxX, rect.maxX);
    const maxY = Math.max(this.maxY, rect.maxY);

    this.x = minX;
    this.y = minY;
    this.width = maxX - minX;
    this.height = maxY - minY;

    return this;
  }

  /**
   * Intersection operation - returns a new rectangle representing the intersection
   * @param {Rectangle} r - Rectangle to intersect with
   * @returns {Rectangle} New rectangle representing intersection (may be empty)
   */
  intersect(r) {
    const rect = Rectangle.from(r);
    const minX = Math.max(this.minX, rect.minX);
    const minY = Math.max(this.minY, rect.minY);
    const maxX = Math.min(this.maxX, rect.maxX);
    const maxY = Math.min(this.maxY, rect.maxY);

    if (minX >= maxX || minY >= maxY) {
      return Rectangle.empty();
    }

    return Rectangle.fromMinMax(minX, minY, maxX, maxY);
  }

  /**
   * Translate rectangle by offset
   * @param {Point|number} offsetOrX - Point offset or X offset
   * @param {number} [y] - Y offset (if first param is number)
   * @returns {Rectangle} New translated rectangle
   */
  translated(offsetOrX, y) {
    if (typeof offsetOrX === "number" && typeof y === "number") {
      return new Rectangle(
        this.x + offsetOrX,
        this.y + y,
        this.width,
        this.height
      );
    } else {
      const offset = Point.from(offsetOrX);
      return new Rectangle(
        this.x + offset.x,
        this.y + offset.y,
        this.width,
        this.height
      );
    }
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

  /**
   * Mutating scale rectangle by factor
   * @param {number} factor - Scale factor
   * @returns {Rectangle} This rectangle (for chaining)
   */
  scale(factor) {
    this.x *= factor;
    this.y *= factor;
    this.width *= factor;
    this.height *= factor;
    return this;
  }

  /**
   * Mutating translate rectangle by offset
   * @param {Point|number} offsetOrX - Point offset or X offset
   * @param {number} [y] - Y offset (if first param is number)
   * @returns {Rectangle} This rectangle (for chaining)
   */
  shift(offsetOrX, y) {
    if (typeof offsetOrX === "number" && typeof y === "number") {
      this.x += offsetOrX;
      this.y += y;
    } else {
      const offset = Point.from(offsetOrX);
      this.x += offset.x;
      this.y += offset.y;
    }
    return this;
  }

  /**
   * Expand rectangle by margin in all directions
   * @param {number} margin - Margin to add
   * @returns {Rectangle} New expanded rectangle
   */
  expanded(margin) {
    return new Rectangle(
      this.x - margin,
      this.y - margin,
      this.width + 2 * margin,
      this.height + 2 * margin
    );
  }

  // ---------------- Containment Tests ----------------
  contains(pointOrRect) {
    if (pointOrRect.width !== undefined) {
      // Rectangle containment
      const rect = Rectangle.from(pointOrRect);
      return (
        this.minX <= rect.minX &&
        this.minY <= rect.minY &&
        this.maxX >= rect.maxX &&
        this.maxY >= rect.maxY
      );
    } else {
      // Point containment
      const point = Point.from(pointOrRect);
      return (
        point.x >= this.minX &&
        point.x <= this.maxX &&
        point.y >= this.minY &&
        point.y <= this.maxY
      );
    }
  }

  overlaps(r) {
    const rect = Rectangle.from(r);
    return !(
      this.maxX <= rect.minX ||
      this.minX >= rect.maxX ||
      this.maxY <= rect.minY ||
      this.minY >= rect.maxY
    );
  }

  // ---------------- Utility ----------------
  equals(r) {
    const rect = Rectangle.from(r);
    return (
      this.x === rect.x &&
      this.y === rect.y &&
      this.width === rect.width &&
      this.height === rect.height
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

  // Legacy compatibility
  toMinMax() {
    return {
      minX: this.minX,
      minY: this.minY,
      maxX: this.maxX,
      maxY: this.maxY,
    };
  }

  // ---------------- Static Utilities ----------------

  /**
   * Create a rectangle that encompasses all given rectangles
   * @param {Rectangle[]} rectangles - Array of rectangles
   * @returns {Rectangle} Encompassing rectangle
   */
  static union(rectangles) {
    if (!rectangles || rectangles.length === 0) return Rectangle.empty();

    let result = Rectangle.from(rectangles[0]);
    for (let i = 1; i < rectangles.length; i++) {
      result = result.plus(rectangles[i]);
    }
    return result;
  }

  /**
   * Create a rectangle from a bounding frame object with position offset
   * @param {Object} boundingFrame - Object with minX, minY, maxX, maxY
   * @param {Point} position - Position to offset the bounding frame
   * @returns {Rectangle} Rectangle in world coordinates
   */
  static fromBoundingFrameAtPosition(boundingFrame, position) {
    if (!boundingFrame || !position) return Rectangle.empty();

    const pos = Point.from(position);
    const worldMin = pos.add(new Point(boundingFrame.minX, boundingFrame.minY));
    const worldMax = pos.add(new Point(boundingFrame.maxX, boundingFrame.maxY));

    return Rectangle.fromPoints(worldMin, worldMax);
  }
}
