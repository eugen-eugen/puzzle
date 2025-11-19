// geometry/geometry.js - Geometric calculations for jigsaw puzzle generation
// Handles corner lattice building, side waypoint generation, and related calculations

import { Point } from "./point.js";

// ================================
// Geometry Constants
// ================================
const WAYPOINT_OFFSET_RANGE = 0.25; // Waypoint offset range (both directions)
const CAVITY_DEPTH_CAP_RELATIVE_TO_MIN = 0.25; // Clamp depth to this * min(w,h)
const CAVITY_DEPTH_CAP_EDGE_FRACTION = 0.5; // Clamp depth to this fraction of edge length
const CUT_RANDOMNESS_FACTOR = 0.3; // randomness for cut line positions

export class Geometry {
  constructor(
    rows,
    cols,
    pieceW,
    pieceH,
    imgWidth,
    imgHeight,
    minDepth,
    maxDepth
  ) {
    this.rows = rows;
    this.cols = cols;
    this.pieceW = pieceW;
    this.pieceH = pieceH;
    this.imgWidth = imgWidth;
    this.imgHeight = imgHeight;

    // Orientation balance tracking
    this.totalInternalEdges = (rows - 1) * cols + (cols - 1) * rows;
    this.positiveTarget = this.totalInternalEdges / 2;
    this.posCount = 0;

    // Build geometry automatically on construction
    this.corners = this.buildCornerLattice();
    const { hSides, vSides } = this.generateInternalEdges(
      "both",
      minDepth,
      maxDepth
    );
    this.hSides = hSides;
    this.vSides = vSides;
  }

  chooseOrientation() {
    // Maintain ~50/50 distribution; if one side exceeds target, flip.
    const remaining = this.totalInternalEdges - (this.posCount + 0);
    const needPos = this.positiveTarget - this.posCount;
    const bias = needPos / Math.max(1, remaining); // desired fraction of remaining that should be positive
    if (Math.random() < bias) {
      this.posCount++;
      return 1; // +1
    }
    return -1;
  }

  buildCornerLattice() {
    // Generate random points on opposite sides for vertical cuts (cols-1 internal cuts)
    const northPoints = []; // Points on top edge (y=0)
    const southPoints = []; // Points on bottom edge (y=imgHeight)

    for (let c = 1; c < this.cols; c++) {
      const idealX = c * this.pieceW; // Perfect grid position
      const maxDeviation = this.pieceW * CUT_RANDOMNESS_FACTOR;

      const northX = idealX + (Math.random() - 0.5) * 2 * maxDeviation;
      const southX = idealX + (Math.random() - 0.5) * 2 * maxDeviation;

      // Clamp to image bounds with small margin
      northPoints.push(
        Math.max(
          this.pieceW * 0.1,
          Math.min(this.imgWidth - this.pieceW * 0.1, northX)
        )
      );
      southPoints.push(
        Math.max(
          this.pieceW * 0.1,
          Math.min(this.imgWidth - this.pieceW * 0.1, southX)
        )
      );
    }

    // Generate random points on opposite sides for horizontal cuts (rows-1 internal cuts)
    const westPoints = []; // Points on left edge (x=0)
    const eastPoints = []; // Points on right edge (x=imgWidth)

    for (let r = 1; r < this.rows; r++) {
      const idealY = r * this.pieceH; // Perfect grid position
      const maxDeviation = this.pieceH * CUT_RANDOMNESS_FACTOR;

      const westY = idealY + (Math.random() - 0.5) * 2 * maxDeviation;
      const eastY = idealY + (Math.random() - 0.5) * 2 * maxDeviation;

      // Clamp to image bounds with small margin
      westPoints.push(
        Math.max(
          this.pieceH * 0.1,
          Math.min(this.imgHeight - this.pieceH * 0.1, westY)
        )
      );
      eastPoints.push(
        Math.max(
          this.pieceH * 0.1,
          Math.min(this.imgHeight - this.pieceH * 0.1, eastY)
        )
      );
    }

    // Build corner lattice by calculating intersections
    const corners = Array(this.rows + 1)
      .fill(0)
      .map(() => Array(this.cols + 1));

    for (let r = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++) {
        let x, y;

        // Corner cases (literal corners of the image)
        if ((r === 0 || r === this.rows) && (c === 0 || c === this.cols)) {
          x = c === 0 ? 0 : this.imgWidth;
          y = r === 0 ? 0 : this.imgHeight;
        }
        // Border points (edges of the image)
        else if (r === 0) {
          // Top border - intersection with vertical cut line
          x = this.getCutPosition(
            c,
            northPoints,
            southPoints,
            0,
            this.imgWidth,
            this.cols
          );
          y = 0;
        } else if (r === this.rows) {
          // Bottom border - intersection with vertical cut line
          x = this.getCutPosition(
            c,
            northPoints,
            southPoints,
            this.imgHeight,
            this.imgWidth,
            this.cols
          );
          y = this.imgHeight;
        } else if (c === 0) {
          // Left border - intersection with horizontal cut line
          x = 0;
          y = this.getCutPosition(
            r,
            westPoints,
            eastPoints,
            0,
            this.imgHeight,
            this.rows
          );
        } else if (c === this.cols) {
          // Right border - intersection with horizontal cut line
          x = this.imgWidth;
          y = this.getCutPosition(
            r,
            westPoints,
            eastPoints,
            this.imgWidth,
            this.imgHeight,
            this.rows
          );
        }
        // Interior intersections - where horizontal and vertical cut lines meet
        else {
          const intersection = this.calculateLineIntersection(
            r,
            c,
            northPoints,
            southPoints,
            westPoints,
            eastPoints
          );
          x = intersection.x;
          y = intersection.y;
        }

        corners[r][c] = new Point(x, y);
      }
    }

