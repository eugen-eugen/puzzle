// connectionManager.js - geometric connection detection & grouping
// Implements matching rules defined in GAME_SPECIFICATION.md
// Using single CONNECTION_TOLERANCE for squared distance comparisons.

import { state, connectPieces } from "./gameEngine.js";
import { updateProgress, getCurrentZoom } from "./app.js";

// Public configuration (can be overridden during init)
const CONFIG = {
  CONNECTION_TOLERANCE: 900, // squared px distance (e.g. 30px^2 default) - tune later
  ALIGNMENT_TOLERANCE: 900,
};

let spatialIndex = null;
let getPieceById = null;
let onHighlightChange = () => {};
let pieceElementsAccessor = null; // function(id) -> HTMLElement

let currentHighlight = null; // { pieceId, sideName, mapping }

function dist2(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return dx * dx + dy * dy;
}

function rotatePoint(px, py, cx, cy, rad) {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Computes the world-space coordinates for the corners and side points of a puzzle piece,
 * taking into account its position, scale, rotation, and padding.
 *
 * @param {Object} piece - The puzzle piece object.
 * @param {Object} piece.bitmap - The bitmap image of the piece.
 * @param {number} piece.bitmap.width - The width of the bitmap.
 * @param {number} piece.bitmap.height - The height of the bitmap.
 * @param {number} piece.pad - The padding applied to the piece.
 * @param {number} piece.displayX - The X coordinate of the piece's display position.
 * @param {number} piece.displayY - The Y coordinate of the piece's display position.
 * @param {number} piece.rotation - The rotation of the piece in degrees.
 * @param {number} [piece.scale=0.35] - The scale factor applied to the piece.
 * @param {Object} piece.corners - The local coordinates of the piece's corners.
 * @param {Object} piece.corners.nw - The northwest corner point {x, y}.
 * @param {Object} piece.corners.ne - The northeast corner point {x, y}.
 * @param {Object} piece.corners.se - The southeast corner point {x, y}.
 * @param {Object} piece.corners.sw - The southwest corner point {x, y}.
 * @param {Object} piece.sPoints - The local coordinates of the piece's side points.
 * @param {Object} [piece.sPoints.north] - The north side point {x, y}.
 * @param {Object} [piece.sPoints.east] - The east side point {x, y}.
 * @param {Object} [piece.sPoints.south] - The south side point {x, y}.
 * @param {Object} [piece.sPoints.west] - The west side point {x, y}.
 * @returns {Object} An object containing:
 *   - {Object} worldCorners: The world-space coordinates of the corners (nw, ne, se, sw).
 *   - {Object} worldSPoints: The world-space coordinates of the side points (north, east, south, west).
 */
function computeWorldData(piece) {
  // Requires: piece.bitmap.width/height, piece.pad, piece.displayX/Y, piece.rotation, piece.scale
  if (piece.scale == null) piece.scale = 0.35; // fallback if not set
  const bmpW = piece.bitmap.width * piece.scale;
  const bmpH = piece.bitmap.height * piece.scale;
  const cx = piece.displayX + bmpW / 2;
  const cy = piece.displayY + bmpH / 2;
  const rad = (piece.rotation * Math.PI) / 180;

  function toCanvasLocal(pt) {
    // pt is in original (un-padded) local; need to offset by pad then scale
    return {
      x: (pt.x + piece.pad) * piece.scale,
      y: (pt.y + piece.pad) * piece.scale,
    };
  }

  // Corners
  const c = piece.corners;
  const cornersLocal = {
    nw: toCanvasLocal(c.nw),
    ne: toCanvasLocal(c.ne),
    se: toCanvasLocal(c.se),
    sw: toCanvasLocal(c.sw),
  };
  const worldCorners = {};
  Object.entries(cornersLocal).forEach(([k, v]) => {
    worldCorners[k] = rotatePoint(
      v.x + piece.displayX,
      v.y + piece.displayY,
      cx,
      cy,
      rad
    );
  });

  // sPoints
  const sp = piece.sPoints;
  const worldSPoints = {};
  ["north", "east", "south", "west"].forEach((side) => {
    const p = sp[side];
    if (!p) {
      worldSPoints[side] = null;
      return;
    }
    const local = toCanvasLocal(p);
    worldSPoints[side] = rotatePoint(
      local.x + piece.displayX,
      local.y + piece.displayY,
      cx,
      cy,
      rad
    );
  });

  return { worldCorners, worldSPoints };
}

function sideCornerKeys(side) {
  switch (side) {
    case "north":
      return ["nw", "ne"];
    case "east":
      return ["ne", "se"];
    case "south":
      return ["se", "sw"];
    case "west":
      return ["sw", "nw"];
    default:
      return [];
  }
}

function isComplementary(polarityA, polarityB) {
  // +1 with -1 only
  return polarityA + polarityB === 0;
}

/**
 * Tests if two sets of waypoints match within tolerance, trying both direct and reversed ordering.
 *
 * @param {Array<{x: number, y: number}>} mWaypoints - Moving piece waypoints [corner1, sidePoint, corner2]
 * @param {Array<{x: number, y: number}>} sWaypoints - Stationary piece waypoints [corner1, sidePoint, corner2]
 * @param {number} tolerance - Maximum allowed squared distance between matching waypoints
 * @returns {Object|null} Match result with ordering info, or null if no match found.
 *   Returns: { reversed: boolean, distances: number[] } where distances are the squared distances for each waypoint pair
 */
function matchWaypoints(mWaypoints, sWaypoints, tolerance) {
  if (mWaypoints.length !== sWaypoints.length) return null;

  // Try direct ordering first
  let distances = [];
  let allMatch = true;
  for (let i = 0; i < mWaypoints.length; i++) {
    const d2 = dist2(mWaypoints[i], sWaypoints[i]);
    distances.push(d2);
    if (d2 > tolerance) {
      allMatch = false;
      break;
    }
  }

  if (allMatch) {
    return { reversed: false, distances };
  }

  // Try reversed ordering
  distances = [];
  allMatch = true;
  const reversedS = [...sWaypoints].reverse();
  for (let i = 0; i < mWaypoints.length; i++) {
    const d2 = dist2(mWaypoints[i], reversedS[i]);
    distances.push(d2);
    if (d2 > tolerance) {
      allMatch = false;
      break;
    }
  }

  if (allMatch) {
    return { reversed: true, distances };
  }

  return null;
}

/**
 * Attempts to find the best matching side pair between a moving piece and a stationary piece
 * using geometric compatibility checks as defined in GAME_SPECIFICATION.md.
 *
 * Performs comprehensive validation including:
 * - Waypoint proximity verification (all waypoints within CONNECTION_TOLERANCE)
 * - Complementary polarity check (bump +1 matches dent -1 only)
 * - Tests both direct and reversed waypoint ordering to handle rotation
 *
 * @param {Object} movingPiece - The piece being dragged
 * @param {Object} movingPiece.edges - Polarity values {north, east, south, west} where +1=bump, -1=dent, 0=border
 * @param {Object} movingPiece.sPoints - Side shape points {north, east, south, west} in local coordinates
 * @param {Object} stationaryPiece - The candidate piece to match against
 * @param {Object} stationaryPiece.edges - Polarity values {north, east, south, west}
 * @param {Object} stationaryPiece.sPoints - Side shape points {north, east, south, west} in local coordinates
 * @param {Object} stationaryPiece.id - Unique identifier for the stationary piece
 * @param {Object} movingWD - World-space coordinates for moving piece (from computeWorldData)
 * @param {Object} movingWD.worldCorners - Corner positions {nw, ne, se, sw} in world space
 * @param {Object} movingWD.worldSPoints - Side points {north, east, south, west} in world space
 * @param {Object} stationaryWD - World-space coordinates for stationary piece (from computeWorldData)
 * @param {Object} stationaryWD.worldCorners - Corner positions {nw, ne, se, sw} in world space
 * @param {Object} stationaryWD.worldSPoints - Side points {north, east, south, west} in world space
 *
 * @returns {Object|null} Best matching side pair, or null if no valid match found.
 *   Returns object with:
 *   - {number} score: Aggregate squared distance (lower is better)
 *   - {string} stationaryPieceId: ID of the matching stationary piece
 *   - {string} movingSide: Side name on moving piece ("north"|"east"|"south"|"west")
 *   - {string} stationarySide: Side name on stationary piece ("north"|"east"|"south"|"west")
 *   - {Object} mapping: Corner correspondence mapping
 *   - {string} mapping.movingCornerA: First corner key on moving piece ("nw"|"ne"|"se"|"sw")
 *   - {string} mapping.movingCornerB: Second corner key on moving piece
 *   - {string} mapping.stationaryCornerA: Matching corner key on stationary piece
 *   - {string} mapping.stationaryCornerB: Matching corner key on stationary piece
 *   - {Object} stationaryCornerWorldA: World coordinates of first stationary corner
 *   - {Object} stationaryCornerWorldB: World coordinates of second stationary corner
 */
function matchSides(movingPiece, stationaryPiece, movingWD, stationaryWD) {
  // Adjust tolerance based on current zoom level
  const zoomLevel = getCurrentZoom();
  const tolerance = CONFIG.CONNECTION_TOLERANCE / (zoomLevel * zoomLevel);
  let best = null;
  const movingEdges = movingPiece.edges;
  const stationaryEdges = stationaryPiece.edges;

  ["north", "east", "south", "west"].forEach((mSide) => {
    const mPol = movingEdges[mSide];
    if (mPol === 0) return; // border side ignored
    const mSPoint = movingPiece.sPoints[mSide];
    if (!mSPoint) return; // border
    const mCornerNames = sideCornerKeys(mSide);
    const mwcA = movingWD.worldCorners[mCornerNames[0]];
    const mwcB = movingWD.worldCorners[mCornerNames[1]];
    const mwS = movingWD.worldSPoints[mSide];

    ["north", "east", "south", "west"].forEach((sSide) => {
      const sPol = stationaryEdges[sSide];
      if (sPol === 0) return;
      if (!isComplementary(mPol, sPol)) return;
      const sSPoint = stationaryPiece.sPoints[sSide];
      if (!sSPoint) return;
      const sCornerNames = sideCornerKeys(sSide);
      const swcA = stationaryWD.worldCorners[sCornerNames[0]];
      const swcB = stationaryWD.worldCorners[sCornerNames[1]];
      const swS = stationaryWD.worldSPoints[sSide];

      // Create waypoint arrays: [corner1, sidePoint, corner2]
      const mWaypoints = [mwcA, mwS, mwcB];
      const sWaypoints = [swcA, swS, swcB];

      // Test waypoint matching with both direct and reversed ordering
      const waypointMatch = matchWaypoints(mWaypoints, sWaypoints, tolerance);

      if (waypointMatch) {
        // Calculate aggregate score and determine corner mapping
        const agg = waypointMatch.distances.reduce((sum, d) => sum + d, 0);

        let stationaryCornerA,
          stationaryCornerB,
          stationaryCornerWorldA,
          stationaryCornerWorldB;
        if (waypointMatch.reversed) {
          // Reversed ordering: sCornerNames[1] -> sCornerNames[0]
          stationaryCornerA = sCornerNames[1];
          stationaryCornerB = sCornerNames[0];
          stationaryCornerWorldA = swcB;
          stationaryCornerWorldB = swcA;
        } else {
          // Direct ordering: sCornerNames[0] -> sCornerNames[1]
          stationaryCornerA = sCornerNames[0];
          stationaryCornerB = sCornerNames[1];
          stationaryCornerWorldA = swcA;
          stationaryCornerWorldB = swcB;
        }

        if (!best || agg < best.score) {
          best = {
            score: agg,
            stationaryPieceId: stationaryPiece.id,
            movingSide: mSide,
            stationarySide: sSide,
            mapping: {
              movingCornerA: mCornerNames[0],
              movingCornerB: mCornerNames[1],
              stationaryCornerA,
              stationaryCornerB,
            },
            stationaryCornerWorldA,
            stationaryCornerWorldB,
          };
        }
      }
    });
  });
  return best;
}

function findCandidate(movingPiece) {
  if (!spatialIndex) return null;
  const movingWD = computeWorldData(movingPiece);

  // Adjust tolerance based on current zoom level to maintain consistent feel
  const zoomLevel = getCurrentZoom();
  const adjustedTolerance =
    CONFIG.CONNECTION_TOLERANCE / (zoomLevel * zoomLevel);

  // Calculate radius based on 1.5 times the longest side of the moving piece
  const bmpW = movingPiece.bitmap.width * movingPiece.scale;
  const bmpH = movingPiece.bitmap.height * movingPiece.scale;
  const longestSide = Math.max(bmpW, bmpH);
  const coarseR = longestSide * 1.5;

  const centerX = movingWD.worldCorners.nw.x; // rough anchor
  const centerY = movingWD.worldCorners.nw.y;
  const neighborIds = spatialIndex.queryRadius(centerX, centerY, coarseR);

  // Debug: Log spatial index results for NW corner piece left-to-right movement
  if (movingPiece.gridX === 0 && movingPiece.gridY === 0) {
    console.log("[findCandidate] Spatial index query for NW corner:", {
      movingId: movingPiece.id,
      queryCenter: { x: centerX, y: centerY },
      queryRadius: coarseR,
      pieceSize: { width: bmpW, height: bmpH },
      longestSide: longestSide,
      foundNeighbors: neighborIds,
      adjustedTolerance: adjustedTolerance,
    });
  }

  let best = null;
  neighborIds.forEach((id) => {
    if (id === movingPiece.id) return;
    const candidate = getPieceById(id);
    if (!candidate) return;

    // Skip pieces that are already in the same group as the moving piece
    if (movingPiece.groupId && candidate.groupId === movingPiece.groupId)
      return;

    // Debug: Log each candidate evaluation for NW corner
    if (movingPiece.gridX === 0 && movingPiece.gridY === 0) {
      console.log("[findCandidate] Evaluating candidate:", {
        candidateId: id,
        candidateGrid: { x: candidate.gridX, y: candidate.gridY },
      });
    }

    const candidateWD = computeWorldData(candidate);
    const match = matchSides(movingPiece, candidate, movingWD, candidateWD);

    // Debug: Log match results for NW corner
    if (movingPiece.gridX === 0 && movingPiece.gridY === 0) {
      console.log("[findCandidate] Match result:", {
        candidateId: id,
        candidateGrid: { x: candidate.gridX, y: candidate.gridY },
        matchFound: !!match,
        matchDetails: match
          ? {
              score: match.score,
              movingSide: match.movingSide,
              stationarySide: match.stationarySide,
            }
          : null,
      });
    }

    if (match && (!best || match.score < best.score)) best = match;
  });
  return best;
}

function applyHighlight(candidate) {
  const newId = candidate ? candidate.stationaryPieceId : null;
  if (currentHighlight && currentHighlight.pieceId === newId) return; // unchanged
  currentHighlight = candidate ? { pieceId: newId, data: candidate } : null;
  onHighlightChange(newId, candidate);
}

function clearHighlight() {
  applyHighlight(null);
}

function finePlace(movingPiece, highlightData) {
  if (!highlightData) return;
  // Align first moving corner to stationary corner A
  const movingCornerKey = highlightData.mapping.movingCornerA;
  const stationaryCornerKey = highlightData.mapping.stationaryCornerA;
  const movingWD = computeWorldData(movingPiece);
  const stationaryPiece = getPieceById(highlightData.stationaryPieceId);
  if (!stationaryPiece) return;
  const stationaryWD = computeWorldData(stationaryPiece);
  const mWorldCorner = movingWD.worldCorners[movingCornerKey];
  const sWorldCorner = stationaryWD.worldCorners[stationaryCornerKey];

  // Debug: Always log when stationary piece is nw corner (gridX=0, gridY=0)
  if (stationaryPiece.gridX === 0 && stationaryPiece.gridY === 0) {
    console.log("[finePlace] NW corner as stationary piece:", {
      stationaryId: stationaryPiece.id,
      stationaryDisplay: {
        x: stationaryPiece.displayX,
        y: stationaryPiece.displayY,
      },
      stationaryCornerKey,
      stationaryCornerLocal: stationaryPiece.corners[stationaryCornerKey],
      stationaryCornerWorld: sWorldCorner,
      movingId: movingPiece.id,
      movingCornerKey,
      movingCornerWorld: mWorldCorner,
      dx: sWorldCorner.x - mWorldCorner.x,
      dy: sWorldCorner.y - mWorldCorner.y,
    });
  }

  const dx = sWorldCorner.x - mWorldCorner.x;
  const dy = sWorldCorner.y - mWorldCorner.y;

  // Debug: Check for unusual delta values that might indicate a problem
  if (Math.abs(dx) > 1000 || Math.abs(dy) > 1000) {
    console.warn("[finePlace] Unusually large fine placement delta", {
      dx,
      dy,
      stationaryPieceGrid: {
        x: stationaryPiece.gridX,
        y: stationaryPiece.gridY,
      },
      movingPieceGrid: { x: movingPiece.gridX, y: movingPiece.gridY },
    });
  }

  // Get all pieces in the moving group (including the moving piece itself)
  const movingGroupPieces = getMovingGroupPieces(movingPiece); // Apply translation to all pieces in the moving group
  movingGroupPieces.forEach((piece) => {
    piece.displayX += dx;
    piece.displayY += dy;
    // Update DOM position
    if (pieceElementsAccessor) {
      const el = pieceElementsAccessor(piece.id);
      if (el) {
        el.style.left = piece.displayX + "px";
        el.style.top = piece.displayY + "px";
      }
    }
  });
}

function getMovingGroupPieces(movingPiece) {
  // If moving piece has no group, return just this piece
  if (!movingPiece.groupId) {
    return [movingPiece];
  }

  // Find all pieces with the same groupId as the moving piece
  return state.pieces.filter((p) => p.groupId === movingPiece.groupId);
}

function mergeGroups(pieceA, pieceB) {
  // Naive grouping: assign groupId on pieces; later replace with union-find.
  if (!pieceA.groupId && !pieceB.groupId) {
    const newGroupId =
      "g" + Date.now() + Math.random().toString(16).slice(2, 6);
    pieceA.groupId = newGroupId;
    pieceB.groupId = newGroupId;
  } else if (pieceA.groupId && !pieceB.groupId) {
    pieceB.groupId = pieceA.groupId;
  } else if (!pieceA.groupId && pieceB.groupId) {
    pieceA.groupId = pieceB.groupId;
  } else if (pieceA.groupId !== pieceB.groupId) {
    // Merge: reassign all from pieceB.groupId to pieceA.groupId
    const from = pieceB.groupId;
    const to = pieceA.groupId;
    state.pieces.forEach((p) => {
      if (p.groupId === from) p.groupId = to;
    });
  }

  // Update progress after group merge
  updateProgress();
}

export function initConnectionManager(opts) {
  spatialIndex = opts.spatialIndex;
  getPieceById = opts.getPieceById;
  onHighlightChange = opts.onHighlightChange || onHighlightChange;
  pieceElementsAccessor = opts.getPieceElement || null;
  if (opts.tolerance != null) {
    CONFIG.CONNECTION_TOLERANCE = opts.tolerance;
    CONFIG.ALIGNMENT_TOLERANCE = opts.tolerance;
  }
}

export function handleDragMove(movingPiece) {
  if (!movingPiece) return;
  const candidate = findCandidate(movingPiece);

  // Connection detection working normally

  applyHighlight(candidate);
}

export function handleDragEnd(movingPiece, wasDetached = false) {
  if (!movingPiece) return;

  // Handle drag end with optional detachment

  if (currentHighlight && currentHighlight.pieceId != null) {
    // Perform connection
    const stationaryPiece = getPieceById(currentHighlight.pieceId);
    // Connecting pieces

    if (stationaryPiece) {
      finePlace(movingPiece, currentHighlight.data);
      mergeGroups(movingPiece, stationaryPiece);
      connectPieces([movingPiece.id, stationaryPiece.id]); // placeholder progress update
    }
  }
  clearHighlight();
}

export function getCurrentHighlight() {
  return currentHighlight;
}

// Utility to externally clear highlight (e.g., on cancel)
export function resetConnectionHighlight() {
  clearHighlight();
}
