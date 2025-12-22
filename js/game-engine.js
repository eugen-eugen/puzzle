// gameEngine.js - central state & placeholder logic
// ================================
// Game Engine Constants
// ================================
const SNAP_NEAR_PX = 50; // Proximity threshold for near-snap visualization
const SNAP_READY_PX = 25; // Tighter threshold for actual snap readiness

/**
 * Central game state object - FLAT structure
 * See STATE_STRUCTURE.md for complete documentation
 */
export const state = {
  // Array of Piece objects representing all puzzle pieces
  pieces: [],

  // Total count of pieces in the puzzle
  totalPieces: 0,

  // Array of group objects (legacy - actual groups managed by GroupManager)
  groups: [],

  // Snap settings - proximity thresholds
  snapNearPx: SNAP_NEAR_PX, // Proximity threshold for near-snap visualization
  snapReadyPx: SNAP_READY_PX, // Tighter threshold for actual snap readiness

  // Flag indicating if rotation is disabled for all pieces
  noRotate: false,

  // Deep link parameters from URL (set by parseDeepLinkParams() in url-util.js)
  deepLinkImageUrl: null, // URL of the image to load
  deepLinkPieceCount: null, // Number of pieces in puzzle
  deepLinkNoRotate: "n", // String version of rotation disabled flag ("y" | "n")
  deepLinkRemoveColor: "n", // Grayscale filter enabled flag ("y" | "n")
  deepLinkLicense: null, // License text to overlay on image
};
