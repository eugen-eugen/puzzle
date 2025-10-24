// jigsawGenerator.js - waypoint-based jigsaw piece generation
// New implementation: Pieces are generated from a shared lattice of corner waypoints (c_*)
// and side waypoints (s_*) per user specification. Each internal edge has exactly one
// side waypoint displaced perpendicular to the edge; displacement direction establishes
// a bump/dent pairing shared by both adjacent pieces. All edges are rendered using
// straight line segments corner -> side waypoint -> next corner (no Bezier curves).
// Edge metadata (top/right/bottom/left) continues to use: +1 = bump (knob outward),
// -1 = dent (cavity inward), 0 = flat (outer border).

// ================================
// Generation Constants (avoid magic numbers)
// ================================
const MIN_GRID_DIMENSION = 2;
const MAX_DEPTH_FACTOR = 0.18; // Relative to min(pieceW,pieceH)
const MIN_DEPTH_FACTOR = 0.1; // Relative to min(pieceW,pieceH)
const WAYPOINT_OFFSET_RANGE = 0.25; // Waypoint offset range (both directions)
const CAVITY_DEPTH_CAP_RELATIVE_TO_MIN = 0.25; // Clamp depth to this * min(w,h)
const CAVITY_DEPTH_CAP_EDGE_FRACTION = 0.5; // Clamp depth to this fraction of edge length
const PAD_EXTRA_FACTOR = 1.25; // Extra factor on maxDepth when computing pad
const PAD_EXTRA_PIXELS = 6; // Extra pixels beyond scaled depth
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

  // 2. Build corner lattice (global coordinates)
  const corners = Array(rows + 1)
    .fill(0)
    .map((_, r) =>
      Array(cols + 1)
        .fill(0)
        .map((__, c) => ({ x: c * pieceW, y: r * pieceH }))
    );

  // 3. Internal side waypoints for horizontal (between row r and r+1) and vertical (between col c and c+1)
  //    Each waypoint record: { x, y, orientation, axis, tOffset, depth }
  const hSides = Array(rows - 1)
    .fill(0)
    .map(() => Array(cols)); // index: hSides[r][c] edge between row r and r+1 above column c
  const vSides = Array(rows)
    .fill(0)
    .map(() => Array(cols - 1)); // index: vSides[r][c] edge between col c and c+1 at row r

  // Orientation balance tracking
  let totalInternalEdges = (rows - 1) * cols + (cols - 1) * rows;
  let positiveTarget = totalInternalEdges / 2;
  let posCount = 0;

  function chooseOrientation() {
    // Maintain ~50/50 distribution; if one side exceeds target, flip.
    const remaining = totalInternalEdges - (posCount + 0);
    const needPos = positiveTarget - posCount;
    const bias = needPos / Math.max(1, remaining); // desired fraction of remaining that should be positive
    if (Math.random() < bias) {
      posCount++;
      return 1; // +1
    }
    return -1;
  }

  const maxDepth = MAX_DEPTH_FACTOR * Math.min(pieceW, pieceH); // base amplitude cap
  const minDepth = MIN_DEPTH_FACTOR * Math.min(pieceW, pieceH);

  // Helper to clamp cavity so it does not cross diagonals inside a piece
  function clampDepthForCavity(localDepth, edgeLength) {
    return Math.min(
      localDepth,
      CAVITY_DEPTH_CAP_RELATIVE_TO_MIN * Math.min(pieceW, pieceH),
      CAVITY_DEPTH_CAP_EDGE_FRACTION * edgeLength
    );
  }

  // Horizontal internal edges
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const A = corners[r + 1][c]; // top-left of lower piece / bottom-left of upper piece
      const B = corners[r + 1][c + 1];
      const edgeLen = pieceW;
      const tOffset =
        Math.random() * (WAYPOINT_OFFSET_RANGE * 2) - WAYPOINT_OFFSET_RANGE; // [-range, range]
      const t = 0.5 + tOffset;
      const baseX = A.x + (B.x - A.x) * t;
      const baseY = A.y; // horizontal line
      const orientation = chooseOrientation(); // +1 = shift downward
      let depth = minDepth + Math.random() * (maxDepth - minDepth);
      // If orientation is upward (cavity for lower piece, bump for upper) clamp depth conservatively
      if (orientation === -1) depth = clampDepthForCavity(depth, edgeLen);
      const y = baseY + orientation * depth;
      hSides[r][c] = {
        x: baseX,
        y,
        orientation,
        axis: "h",
        tOffset,
        depth,
      };
    }
  }

  // Vertical internal edges
  for (let r = 0; r < rows; r++) {
    if (cols - 1 <= 0) break;
    for (let c = 0; c < cols - 1; c++) {
      const A = corners[r][c + 1];
      const B = corners[r + 1]
        ? corners[r + 1][c + 1]
        : { x: A.x, y: A.y + pieceH }; // safe guard
      const edgeLen = pieceH;
      const tOffset =
        Math.random() * (WAYPOINT_OFFSET_RANGE * 2) - WAYPOINT_OFFSET_RANGE;
      const t = 0.5 + tOffset;
      const baseY = A.y + (B.y - A.y) * t;
      const baseX = A.x; // vertical line
      const orientation = chooseOrientation(); // +1 = shift rightward
      let depth = minDepth + Math.random() * (maxDepth - minDepth);
      if (orientation === -1) depth = clampDepthForCavity(depth, edgeLen);
      const x = baseX + orientation * depth;
      vSides[r][c] = {
        x,
        y: baseY,
        orientation,
        axis: "v",
        tOffset,
        depth,
      };
    }
  }

  // 4. Build pieces using shared waypoints
  const pieces = [];
  let id = 0;

  // Offscreen master for image sampling
  const master = document.createElement("canvas");
  master.width = img.width;
  master.height = img.height;
  const mctx = master.getContext("2d");
  mctx.drawImage(img, 0, 0);

  function piecePath(r, c) {
    const originX = c * pieceW;
    const originY = r * pieceH;
    const path = new Path2D();
    // Gather local points (converted to local piece coordinates)
    const c_nw = corners[r][c];
    const c_ne = corners[r][c + 1];
    const c_se = corners[r + 1][c + 1];
    const c_sw = corners[r + 1][c];
    const pts = [];
    // Start NW corner
    pts.push({ x: c_nw.x - originX, y: c_nw.y - originY });
    // Top edge
    if (r > 0) {
      const wp = hSides[r - 1][c];
      pts.push({ x: wp.x - originX, y: wp.y - originY });
    }
    pts.push({ x: c_ne.x - originX, y: c_ne.y - originY });
    // Right edge
    if (c < cols - 1) {
      const wp = vSides[r][c];
      if (wp) pts.push({ x: wp.x - originX, y: wp.y - originY });
    }
    pts.push({ x: c_se.x - originX, y: c_se.y - originY });
    // Bottom edge
    if (r < rows - 1) {
      const wp = hSides[r][c];
      if (wp) pts.push({ x: wp.x - originX, y: wp.y - originY });
    }
    pts.push({ x: c_sw.x - originX, y: c_sw.y - originY });
    // Left edge
    if (c > 0) {
      const wp = vSides[r][c - 1];
      if (wp) pts.push({ x: wp.x - originX, y: wp.y - originY });
    }
    // Build path
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.closePath();
    return path;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const path = piecePath(r, c);
      // Padding: allow for outward bumps on any side; expand symmetric
      const pad = Math.ceil(maxDepth * PAD_EXTRA_FACTOR + PAD_EXTRA_PIXELS); // slightly larger than maxDepth
      const pw = Math.ceil(pieceW + pad * 2);
      const ph = Math.ceil(pieceH + pad * 2);
      const canvas = document.createElement("canvas");
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.translate(pad, pad);
      ctx.clip(path);
      // Compute source rect (expand fully by pad on each side)
      let srcX = c * pieceW - pad;
      let srcY = r * pieceH - pad;
      let srcW = pieceW + pad * 2;
      let srcH = pieceH + pad * 2;
      // Clamp to master image bounds
      const clipX = Math.max(0, srcX);
      const clipY = Math.max(0, srcY);
      const clipW = Math.min(srcW, master.width - clipX);
      const clipH = Math.min(srcH, master.height - clipY);
      // Adjust destination offset to align clipped region correctly relative to piece local coordinates.
      const dx = clipX - c * pieceW;
      const dy = clipY - r * pieceH;
      ctx.drawImage(master, clipX, clipY, clipW, clipH, dx, dy, clipW, clipH);
      ctx.restore();
      // Debug outline (optional)
      ctx.save();
      ctx.translate(pad, pad);
      ctx.strokeStyle = DEBUG_OUTLINE_COLOR;
      ctx.lineWidth = DEBUG_OUTLINE_WIDTH;
      ctx.stroke(path);
      ctx.restore();

      // Edge metadata mapping based on orientation signs
      let north = 0,
        south = 0,
        west = 0,
        east = 0;
      if (r > 0) {
        const o = hSides[r - 1][c].orientation; // +1 shifted downward
        // For this piece (below the edge), downward shift is cavity => dent; upward shift is bump
        north = o === -1 ? 1 : -1;
      }
      if (r < rows - 1) {
        const o = hSides[r][c].orientation; // +1 downward
        // For this piece (above the edge), downward shift is bump
        south = o === 1 ? 1 : -1;
      }
      if (c > 0) {
        const o = vSides[r][c - 1].orientation; // +1 shift rightward
        // For this piece (to right of the edge), rightward shift is cavity -> dent
        west = o === -1 ? 1 : -1;
      }
      if (c < cols - 1) {
        const o = vSides[r][c].orientation; // +1 shift rightward
        // For this piece (to left), rightward shift is bump
        east = o === 1 ? 1 : -1;
      }

      const pieceId = id++;
      pieces.push({
        id: pieceId,
        gridX: c,
        gridY: r,
        w: pieceW,
        h: pieceH,
        imgX: c * pieceW,
        imgY: r * pieceH,
        rotation:
          RANDOM_ROTATIONS[Math.floor(Math.random() * RANDOM_ROTATIONS.length)],
        path,
        bitmap: canvas,
        pad,
        edges: { north, east, south, west },
        groupId: "g" + pieceId, // Each piece starts in its own group
        // Geometry waypoints (local coordinates BEFORE pad translation)
        corners: {
          nw: { x: 0, y: 0 },
          ne: { x: pieceW, y: 0 },
          se: { x: pieceW, y: pieceH },
          sw: { x: 0, y: pieceH },
        },
        sPoints: {
          north:
            r > 0
              ? {
                  x: hSides[r - 1][c].x - c * pieceW,
                  y: hSides[r - 1][c].y - r * pieceH,
                }
              : null,
          east:
            c < cols - 1
              ? {
                  x: vSides[r][c].x - c * pieceW,
                  y: vSides[r][c].y - r * pieceH,
                }
              : null,
          south:
            r < rows - 1
              ? {
                  x: hSides[r][c].x - c * pieceW,
                  y: hSides[r][c].y - r * pieceH,
                }
              : null,
          west:
            c > 0
              ? {
                  x: vSides[r][c - 1].x - c * pieceW,
                  y: vSides[r][c - 1].y - r * pieceH,
                }
              : null,
        },
      });
    }
  }

  return { pieces, rows, cols, actualCount };
}

// NOTE: Future enhancements:
// - Vary knob shapes with random seeds
// - Precompute connection metadata (edge vectors & knob centers)
// - Generate simplified hit regions for performance
