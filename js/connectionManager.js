// connectionManager.js - geometric connection detection & grouping
// Implements matching rules defined in GAME_SPECIFICATION.md
// Using single CONNECTION_TOLERANCE for squared distance comparisons.

import { state, connectPieces } from "./gameEngine.js";
import { updateProgress, getCurrentZoom } from "./app.js";
import { applyPiecePosition } from "./display.js";
// Geometry utilities (new Point-based refactor)
import {
  Point,
  dist2 as pointDist2,
  rotatePointDeg as pointRotatePointDeg,
} from "./geometry/Point.js";

// ================================
// Module Constants
// ================================
const DEFAULT_CONNECTION_DISTANCE_PX = 30; // Base pixel distance for matching
const CONNECTION_TOLERANCE_SQ =
  DEFAULT_CONNECTION_DISTANCE_PX * DEFAULT_CONNECTION_DISTANCE_PX; // 30^2 = 900
const DEFAULT_ALIGNMENT_TOLERANCE_SQ = CONNECTION_TOLERANCE_SQ; // Same heuristic currently
const FINE_PLACE_LARGE_DELTA_THRESHOLD = 1000; // Warn if alignment exceeds this many pixels
const COARSE_RADIUS_MULTIPLIER = 1.5; // Radius multiplier relative to longest side
const FALLBACK_PIECE_SCALE = 0.35; // Fallback scale for missing piece.scale (should match generators / renderer defaults)

// Public configuration (can be overridden during init)
const CONFIG = {
  CONNECTION_TOLERANCE: CONNECTION_TOLERANCE_SQ,
  ALIGNMENT_TOLERANCE: DEFAULT_ALIGNMENT_TOLERANCE_SQ,
};

let spatialIndex = null;
let getPieceById = null;
let onHighlightChange = () => {};
let pieceElementsAccessor = null; // function(id) -> HTMLElement

let currentHighlight = null; // { pieceId, sideName, mapping }

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
    const d2 = pointDist2(mWaypoints[i], sWaypoints[i]);
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
    const d2 = pointDist2(mWaypoints[i], reversedS[i]);
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
  const movingWD = movingPiece.worldData;

  // Adjust tolerance based on current zoom level to maintain consistent feel
  const zoomLevel = getCurrentZoom();
  const adjustedTolerance =
    CONFIG.CONNECTION_TOLERANCE / (zoomLevel * zoomLevel);

  // Calculate radius based on 1.5 times the longest side of the moving piece
  const bmpW = movingPiece.bitmap.width * movingPiece.scale;
  const bmpH = movingPiece.bitmap.height * movingPiece.scale;
  const longestSide = Math.max(bmpW, bmpH);
  const coarseR = longestSide * COARSE_RADIUS_MULTIPLIER;

  const centerX = movingWD.worldCorners.nw.x; // rough anchor
  const centerY = movingWD.worldCorners.nw.y;
  const neighborIds = spatialIndex.queryRadius(
    { x: centerX, y: centerY },
    coarseR
  );

  let best = null;
  neighborIds.forEach((id) => {
    if (id === movingPiece.id) return;
    const candidate = getPieceById(id);
    if (!candidate) return;

    // Skip pieces that are already in the same group as the moving piece
    if (candidate.groupId === movingPiece.groupId) return;

    // Debug: Log each candidate evaluation for NW corner
    if (movingPiece.gridX === 0 && movingPiece.gridY === 0) {
      console.log("[findCandidate] Evaluating candidate:", {
        candidateId: id,
        candidateGrid: { x: candidate.gridX, y: candidate.gridY },
      });
    }

    const candidateWD = candidate.worldData;
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
  const movingWD = movingPiece.worldData;
  const stationaryPiece = getPieceById(highlightData.stationaryPieceId);
  if (!stationaryPiece) return;
  const stationaryWD = stationaryPiece.worldData;
  const mWorldCorner = movingWD.worldCorners[movingCornerKey];
  const sWorldCorner = stationaryWD.worldCorners[stationaryCornerKey];

  // Debug: Always log when stationary piece is nw corner (gridX=0, gridY=0)
  if (stationaryPiece.gridX === 0 && stationaryPiece.gridY === 0) {
    console.log("[finePlace] NW corner as stationary piece:", {
      stationaryId: stationaryPiece.id,
      stationaryDisplay: {
        x: stationaryPiece.position.x,
        y: stationaryPiece.position.y,
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
  if (
    Math.abs(dx) > FINE_PLACE_LARGE_DELTA_THRESHOLD ||
    Math.abs(dy) > FINE_PLACE_LARGE_DELTA_THRESHOLD
  ) {
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
    // Ensure piece has position Point and update it directly
    if (!piece.position || !(piece.position instanceof Point)) {
      piece.position = new Point(0, 0);
    }
    piece.position.mutAdd(dx, dy);
    if (pieceElementsAccessor) {
      const el = pieceElementsAccessor(piece.id);
      if (el) applyPiecePosition(el, piece);
    }
  });
}

function getMovingGroupPieces(movingPiece) {
  // Use Piece class method
  return movingPiece.getGroupPieces();
}

function mergeGroups(pieceA, pieceB) {
  // Use Piece class method
  pieceB.mergeWithGroup(pieceA);

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
