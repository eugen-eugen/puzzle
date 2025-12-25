// jigsawGenerator.js - waypoint-based jigsaw piece generation
// New implementation: Pieces are generated from a shared lattice of corner waypoints (c_*)
// and side waypoints (s_*) per user specification. Each internal edge has exactly one
// side waypoint displaced perpendicular to the edge; displacement direction establishes
// a bump/dent pairing shared by both adjacent pieces. All edges are rendered using
// straight line segments corner -> side waypoint -> next corner (no Bezier curves).
// Edge metadata (top/right/bottom/left) continues to use: +1 = bump (knob outward),
// -1 = dent (cavity inward), 0 = flat (outer border).

import { Piece } from "../model/piece.js";
import { Lattice } from "../geometry/lattice.js";
import { Point } from "../geometry/point.js";
import { boundingFrame } from "../geometry/polygon.js";
import { PIECES_GENERATED } from "../constants/custom-events.js";

// ================================
// Generation Constants (avoid magic numbers)
// ================================
const MIN_GRID_DIMENSION = 2;
const MAX_DEPTH_FACTOR = 0.18; // Relative to min(pieceW,pieceH)
const MIN_DEPTH_FACTOR = 0.1; // Relative to min(pieceW,pieceH)
const RANDOM_ROTATIONS = [0, 90, 180, 270];

/**
 * Generate interlocking jigsaw pieces for an image using waypoint lattice.
 * Creates pieces with automatically generated paths and bitmaps.
 * @param {HTMLImageElement} img - The source image to generate pieces from
 * @param {number} targetCount - Desired number of pieces (actual count may vary slightly)
 * @returns {{pieces: Piece[], rows: number, cols: number, actualCount: number}} Object containing generated pieces and grid dimensions
 */
export function generateJigsawPieces(img, targetCount) {
  // 1. Determine grid close to target count (preserve aspect ratio)
  var { cols, rows, actualCount } = calculateSizes(img, targetCount);
  window.dispatchEvent(
    new CustomEvent(PIECES_GENERATED, {
      detail: { totalPieces: actualCount },
    })
  );
  const pieceW = img.width / cols;
  const pieceH = img.height / rows;

  const maxDepth = MAX_DEPTH_FACTOR * Math.min(pieceW, pieceH); // base amplitude cap
  const minDepth = MIN_DEPTH_FACTOR * Math.min(pieceW, pieceH);

  // 2. Create lattice with all calculations performed automatically
  const geometry = new Lattice(
    rows,
    cols,
    img.width,
    img.height,
    minDepth,
    maxDepth
  );
  // Note: corners array has dimensions [rows+1][cols+1] because corners define
  // the vertices of the grid. For a grid of rows×cols pieces, we need (rows+1)
  // horizontal lines and (cols+1) vertical lines of corner points.
  const corners = geometry.getCorners(); // [rows+1][cols+1]
  const hSides = geometry.getHSides(); // [rows-1][cols] horizontal edges
  const vSides = geometry.getVSides(); // [rows][cols-1] vertical edges

  // 3. Build pieces using shared waypoints
  const pieces = [];
  let id = 0;

  // Offscreen master for image sampling
  const master = document.createElement("canvas");
  master.width = img.width;
  master.height = img.height;
  const mctx = master.getContext("2d");
  mctx.drawImage(img, 0, 0);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Calculate corner positions for this piece
      // Piece at grid position (r,c) uses corners from [r][c] to [r+1][c+1]
      // Since corners has dimensions [rows+1][cols+1], max indices [rows][cols]
      // are valid (when r=rows-1, c=cols-1, we access corners[rows][cols])
      const nw = corners[r][c];
      const ne = corners[r][c + 1];
      const se = corners[r + 1][c + 1];
      const sw = corners[r + 1][c];

      // Calculate side points for this piece from the shared lattice
      const geometrySidePoints = {
        north: r > 0 ? new Point(hSides[r - 1][c].x, hSides[r - 1][c].y) : null,
        east:
          c < cols - 1 && vSides[r][c]
            ? new Point(vSides[r][c].x, vSides[r][c].y)
            : null,
        south: r < rows - 1 ? new Point(hSides[r][c].x, hSides[r][c].y) : null,
        west:
          c > 0 && vSides[r][c - 1]
            ? new Point(vSides[r][c - 1].x, vSides[r][c - 1].y)
            : null,
      };

      // Calculate actual bounding frame directly from all corner and side points
      const allPoints = [nw, ne, se, sw];
      if (geometrySidePoints.north) allPoints.push(geometrySidePoints.north);
      if (geometrySidePoints.east) allPoints.push(geometrySidePoints.east);
      if (geometrySidePoints.south) allPoints.push(geometrySidePoints.south);
      if (geometrySidePoints.west) allPoints.push(geometrySidePoints.west);
      const frame = boundingFrame(allPoints);

      const pieceId = id++;
      const pieceData = {
        id: pieceId,
        gridX: c,
        gridY: r,
        w: frame.width,
        h: frame.height,
        imgX: nw.x,
        imgY: nw.y,
        rotation:
          RANDOM_ROTATIONS[Math.floor(Math.random() * RANDOM_ROTATIONS.length)],
        groupId: "g" + pieceId, // Each piece starts in its own group
        // Geometry data for calculation and path/bitmap generation
        geometryCorners: { nw, ne, se, sw },
        geometrySidePoints,
        nw,
        master, // Pass master canvas for bitmap generation
      };

      // Create piece instance with all properties and methods
      pieces.push(new Piece(pieceData));
    }
  }

  return { pieces, rows, cols, actualCount };
}

/**
 * Calculate grid dimensions and dispatch pieces generated event
 * @param {HTMLImageElement} img - The source image
 * @param {number} targetCount - Desired number of pieces
 * @returns {{cols: number, rows: number, actualCount: number}} Grid dimensions and actual piece count
 */
function calculateSizes(img, targetCount) {
  const aspect = img.width / img.height;
  let cols = Math.max(
    MIN_GRID_DIMENSION,
    Math.round(Math.sqrt(targetCount * aspect))
  );
  let rows = Math.max(MIN_GRID_DIMENSION, Math.round(targetCount / cols));
  while (rows * cols < targetCount) cols++;
  const actualCount = rows * cols;

  return { cols, rows, actualCount };
}
// NOTE: Future enhancements:
// - Vary knob shapes with random seeds
// - Precompute connection metadata (edge vectors & knob centers)
// - Generate simplified hit regions for performance
