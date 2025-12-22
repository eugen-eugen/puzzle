// connectionManager.js - geometric connection detection & grouping
// Implements matching rules defined in GAME_SPECIFICATION.md
// Using single CONNECTION_TOLERANCE for squared distance comparisons.
// Updated: 2025-11-13 - Removed legacy mergeWithGroup calls, fixed getGroupPieces() calls
// CACHE BUST: 2025-11-13-14:30:00 - All getGroupPieces() calls eliminated

import {
  applyPieceTransform,
  getZoomLevel,
  applyHighlight as displayApplyHighlight,
} from "../ui/display.js";
import { gameTableController } from "./game-table-controller.js";
// Geometry utilities (new Point-based refactor)
import { dist2 as pointDist2 } from "../geometry/point.js";
import { groupManager } from "./group-manager.js";
import { DRAG_MOVE, DRAG_END } from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";
import { state } from "../game-engine.js";

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
  DEFAULT_CONNECTION_DISTANCE_PX * DEFAULT_CONNECTION_DISTANCE_PX; // 5^2 = 25
const DEFAULT_ALIGNMENT_TOLERANCE_SQ = CONNECTION_TOLERANCE_SQ; // Same heuristic currently
const DEFAULT_PROFILE_TOLERANCE_PX = 2; // Max spread in waypoint distances for profile matching
const PROFILE_TOLERANCE_SQ =
  DEFAULT_PROFILE_TOLERANCE_PX * DEFAULT_PROFILE_TOLERANCE_PX; // 2^2 = 4
const COARSE_RADIUS_MULTIPLIER = 1.5; // Radius multiplier relative to longest side

// Public configuration (can be overridden during init)
const CONFIG = {
  CONNECTION_TOLERANCE: CONNECTION_TOLERANCE_SQ,
  ALIGNMENT_TOLERANCE: DEFAULT_ALIGNMENT_TOLERANCE_SQ,
  PROFILE_TOLERANCE: PROFILE_TOLERANCE_SQ,
};

let currentHighlight = null; // Array of { pieceId, data } or null

function sideCornerKeys(side) {
  switch (side) {
    case NORTH:
      return { first: NORTHWEST, second: NORTHEAST };
    case EAST:
      return { first: NORTHEAST, second: SOUTHEAST };
    case SOUTH:
      return { first: SOUTHEAST, second: SOUTHWEST };
    case WEST:
      return { first: SOUTHWEST, second: NORTHWEST };
    default:
      return { first: null, second: null };
  }
}

function validateProfileAlignment(distances2, profileTolerance) {
  if (distances2.length === 0) return false;
  const maxDist = Math.max(...distances2);
  const minDist = Math.min(...distances2);
  const spread = maxDist - minDist;
  return spread <= profileTolerance;
}

/**
 * Tests if two sets of waypoints match within tolerance, trying both direct and reversed ordering.
 * Uses two-stage validation:
 * 1. Position tolerance: All waypoint pairs must be within positionTolerance distance
 * 2. Profile tolerance: The spread of distances (max - min) must be within profileTolerance,
 *    ensuring parallel alignment of the profiles
 *
 * @param {Array<{x: number, y: number}>} mWaypoints - Moving piece waypoints [corner1, sidePoint, corner2]
 * @param {Array<{x: number, y: number}>} sWaypoints - Stationary piece waypoints [corner1, sidePoint, corner2]
 * @param {number} positionTolerance - Maximum allowed squared distance between matching waypoints
 * @param {number} profileTolerance - Maximum allowed spread (max - min) in waypoint distances
 * @returns {Object|null} Match result with ordering info, or null if no match found.
 *   Returns: { reversed: boolean, distances: number[], profileValid: boolean }
 */
function matchWaypoints(
  mWaypoints,
  sWaypoints,
  positionTolerance,
  profileTolerance,
  reversed = false
) {
  if (mWaypoints.length !== sWaypoints.length) return null;

  // Try direct ordering first
  let distances2 = [];
  let allMatch = true;
  for (let i = 0; i < mWaypoints.length; i++) {
    const d2 = pointDist2(mWaypoints[i], sWaypoints[i]);
    distances2.push(d2);
    if (d2 > positionTolerance) {
      allMatch = false;
      break;
    }
  }

  if (allMatch) {
    const profileValid = validateProfileAlignment(distances2, profileTolerance);
    return { reversed, distances2, profileValid };
  }

  return null;
}