    return corners;
  }

  calculateLineIntersection(
    r,
    c,
    northPoints,
    southPoints,
    westPoints,
    eastPoints
  ) {
    // Vertical cut line (c-1 because cut lines are indexed from 0)
    const vx1 = northPoints[c - 1];
    const vy1 = 0;
    const vx2 = southPoints[c - 1];
    const vy2 = this.imgHeight;

    // Horizontal cut line (r-1 because cut lines are indexed from 0)
    const hx1 = 0;
    const hy1 = westPoints[r - 1];
    const hx2 = this.imgWidth;
    const hy2 = eastPoints[r - 1];

    // Calculate intersection using line equation
    const denom = (vx1 - vx2) * (hy1 - hy2) - (vy1 - vy2) * (hx1 - hx2);

    if (Math.abs(denom) < 1e-10) {
      // Lines are parallel, use grid intersection as fallback
      return new Point(
        c * (this.imgWidth / this.cols),
        r * (this.imgHeight / this.rows)
      );
    }

    const t = ((vx1 - hx1) * (hy1 - hy2) - (vy1 - hy1) * (hx1 - hx2)) / denom;

    const x = vx1 + t * (vx2 - vx1);
    const y = vy1 + t * (vy2 - vy1);

    return new Point(x, y);
  }

  getCutPosition(
    index,
    startPoints,
    endPoints,
    position,
    maxDimension,
    maxIndex
  ) {
    if (index === 0) return 0;
    if (index === maxIndex) return maxDimension;

    // position is either 0 (start edge) or maxDimension (end edge)
    return position === 0 ? startPoints[index - 1] : endPoints[index - 1];
  }

  deviatePoint(a, b, waypointOffsetRange) {
    const tOffset =
      Math.random() * (waypointOffsetRange * 2) - waypointOffsetRange;
    const t = 0.5 + tOffset;
    const baseX = a.x + (b.x - a.x) * t;
    const baseY = a.y + (b.y - a.y) * t;
    return new Point(baseX, baseY);
  }

  clampDepthForCavity(localDepth, edgeLength) {
    return Math.min(
      localDepth,
      CAVITY_DEPTH_CAP_RELATIVE_TO_MIN * Math.min(this.pieceW, this.pieceH),
      CAVITY_DEPTH_CAP_EDGE_FRACTION * edgeLength
    );
  }

  generateInternalEdges(type, minDepth, maxDepth) {
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
    if (type === "horizontal" || type === "both") {
      for (let r = 0; r < this.rows - 1; r++) {
        for (let c = 0; c < this.cols; c++) {
          const A = this.corners[r + 1][c];
          const B = this.corners[r + 1][c + 1];
          const edgeLen = this.pieceW;
          const basePoint = this.deviatePoint(A, B, WAYPOINT_OFFSET_RANGE);
          const orientation = this.chooseOrientation();
          let depth = minDepth + Math.random() * (maxDepth - minDepth);
          if (orientation === -1)
            depth = this.clampDepthForCavity(depth, edgeLen);
          const y = basePoint.y + orientation * depth;
          hSides[r][c] = {
            x: basePoint.x,
            y,
            orientation,
            axis: "h",
            tOffset: (basePoint.x - (A.x + B.x) / 2) / (B.x - A.x || 1),
            depth,
          };
        }
      }
    }

    // Generate vertical internal edges
    if (type === "vertical" || type === "both") {
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
          if (orientation === -1)
            depth = this.clampDepthForCavity(depth, edgeLen);
          const x = basePoint.x + orientation * depth;
          vSides[r][c] = {
            x,
            y: basePoint.y,
            orientation,
            axis: "v",
            tOffset: (basePoint.y - (A.y + B.y) / 2) / (B.y - A.y || 1),
            depth,
          };
        }
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

  /**
   * Generate Path2D from piece corners and side points
   * @param {number} r - Row index (for debugging)
   * @param {number} c - Column index (for debugging)
   * @param {Object} pieceCorners - Corner points {nw, ne, se, sw}
   * @param {Object} pieceSidePoints - Side points {north, east, south, west}
   * @returns {Path2D} Generated path
   */
  static createPiecePath(r, c, pieceCorners, pieceSidePoints) {
    const path = new Path2D();
    const pts = [];

    // Start with NW corner (at origin)
    pts.push(pieceCorners.nw);

    // Top edge
    if (pieceSidePoints.north) {
      pts.push(pieceSidePoints.north);
    }
    pts.push(pieceCorners.ne);

    // Right edge
    if (pieceSidePoints.east) {
      pts.push(pieceSidePoints.east);
    }
    pts.push(pieceCorners.se);

    // Bottom edge
    if (pieceSidePoints.south) {
      pts.push(pieceSidePoints.south);
    }
    pts.push(pieceCorners.sw);

    // Left edge
    if (pieceSidePoints.west) {
      pts.push(pieceSidePoints.west);
    }

    // Build path
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.closePath();
    return path;
  }
}
