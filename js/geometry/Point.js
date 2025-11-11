// Point.js - 2D point & lightweight vector utility
// --------------------------------------------------
// Non-invasive introduction: existing code continues to use plain {x,y} objects.
// This class adds a unified API for common geometric operations (translate, rotate,
// distance, bounding box, interpolation) while offering both immutable and mutating
// variants for performance tuning.
//
// Design notes:
// - Methods returning new Point instances are named without the `mut` prefix.
// - Mutating methods are prefixed with `mut` and return `this` for chaining.
// - Static helpers accept either plain objects `{x,y}` or Point instances.

import { Util } from "../utils/Util.js";
// All rotation methods use degrees for consistency and ease of use.
//
// Incremental adoption strategy:
// 1. Import and start using for new features (e.g., future viewport calculations).
// 2. Wrap existing helpers (dist2 / rotatePoint) to delegate to Point for parity tests.
// 3. Gradually replace ad-hoc math inside connectionManager & pieceRenderer.
// 4. All pieces now use Point-based positions throughout the application.
//
// No side-effects: pure ES module.

export class Point {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
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
    return new Point(this.x + dx, this.y + dy);
  }
  addPoint(p) {
    p = Point.from(p);
    return new Point(this.x + p.x, this.y + p.y);
  }
  add(p) {
    return this.addPoint(p); // Alias for more concise usage
  }
  sub(p) {
    p = Point.from(p);
    return new Point(this.x - p.x, this.y - p.y);
  }
  subtract(pOrDx, dy) {
    if (typeof pOrDx === "number" && typeof dy === "number") {
      return new Point(this.x - pOrDx, this.y - dy);
    } else {
      return this.sub(pOrDx);
    }
  }
  scaled(f) {
    return new Point(this.x * f, this.y * f);
  }
  midpoint(p) {
    p = Point.from(p);
    return new Point((this.x + p.x) / 2, (this.y + p.y) / 2);
  }

  // ---------------- Internal Helpers ----------------
  _calculateRotatedCoords(pivot, deg) {
    pivot = Point.from(pivot);
    const dx = this.x - pivot.x;
    const dy = this.y - pivot.y;

    // Fast path for common rotations
    let cos, sin;

    if (deg === 0) {
      cos = 1;
      sin = 0;
    } else if (deg === 90) {
      cos = 0;
      sin = 1;
    } else if (deg === 180) {
      cos = -1;
      sin = 0;
    } else if (deg === 270) {
      cos = 0;
      sin = -1;
    } else {
      // Only normalize for non-standard angles
      const normalizedDeg = ((deg % 360) + 360) % 360;
      if (normalizedDeg === 0) {
        cos = 1;
        sin = 0;
      } else if (normalizedDeg === 90) {
        cos = 0;
        sin = 1;
      } else if (normalizedDeg === 180) {
        cos = -1;
        sin = 0;
      } else if (normalizedDeg === 270) {
        cos = 0;
        sin = -1;
      } else {
        const rad = (deg * Math.PI) / 180;
        cos = Math.cos(rad);
        sin = Math.sin(rad);
      }
    }

    return {
      x: pivot.x + dx * cos - dy * sin,
      y: pivot.y + dx * sin + dy * cos,
    };
  }

  rotatedAroundDeg(pivot, deg) {
    const coords = this._calculateRotatedCoords(pivot, deg);
    return new Point(coords.x, coords.y);
  }

  // ---------------- Mutating (in-place) ----------------
  mutSet(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
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
  mutAddPoint(p) {
    p = Point.from(p);
    this.x += p.x;
    this.y += p.y;
    return this;
  }
  mutSubPoint(p) {
    p = Point.from(p);
    this.x -= p.x;
    this.y -= p.y;
    return this;
  }
  mutScale(f) {
    this.x *= f;
    this.y *= f;
    return this;
  }
  mutRotateAroundDeg(pivot, deg) {
    const coords = this._calculateRotatedCoords(pivot, deg);
    this.x = coords.x;
    this.y = coords.y;
    return this;
  }

  // ---------------- Metrics ----------------
  distance2(p) {
    p = Point.from(p);
    const dx = this.x - p.x;
    const dy = this.y - p.y;
    return dx * dx + dy * dy;
  }
  distance(p) {
    return Math.sqrt(this.distance2(p));
  }
  manhattan(p) {
    p = Point.from(p);
    return Math.abs(this.x - p.x) + Math.abs(this.y - p.y);
  }

  equals(p) {
    p = Point.from(p);
    return this.x === p.x && this.y === p.y;
  }
  almostEquals(p, eps = 1e-6) {
    p = Point.from(p);
    return Math.abs(this.x - p.x) <= eps && Math.abs(this.y - p.y) <= eps;
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
  static lerp(a, b, t) {
    a = Point.from(a);
    b = Point.from(b);
    return new Point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
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
  static average(points) {
    if (Util.isArrayEmpty(points)) return Point.zero();
    let sx = 0,
      sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return new Point(sx / points.length, sy / points.length);
  }
  static boundingBox(points) {
    if (Util.isArrayEmpty(points)) return null;
    // Filter out invalid points
    const validPoints = points.filter((p) => Point.isValid(p));
    if (Util.isArrayEmpty(validPoints)) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of validPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const min = new Point(minX, minY);
    const max = new Point(maxX, maxY);
    const width = maxX - minX;
    const height = maxY - minY;
    const center = min.added(width / 2, height / 2);
    return { min, max, width, height, center };
  }

  static validPointsOnly(points) {
    return points.filter((p) => Point.isValid(p));
  }

  static computeBounds(
    pieces,
    getPiecePosition = (p) => p.position,
    getPieceSize = null
  ) {
    let minPoint = new Point(Infinity, Infinity);
    let maxPoint = new Point(-Infinity, -Infinity);
    let hasValidPoints = false;

    for (const piece of pieces) {
      const position = getPiecePosition(piece);
      let topLeft = position;
      let bottomRight = position;

      if (getPieceSize) {
        const size = getPieceSize(piece);
        if (size && typeof size.x === "number" && typeof size.y === "number") {
          bottomRight = position.added(size.x, size.y);
        }
      }

      minPoint = Point.min(minPoint, topLeft);
      maxPoint = Point.max(maxPoint, bottomRight);
      hasValidPoints = true;
    }

    return hasValidPoints ? { min: minPoint, max: maxPoint } : null;
  }
}

// Optional legacy helper adapters (can be used during migration):
export function dist2(a, b) {
  return Point.from(a).distance2(b);
}