function matchSides(movingPiece, stationaryPiece, movingWD, stationaryWD) {
  // Adjust tolerances based on current zoom level
  const zoomLevel = getZoomLevel();
  const positionTolerance =
    CONFIG.CONNECTION_TOLERANCE / (zoomLevel * zoomLevel);
  const profileTolerance = CONFIG.PROFILE_TOLERANCE / (zoomLevel * zoomLevel);
  let best = null;

  ALL_SIDES.forEach((mLogicalSide) => {
    const mSPoint = movingPiece.sPoints[mLogicalSide];
    if (!mSPoint) return; // border side, no connection possible

    const mCornerNames = sideCornerKeys(mLogicalSide);
    const mwcA = movingWD.worldCorners[mCornerNames.first];
    const mwcB = movingWD.worldCorners[mCornerNames.second];
    const mwS = movingWD.worldSPoints[mLogicalSide];

    ALL_SIDES.forEach((sLogicalSide) => {
      const sSPoint = stationaryPiece.sPoints[sLogicalSide];
      if (!sSPoint) return; // border side, no connection possible

      const sCornerNames = sideCornerKeys(sLogicalSide);
      const swcA = stationaryWD.worldCorners[sCornerNames.first];
      const swcB = stationaryWD.worldCorners[sCornerNames.second];
      const swS = stationaryWD.worldSPoints[sLogicalSide];

      // Create waypoint arrays: [corner1, sidePoint, corner2]
      const mWaypoints = [mwcA, mwS, mwcB];
      const sWaypoints = [swcA, swS, swcB];

      // Test waypoint matching with both direct and reversed ordering
      // Validates: (1) position tolerance - absolute distance match
      //            (2) profile tolerance - parallel alignment consistency
      const waypointMatch =
        matchWaypoints(
          mWaypoints,
          sWaypoints,
          positionTolerance,
          profileTolerance
        ) ||
        matchWaypoints(
          mWaypoints,
          [...sWaypoints].reverse(),
          positionTolerance,
          profileTolerance,
          true
        );

      if (waypointMatch && waypointMatch.profileValid) {
        // Calculate aggregate score and determine corner mapping
        const agg = waypointMatch.distances2.reduce((sum, d) => sum + d, 0);

        let stationaryCornerA;
        if (waypointMatch.reversed) {
          // Reversed ordering: second -> first
          stationaryCornerA = sCornerNames.second;
        } else {
          // Direct ordering: first -> second
          stationaryCornerA = sCornerNames.first;
        }

        if (!best || agg < best.score) {
          best = {
            score: agg,
            stationaryPieceId: stationaryPiece.id,
            mapping: {
              movingCornerA: mCornerNames.first,
              stationaryCornerA,
            },
          };
        }
      }
    });
  });
  return best;
}

function findCandidate(movingPiece) {
  const movingWD = movingPiece.worldData;

  // Adjust tolerance based on current zoom level to maintain consistent feel

  // Calculate radius based on 1.5 times the longest side of the moving piece
  const bmpW = movingPiece.bitmap.width * movingPiece.scale;
  const bmpH = movingPiece.bitmap.height * movingPiece.scale;
  const longestSide = Math.max(bmpW, bmpH);
  const coarseR = longestSide * COARSE_RADIUS_MULTIPLIER;

  // Use piece center for spatial query (consistent with how pieces are stored in index)
  const movingCenter = movingPiece.getCenter();

  const neighborIds = gameTableController.queryRadius(movingCenter, coarseR);

  let best = null;
  neighborIds.forEach((id) => {
    if (id === movingPiece.id) return;
    const candidate = state.pieces.find((p) => p.id === id);

    // Skip pieces that are already in the same group as the moving piece
    const candidateGroup = groupManager.getGroupForPiece(candidate);
    const movingGroup = groupManager.getGroupForPiece(movingPiece);
    if (candidateGroup && movingGroup && candidateGroup === movingGroup) return;

    const match = matchSides(
      movingPiece,
      candidate,
      movingWD,
      candidate.worldData
    );

    if (match && (!best || match.score < best.score)) best = match;
  });
  return best;
}

