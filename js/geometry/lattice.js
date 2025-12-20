// geometry/lattice.js - Corner lattice and side waypoint generation for jigsaw puzzles
// Handles corner lattice building, side waypoint generation, and related calculations

import { Point } from "./point.js";
import { Util } from "../utils/numeric-util.js";

// ================================
// Lattice Constants
// ================================
const KNOB = 1; // Outward bump orientation
const DENT = -1; // Inward cavity orientation
const WAYPOINT_OFFSET_RANGE = 0.25; // Waypoint offset range (both directions)
const CAVITY_DEPTH_CAP_RELATIVE_TO_MIN = 0.25; // Clamp depth to this * min(w,h)
const CAVITY_DEPTH_CAP_EDGE_FRACTION = 0.5; // Clamp depth to this fraction of edge length
const CUT_RANDOMNESS_FACTOR = 0.3; // randomness for cut line positions

export class Lattice {
  constructor(rows, cols, imgWidth, imgHeight, minDepth, maxDepth) {
    this.rows = rows;
    this.cols = cols;
    this.imgWidth = imgWidth;
    this.imgHeight = imgHeight;
    this.pieceW = imgWidth / cols;
    this.pieceH = imgHeight / rows;

    // Orientation balance tracking
    this.totalInternalEdges = (rows - 1) * cols + (cols - 1) * rows;
    this.positiveTarget = this.totalInternalEdges / 2;
    this.posCount = 0;

    // Build geometry automatically on construction
    this.corners = this.buildCornerLattice();
    const { hSides, vSides } = this.generateInternalEdges(minDepth, maxDepth);
    this.hSides = hSides;
    this.vSides = vSides;
  }

  /**
   * Choose orientation for a puzzle piece edge (knob/cavity direction).
   * Maintains approximately 50/50 distribution of KNOB and DENT orientations
   * across all internal edges to ensure balanced puzzle geometry.
   * @returns {number} KNOB (1) for outward bump, DENT (-1) for inward cavity
   */
  chooseOrientation() {
    // Maintain ~50/50 distribution; if one side exceeds target, flip.
    const remaining = this.totalInternalEdges - this.posCount;
    const needPos = this.positiveTarget - this.posCount;
    const bias = needPos / Math.max(1, remaining); // desired fraction of remaining that should be positive
    if (Math.random() < bias) {
      this.posCount++;
      return KNOB;
    }
    return DENT;
  }

  /**
   * Split a segment into n+1 random sub-segments.
   * @param {number} length - Total length of the segment
   * @param {number} n - Number of split points to generate
   * @returns {number[]} Array of n positions along the segment
   */
  splitSegment(length, n) {
    if (n === 0) return [];

    const positions = [];
    for (let i = 1; i <= n; i++) {
      const idealPosition = (i / (n + 1)) * length;
      const maxDeviation = (length / (n + 1)) * CUT_RANDOMNESS_FACTOR;
      positions.push(
        idealPosition + Util.symmetricRandomDeviation(maxDeviation)
      );
    }

    return positions;
  }

  buildCornerLattice() {
    // Generate random points on opposite sides for vertical cuts (cols-1 internal cuts)
    const northPoints = this.splitSegment(this.imgWidth, this.cols - 1);
    const southPoints = this.splitSegment(this.imgWidth, this.cols - 1);

    // Generate random points on opposite sides for horizontal cuts (rows-1 internal cuts)
    const westPoints = this.splitSegment(this.imgHeight, this.rows - 1);
    const eastPoints = this.splitSegment(this.imgHeight, this.rows - 1);

    // Build corner lattice by calculating intersections
    const corners = Array(this.rows + 1)
      .fill(0)
      .map(() => Array(this.cols + 1));

    // Set the four image corners
    corners[0][0] = new Point(0, 0);
    corners[0][this.cols] = new Point(this.imgWidth, 0);
    corners[this.rows][0] = new Point(0, this.imgHeight);
    corners[this.rows][this.cols] = new Point(this.imgWidth, this.imgHeight);

    // North and South edges (top and bottom borders)
    for (let c = 1; c < this.cols; c++) {
      // Top edge (north)
      corners[0][c] = new Point(northPoints[c - 1], 0);
      // Bottom edge (south)
      corners[this.rows][c] = new Point(southPoints[c - 1], this.imgHeight);
    }

    // West and East edges (left and right borders)
    for (let r = 1; r < this.rows; r++) {
      // Left edge (west)
      corners[r][0] = new Point(0, westPoints[r - 1]);
      // Right edge (east)
      corners[r][this.cols] = new Point(this.imgWidth, eastPoints[r - 1]);
    }

    // Interior intersections - where horizontal and vertical cut lines meet
    for (let r = 1; r < this.rows; r++) {
      for (let c = 1; c < this.cols; c++) {
        // Vertical cut line points
        const vTop = new Point(northPoints[c - 1], 0);
        const vBottom = new Point(southPoints[c - 1], this.imgHeight);
        // Horizontal cut line points
        const hLeft = new Point(0, westPoints[r - 1]);
        const hRight = new Point(this.imgWidth, eastPoints[r - 1]);

        const intersection = this.calculateLineIntersection(
          vTop,
          vBottom,
          hLeft,
          hRight
        );
        corners[r][c] = intersection;
      }
    }

    return corners;
  }

