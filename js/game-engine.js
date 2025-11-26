// gameEngine.js - central state & placeholder logic
// ================================
// Game Engine Constants
// ================================
const SNAP_NEAR_PX = 50; // Proximity threshold for near-snap visualization
const SNAP_READY_PX = 25; // Tighter threshold for actual snap readiness

export const state = {
  pieces: [],
  totalPieces: 0,
  groups: [],
  settings: { snapNearPx: SNAP_NEAR_PX, snapReadyPx: SNAP_READY_PX },
  noRotate: false, // When true, rotation is disabled for all pieces
};

export function connectPieces(ids) {
  // Placeholder: group creation logic
  // In future: union-find + group creation
  // Progress is now calculated dynamically based on groups and ungrouped pieces
}
