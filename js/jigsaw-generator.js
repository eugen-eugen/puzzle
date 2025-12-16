// jigsawGenerator.js - waypoint-based jigsaw piece generation
// New implementation: Pieces are generated from a shared lattice of corner waypoints (c_*)
// and side waypoints (s_*) per user specification. Each internal edge has exactly one
// side waypoint displaced perpendicular to the edge; displacement direction establishes
// a bump/dent pairing shared by both adjacent pieces. All edges are rendered using
// straight line segments corner -> side waypoint -> next corner (no Bezier curves).
// Edge metadata (top/right/bottom/left) continues to use: +1 = bump (knob outward),
// -1 = dent (cavity inward), 0 = flat (outer border).

import { Piece } from "./model/piece.js";
import { Lattice } from "./geometry/lattice.js";
import { Point } from "./geometry/point.js";

// ================================
// Generation Constants (avoid magic numbers)
// ================================
const MIN_GRID_DIMENSION = 2;
const MAX_DEPTH_FACTOR = 0.18; // Relative to min(pieceW,pieceH)
const MIN_DEPTH_FACTOR = 0.1; // Relative to min(pieceW,pieceH)
const DEBUG_OUTLINE_COLOR = "#ff00aa";
const DEBUG_OUTLINE_WIDTH = 1.25;
const RANDOM_ROTATIONS = [0, 90, 180, 270];

/**
 * Generate interlocking jigsaw pieces for an image using waypoint lattice.
 * @param {HTMLImageElement} img
 * @param {number} targetCount
 * @returns {{pieces:Array, rows:number, cols:number, actualCount:number}}
 */
export function generateJigsawPieces(img, targetCount) {
  // 1. Determine grid close to target count (preserve aspect ratio)
  const aspect = img.width / img.height;
  let cols = Math.max(
    MIN_GRID_DIMENSION,
    Math.round(Math.sqrt(targetCount * aspect))
  );
  let rows = Math.max(MIN_GRID_DIMENSION, Math.round(targetCount / cols));
  while (rows * cols < targetCount) cols++;
  const actualCount = rows * cols;

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
  const corners = geometry.getCorners();
  const hSides = geometry.getHSides();
  const vSides = geometry.getVSides();

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

      // Create temporary piece to calculate bounding frame with geometry data
      const tempPiece = new Piece({
        id: -1,
        gridX: c,
        gridY: r,
        geometryCorners: { nw, ne, se, sw },
        geometrySidePoints,
        nw,
        w: pieceW, // fallback values
        h: pieceH,
      });

      // Calculate actual bounding frame that includes all corner and side points
      const boundingFrame = tempPiece.calculateBoundingFrame();
      const actualPieceW = boundingFrame.width;
      const actualPieceH = boundingFrame.height;

      const path = Lattice.createPiecePath(
        r,
        c,
        tempPiece.corners,
        tempPiece.sPoints
      );
      // Use bounding frame dimensions directly for canvas
      const pw = Math.ceil(actualPieceW);
      const ph = Math.ceil(actualPieceH);
      const canvas = document.createElement("canvas");
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext("2d");
      ctx.save();
      // Center the bounding frame in the canvas
      ctx.translate(-boundingFrame.topLeft.x, -boundingFrame.topLeft.y);
      ctx.clip(path);
      // Compute source rect based on actual piece boundaries
      const minX = boundingFrame.topLeft.x + nw.x;
      const maxX = boundingFrame.bottomRight.x + nw.x;
      const minY = boundingFrame.topLeft.y + nw.y;
      const maxY = boundingFrame.bottomRight.y + nw.y;

      let srcX = minX;
      let srcY = minY;
      let srcW = maxX - minX;
      let srcH = maxY - minY;

      // Clamp to master image bounds
      const clipX = Math.max(0, srcX);
      const clipY = Math.max(0, srcY);
      const clipW = Math.min(srcW, master.width - clipX);
      const clipH = Math.min(srcH, master.height - clipY);

      // Adjust destination offset to align clipped region correctly with centered frame
      // After translation, coordinate system is offset by (-boundingFrame.topLeft.x, -boundingFrame.topLeft.y)
      // So destination should be relative to the piece's corner position
      const dx = clipX - nw.x;
      const dy = clipY - nw.y;
      ctx.drawImage(master, clipX, clipY, clipW, clipH, dx, dy, clipW, clipH);
      ctx.restore();
      // Debug outline (optional)
      ctx.save();
      ctx.translate(-boundingFrame.topLeft.x, -boundingFrame.topLeft.y);
      ctx.strokeStyle = DEBUG_OUTLINE_COLOR;
      ctx.lineWidth = DEBUG_OUTLINE_WIDTH;
      ctx.stroke(path);
      ctx.restore();

      const pieceId = id++;
      const pieceData = {
        id: pieceId,
        gridX: c,
        gridY: r,
        w: actualPieceW,
        h: actualPieceH,
        imgX: nw.x,
        imgY: nw.y,
        rotation:
          RANDOM_ROTATIONS[Math.floor(Math.random() * RANDOM_ROTATIONS.length)],
        path,
        bitmap: canvas,
        groupId: "g" + pieceId, // Each piece starts in its own group
        // Geometry data for calculation
        geometryCorners: { nw, ne, se, sw },
        geometrySidePoints,
        nw,
      };

      // Create piece instance with all properties and methods
      pieces.push(new Piece(pieceData));
    }
  }

  return { pieces, rows, cols, actualCount };
}

// NOTE: Future enhancements:
// - Vary knob shapes with random seeds
// - Precompute connection metadata (edge vectors & knob centers)
// - Generate simplified hit regions for performance