  /**
   * Calculate intersection point of two lines.
   * @param {Point} a - First point of first line
   * @param {Point} b - Second point of first line
   * @param {Point} c - First point of second line
   * @param {Point} d - Second point of second line
   * @returns {Point} Intersection point, or null if lines are parallel
   */
  calculateLineIntersection(a, b, c, d) {
    // Calculate intersection using line equation
    const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);

    if (Math.abs(denom) < 1e-10) {
      // Lines are parallel, return null
      return null;
    }

    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;

    const x = a.x + t * (b.x - a.x);
    const y = a.y + t * (b.y - a.y);

    return new Point(x, y);
  }

  deviatePoint(a, b, waypointOffsetRange) {
    const tOffset = Util.symmetricRandomDeviation(waypointOffsetRange);
    const t = 0.5 + tOffset;
    return a.add(b.sub(a).scaled(t));
  }

  clampDepthForCavity(localDepth, edgeLength) {
    return Math.min(
      localDepth,
      CAVITY_DEPTH_CAP_RELATIVE_TO_MIN * Math.min(this.pieceW, this.pieceH),
      CAVITY_DEPTH_CAP_EDGE_FRACTION * edgeLength
    );
  }

  generateInternalEdges(minDepth, maxDepth) {
    if (!this.corners) {
      throw new Error(
        "Corner lattice must be built before generating internal edges"
      );
    }

    // Initialize side arrays
    const hSides = Array(this.rows - 1)
      .fill(0)
      .map(() => Array(this.cols));
    const vSides = Array(this.rows)
      .fill(0)
      .map(() => Array(this.cols - 1));

    // Generate horizontal internal edges
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols; c++) {
        const A = this.corners[r + 1][c];
        const B = this.corners[r + 1][c + 1];
        const edgeLen = this.pieceW;
        const basePoint = this.deviatePoint(A, B, WAYPOINT_OFFSET_RANGE);
        const orientation = this.chooseOrientation();
        let depth = minDepth + Math.random() * (maxDepth - minDepth);
        if (orientation === DENT)
          depth = this.clampDepthForCavity(depth, edgeLen);
        const y = basePoint.y + orientation * depth;
        hSides[r][c] = {
          x: basePoint.x,
          y,
          orientation,
        };
      }
    }

    // Generate vertical internal edges
    for (let r = 0; r < this.rows; r++) {
      if (this.cols - 1 <= 0) break;
      for (let c = 0; c < this.cols - 1; c++) {
        const A = this.corners[r][c + 1];
        const B = this.corners[r + 1]
          ? this.corners[r + 1][c + 1]
          : { x: A.x, y: A.y + this.pieceH };
        const edgeLen = this.pieceH;
        const basePoint = this.deviatePoint(A, B, WAYPOINT_OFFSET_RANGE);
        const orientation = this.chooseOrientation();
        let depth = minDepth + Math.random() * (maxDepth - minDepth);
        if (orientation === DENT)
          depth = this.clampDepthForCavity(depth, edgeLen);
        const x = basePoint.x + orientation * depth;
        vSides[r][c] = {
          x,
          y: basePoint.y,
          orientation,
        };
      }
    }

    return { hSides, vSides };
  }

  getCorners() {
    return this.corners;
  }

  getHSides() {
    return this.hSides;
  }

  getVSides() {
    return this.vSides;
  }
}
