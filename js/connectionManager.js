// connectionManager.js - geometric connection detection & grouping
// Implements matching rules defined in GAME_SPECIFICATION.md
// Using single CONNECTION_TOLERANCE for squared distance comparisons.
// Updated: 2025-11-13 - Removed legacy mergeWithGroup calls, fixed getGroupPieces() calls
// CACHE BUST: 2025-11-13-14:30:00 - All getGroupPieces() calls eliminated

import { state, connectPieces } from "./gameEngine.js";
import { getCurrentZoom } from "./app.js";
import { updateProgress } from "./controlBar.js";
import { applyPieceTransform } from "./display.js";
// Geometry utilities (new Point-based refactor)
import { Point, dist2 as pointDist2 } from "./geometry/Point.js";
import { DEFAULT_PIECE_SCALE } from "./constants/PieceConstants.js";
import { groupManager } from "./GroupManager.js";

// ================================
// Module Constants
// ================================
// Direction constants
const NORTH = "north";
const EAST = "east";
const SOUTH = "south";
const WEST = "west";
const ALL_SIDES = [NORTH, EAST, SOUTH, WEST];

// Corner constants
const NORTHWEST = "nw";
const NORTHEAST = "ne";
const SOUTHEAST = "se";
const SOUTHWEST = "sw";

const DEFAULT_CONNECTION_DISTANCE_PX = 30; // Base pixel distance for matching
const CONNECTION_TOLERANCE_SQ =
  DEFAULT_CONNECTION_DISTANCE_PX * DEFAULT_CONNECTION_DISTANCE_PX; // 30^2 = 900
const DEFAULT_ALIGNMENT_TOLERANCE_SQ = CONNECTION_TOLERANCE_SQ; // Same heuristic currently
const FINE_PLACE_LARGE_DELTA_THRESHOLD = 1000; // Warn if alignment exceeds this many pixels
const COARSE_RADIUS_MULTIPLIER = 1.5; // Radius multiplier relative to longest side

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
    case NORTH:
      return [NORTHWEST, NORTHEAST];
    case EAST:
      return [NORTHEAST, SOUTHEAST];
    case SOUTH:
      return [SOUTHEAST, SOUTHWEST];
    case WEST:
      return [SOUTHWEST, NORTHWEST];
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

  ALL_SIDES.forEach((mLogicalSide) => {
    const mPol = movingEdges[mLogicalSide];
    if (mPol === 0) return; // border side ignored
    const mSPoint = movingPiece.sPoints[mLogicalSide];
    if (!mSPoint) return; // border

    const mCornerNames = sideCornerKeys(mLogicalSide);
    const mwcA = movingWD.worldCorners[mCornerNames[0]];
    const mwcB = movingWD.worldCorners[mCornerNames[1]];
    const mwS = movingWD.worldSPoints[mLogicalSide];

    ALL_SIDES.forEach((sLogicalSide) => {
      const sPol = stationaryEdges[sLogicalSide];
      if (sPol === 0) return;
      if (!isComplementary(mPol, sPol)) return;
      const sSPoint = stationaryPiece.sPoints[sLogicalSide];
      if (!sSPoint) return;

      const sCornerNames = sideCornerKeys(sLogicalSide);
      const swcA = stationaryWD.worldCorners[sCornerNames[0]];
      const swcB = stationaryWD.worldCorners[sCornerNames[1]];
      const swS = stationaryWD.worldSPoints[sLogicalSide];

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
          // Debug: Log successful matches for rotated pieces
          if (
            (movingPiece.rotation !== 0 || stationaryPiece.rotation !== 0) &&
            movingPiece.gridX === 0 &&
            movingPiece.gridY === 0
          ) {
            console.log("[matchSides] Found match with rotation:", {
              movingPiece: movingPiece.id,
              stationaryPiece: stationaryPiece.id,
              movingRotation: movingPiece.rotation,
              stationaryRotation: stationaryPiece.rotation,
              mLogicalSide,
              sLogicalSide,
              score: agg,
            });
          }

          best = {
            score: agg,
            stationaryPieceId: stationaryPiece.id,
            movingSide: mLogicalSide,
            stationarySide: sLogicalSide,
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

  const neighborIds = spatialIndex.queryRadius(
    movingWD.worldCorners.nw,
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

  const dx = sWorldCorner.x - mWorldCorner.x;
  const dy = sWorldCorner.y - mWorldCorner.y;

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
      if (el) applyPieceTransform(el, piece);
    }
  });
}

function getMovingGroupPieces(movingPiece) {
  // Use GroupManager - offensive programming
  const group = groupManager.getGroup(movingPiece.groupId);
  return group ? group.getPieces() : [movingPiece];
}

function mergeGroups(pieceA, pieceB) {
  // Use GroupManager for proper connectivity validation
  if (!groupManager) {
    console.error(
      "[connectionManager] GroupManager not available - cannot merge groups"
    );
    return;
  }

  const success = groupManager.mergeGroups(pieceA, pieceB);

  if (!success) {
    console.error(
      "[connectionManager] Group merge failed - pieces cannot be merged (likely connectivity violation)"
    );
    // No fallback - respect GroupManager's connectivity validation
  }
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
