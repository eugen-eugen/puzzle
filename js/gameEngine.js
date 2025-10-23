// gameEngine.js - central state & placeholder logic
export const state = {
  pieces: [],
  totalPieces: 0,
  groups: [],
  settings: { snapNearPx: 50, snapReadyPx: 25 },
};

export function connectPieces(ids) {
  // Placeholder: group creation logic
  // In future: union-find + group creation
  // Progress is now calculated dynamically based on groups and ungrouped pieces
}
