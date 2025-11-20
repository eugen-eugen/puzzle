// Point.js - 2D point & lightweight vector utility (wrapping native DOMPoint)
// -----------------------------------------------------------------------------
// This class wraps the native browser DOMPoint API while maintaining backward
// compatibility with existing code. It provides a unified API for common geometric
// operations (translate, rotate, distance, bounding box, interpolation) with both
// immutable and mutating variants.
//
// Design notes:
// - Internally uses native DOMPoint for standards compliance and performance
// - Methods returning new Point instances are named without the `mut` prefix
// - Mutating methods are prefixed with `mut` and return `this` for chaining
// - Static helpers accept either plain objects `{x,y}` or Point instances
// - All rotation methods use degrees for consistency and ease of use
//
// Benefits of wrapping DOMPoint:
// - Zero dependencies - uses native browser API
// - Standards-compliant geometry primitives
// - Future-proof for advanced transformations
// - Smaller bundle size
//
// No side-effects: pure ES module.

import { Util } from "../utils/util.js";

export class Point {
  constructor(x = 0, y = 0) {
    // Wrap native DOMPoint for internal representation
    this._point = new DOMPoint(x, y);
  }

  // Expose x and y as getters/setters for backward compatibility
  get x() {
    return this._point.x;
  }
  set x(value) {
    this._point.x = value;
  }
  get y() {
    return this._point.y;
  }
  set y(value) {
    this._point.y = value;
  }

  // ---------------- Factory / Conversion ----------------
  static from(obj) {
    if (!obj) return new Point(0, 0);
    if (obj instanceof Point) return obj;
    return new Point(obj.x, obj.y);
  }
  static zero() {
    return new Point(0, 0);
  }
  static of(x, y) {
    return new Point(x, y);
  }
  toObject() {
    return { x: this.x, y: this.y };
  }
  clone() {
    return new Point(this.x, this.y);
  }

  // ---------------- Immutable (return new Point) ----------------
  added(dx, dy) {
    const result = this._point.matrixTransform(
      new DOMMatrix().translate(dx, dy)
    );
    return new Point(result.x, result.y);
  }
  addPoint(p) {
    p = Point.from(p);
    const result = this._point.matrixTransform(
      new DOMMatrix().translate(p.x, p.y)
    );
    return new Point(result.x, result.y);
  }
  add(p) {
    return this.addPoint(p); // Alias for more concise usage
  }
  sub(p) {
    p = Point.from(p);
    const result = this._point.matrixTransform(
      new DOMMatrix().translate(-p.x, -p.y)
    );
    return new Point(result.x, result.y);
  }
  subtract(pOrDx, dy) {
    if (typeof pOrDx === "number" && typeof dy === "number") {
      const result = this._point.matrixTransform(
        new DOMMatrix().translate(-pOrDx, -dy)
      );
      return new Point(result.x, result.y);
    } else {
      return this.sub(pOrDx);
    }
  }
  scaled(f) {
    const result = this._point.matrixTransform(new DOMMatrix().scale(f));
    return new Point(result.x, result.y);
  }
  midpoint(p) {
    p = Point.from(p);
    return new Point((this.x + p.x) / 2, (this.y + p.y) / 2);
  }

  // ---------------- Rotation (using native DOMMatrix) ----------------
  rotatedAroundDeg(pivot, deg) {
    pivot = Point.from(pivot);

    // Use native DOMMatrix for rotation transformation
    // Translate to pivot, rotate, translate back
    const matrix = new DOMMatrix()
      .translate(pivot.x, pivot.y)
      .rotate(deg)
      .translate(-pivot.x, -pivot.y);

    const result = this._point.matrixTransform(matrix);
    return new Point(result.x, result.y);
  }

  // ---------------- Mutating (in-place) ----------------

  mutCopy(p) {
    p = Point.from(p);
    this.x = p.x;
    this.y = p.y;
    return this;
  }
  mutAdd(dx, dy) {
    this.x += dx;
    this.y += dy;
    return this;
  }

  // ---------------- Metrics ----------------
  distance2(p) {
    p = Point.from(p);
    const dx = this.x - p.x;
    const dy = this.y - p.y;
    return dx * dx + dy * dy;
  }

  equals(p) {
    p = Point.from(p);
    return this.x === p.x && this.y === p.y;
  }

  toString() {
    return `Point(${this.x}, ${this.y})`;
  }

  toJSON() {
    return { x: this.x, y: this.y };
  }

  // ---------------- Validation ----------------
  isValid() {
    return (
      typeof this.x === "number" &&
      typeof this.y === "number" &&
      isFinite(this.x) &&
      isFinite(this.y)
    );
  }

  static isValid(p) {
    if (!p) return false;
    return (
      typeof p.x === "number" &&
      typeof p.y === "number" &&
      isFinite(p.x) &&
      isFinite(p.y)
    );
  }

  // ---------------- Static Utilities ----------------
  static min(a, b) {
    a = Point.from(a);
    b = Point.from(b);
    return new Point(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }
  static max(a, b) {
    a = Point.from(a);
    b = Point.from(b);
    return new Point(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }
}

// Optional legacy helper adapters (can be used during migration):
export function dist2(a, b) {
  return Point.from(a).distance2(b);
}
