// Setup file for Vitest - provides browser API polyfills for Node.js environment

// Polyfill Path2D for Node.js test environment
if (typeof Path2D === "undefined") {
  global.Path2D = class Path2D {
    constructor(path) {
      this.commands = [];
      if (path instanceof Path2D) {
        this.commands = [...path.commands];
      }
    }
    moveTo(x, y) {
      this.commands.push({ type: "moveTo", x, y });
    }
    lineTo(x, y) {
      this.commands.push({ type: "lineTo", x, y });
    }
    closePath() {
      this.commands.push({ type: "closePath" });
    }
    arc(x, y, radius, startAngle, endAngle, counterclockwise) {
      this.commands.push({
        type: "arc",
        x,
        y,
        radius,
        startAngle,
        endAngle,
        counterclockwise,
      });
    }
    arcTo(x1, y1, x2, y2, radius) {
      this.commands.push({ type: "arcTo", x1, y1, x2, y2, radius });
    }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      this.commands.push({
        type: "bezierCurveTo",
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        x,
        y,
      });
    }
    quadraticCurveTo(cpx, cpy, x, y) {
      this.commands.push({ type: "quadraticCurveTo", cpx, cpy, x, y });
    }
    rect(x, y, width, height) {
      this.commands.push({ type: "rect", x, y, width, height });
    }
  };
}

// Polyfill DOMPoint for Node.js test environment
if (typeof DOMPoint === "undefined") {
  global.DOMPoint = class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }

    matrixTransform(matrix) {
      const x = this.x * matrix.a + this.y * matrix.c + matrix.e;
      const y = this.x * matrix.b + this.y * matrix.d + matrix.f;
      return new DOMPoint(x, y, this.z, this.w);
    }
  };
}

// Polyfill DOMMatrix for Node.js test environment
if (typeof DOMMatrix === "undefined") {
  global.DOMMatrix = class DOMMatrix {
    constructor() {
      // Initialize as identity matrix
      this.a = 1; // scale x
      this.b = 0; // skew y
      this.c = 0; // skew x
      this.d = 1; // scale y
      this.e = 0; // translate x
      this.f = 0; // translate y
    }

    // Matrix multiplication: this * other
    multiply(other) {
      const result = new DOMMatrix();
      result.a = this.a * other.a + this.c * other.b;
      result.b = this.b * other.a + this.d * other.b;
      result.c = this.a * other.c + this.c * other.d;
      result.d = this.b * other.c + this.d * other.d;
      result.e = this.a * other.e + this.c * other.f + this.e;
      result.f = this.b * other.e + this.d * other.f + this.f;
      return result;
    }

    translate(x, y = 0) {
      const translation = new DOMMatrix();
      translation.e = x;
      translation.f = y;
      return this.multiply(translation);
    }

    scale(sx, sy = sx) {
      const scaling = new DOMMatrix();
      scaling.a = sx;
      scaling.d = sy;
      return this.multiply(scaling);
    }

    rotate(degrees) {
      const radians = (degrees * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      const rotation = new DOMMatrix();
      rotation.a = cos;
      rotation.b = sin;
      rotation.c = -sin;
      rotation.d = cos;
      return this.multiply(rotation);
    }
  };
}