function applyHighlight(candidates) {
  // candidates is an array of { movingPiece, candidate } or null
  if (!candidates || candidates.length === 0) {
    if (currentHighlight) {
      currentHighlight = null;
      displayApplyHighlight(null);
    }
    return;
  }

  // Extract unique stationary piece IDs
  const pieceIds = [
    ...new Set(candidates.map((c) => c.candidate.stationaryPieceId)),
  ];

  // Check if highlight changed
  const currentIds = currentHighlight
    ? currentHighlight
        .map((h) => h.pieceId)
        .sort()
        .join(",")
    : "";
  const newIds = pieceIds.sort().join(",");

  if (currentIds === newIds) return; // unchanged

  currentHighlight = candidates.map((c) => ({
    pieceId: c.candidate.stationaryPieceId,
    data: c.candidate,
  }));

  // Pass array of piece IDs to highlight
  displayApplyHighlight(pieceIds);
}

function clearHighlight() {
  applyHighlight(null);
}

function finePlace(movingPiece, connection) {
  if (!connection) return;
  // Align first moving corner to stationary corner A
  const stationaryPiece = state.pieces.find(
    (p) => p.id === connection.stationaryPieceId
  );
  if (!stationaryPiece) return;

  const delta = stationaryPiece.worldData.worldCorners[
    connection.mapping.stationaryCornerA
  ].sub(movingPiece.worldData.worldCorners[connection.mapping.movingCornerA]);

  // Move the entire group (even lone pieces belong to their own group)
  if (gameTableController && movingPiece.groupId) {
    gameTableController.moveGroup(movingPiece.groupId, delta);
  }
}

export function initConnectionManager(opts) {
  if (opts.tolerance != null) {
    CONFIG.CONNECTION_TOLERANCE = opts.tolerance;
    CONFIG.ALIGNMENT_TOLERANCE = opts.tolerance;
  }
  if (opts.profileTolerance != null) {
    CONFIG.PROFILE_TOLERANCE = opts.profileTolerance;
  }
}

// Listen for drag move events
registerGlobalEvent(DRAG_MOVE, (event) => {
  const movingPiece = event.detail.piece;
  if (!movingPiece) return;

  // Get all border pieces from the moving group
  const group = groupManager.getGroup(movingPiece.groupId);
  const borderPieces = group ? group.allBorderPieces : [movingPiece];

  // Find candidates for all border pieces
  const candidates = [];
  for (const borderPiece of borderPieces) {
    const candidate = findCandidate(borderPiece);
    if (candidate && candidate.stationaryPieceId != null) {
      candidates.push({
        movingPiece: borderPiece,
        candidate: candidate,
      });
    }
  }

  applyHighlight(candidates.length > 0 ? candidates : null);
});

// Listen for drag end events
registerGlobalEvent(DRAG_END, (event) => {
  const movingPiece = event.detail.piece;
  if (!movingPiece) return;

  // Get all border pieces from the moving group
  const group = groupManager.getGroup(movingPiece.groupId);
  const borderPieces = group ? group.allBorderPieces : [movingPiece];

  // Try to find connections for all border pieces
  const connections = [];
  for (const borderPiece of borderPieces) {
    const candidate = findCandidate(borderPiece);
    if (candidate && candidate.stationaryPieceId != null) {
      connections.push({
        movingPiece: borderPiece,
        candidate: candidate,
      });
    }
  }

  // Process all found connections
  if (connections.length > 0) {
    // Sort by score (best connection first)
    connections.sort((a, b) => a.candidate.score - b.candidate.score);

    // Apply the best connection
    const bestConnection = connections[0];
    const stationaryPiece = state.pieces.find(
      (p) => p.id === bestConnection.candidate.stationaryPieceId
    );

    if (stationaryPiece) {
      finePlace(bestConnection.movingPiece, bestConnection.candidate);
      groupManager.mergeGroups(bestConnection.movingPiece, stationaryPiece);
    }
  }

  clearHighlight();
});

export function getCurrentHighlight() {
  return currentHighlight;
}

// Utility to externally clear highlight (e.g., on cancel)
export function resetConnectionHighlight() {
  clearHighlight();
}
