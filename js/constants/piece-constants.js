// PieceConstants.js - Centralized piece-related constants
// This ensures consistent scale values across all modules

// ================================
// Piece Scale Constants
// ================================
export const DEFAULT_PIECE_SCALE = 0.7; // Standard scale for all pieces
export const MIN_PIECE_SCALE = 0.1; // Minimum allowable scale
export const MAX_PIECE_SCALE = 2.0; // Maximum allowable scale

// ================================
// Rendering Constants
// ================================
export const MIN_RENDERED_DIMENSION = 24; // Minimum piece size in pixels
export const OUTSIDE_THRESHOLD_PX = 40; // Distance from boundary

// ================================
// Connection Constants
// ================================
export const DEFAULT_CONNECTION_DISTANCE_PX = 30; // Base connection distance
export const COARSE_RADIUS_MULTIPLIER = 1.5; // Spatial query multiplier

// ================================
// Direction Constants
// ================================
export const NORTH = "north";
export const EAST = "east";
export const SOUTH = "south";
export const WEST = "west";
export const ALL_SIDES = [NORTH, EAST, SOUTH, WEST];

// Corner constants (for internal use)
export const NORTHWEST = "nw";
export const NORTHEAST = "ne";
export const SOUTHEAST = "se";
export const SOUTHWEST = "sw";
