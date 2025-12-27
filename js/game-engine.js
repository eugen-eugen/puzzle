// gameEngine.js - central state & placeholder logic
// ================================
// Game Engine Constants
// ================================
const SNAP_NEAR_PX = 50; // Proximity threshold for near-snap visualization
const SNAP_READY_PX = 25; // Tighter threshold for actual snap readiness

/**
 * Central game state singleton class
 * See STATE_STRUCTURE.md for complete documentation
 */
class State {
  constructor() {
    this.reset();
  }

  /**
   * Reset all state properties to their default values
   * This effectively "re-creates" the state without breaking references
   */
  reset() {
    // Array of Piece objects representing all puzzle pieces
    this.pieces = [];

    // Total count of pieces in the puzzle
    this.totalPieces = 0;

    // Array of group objects (legacy - actual groups managed by GroupManager)
    this.groups = [];

    // Snap settings - proximity thresholds
    this.snapNearPx = SNAP_NEAR_PX;
    this.snapReadyPx = SNAP_READY_PX;

    // Flag indicating if rotation is disabled for all pieces
    this.noRotate = false;

    // Deep link parameters from URL (set by parseDeepLinkParams() in url-util.js)
    this.deepLinkImageUrl = null;
    this.deepLinkPieceCount = null;
    this.deepLinkNoRotate = "n";
    this.deepLinkRemoveColor = "n";
    this.deepLinkLicense = null;
  }

  /**
   * Reset only deep link parameters to default values
   * Called when user uploads a new file, invalidating old deep link data
   */
  resetDeepLinkState() {
    this.deepLinkImageUrl = null;
    this.deepLinkPieceCount = null;
    this.deepLinkNoRotate = "n";
    this.deepLinkRemoveColor = "n";
    this.deepLinkLicense = null;
  }
}

// Create and export singleton instance
export const state = new State();
