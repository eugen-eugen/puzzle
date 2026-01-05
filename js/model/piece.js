// Piece.js - Jigsaw puzzle piece model class
// Encapsulates all piece-related properties and behaviors
// Integrates with Point geometry system and provides automatic worldData caching
// Updated: 2025-12-16 - Dead code removed (getBounds, getSelectionBounds)

import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import {
  normalizePointsToOrigin,
  convertToPoints,
} from "../geometry/geometry-utils.js";
import { boundingFrame } from "../geometry/polygon.js";
import {
  DEFAULT_PIECE_SCALE,
  NORTH,
  EAST,
  SOUTH,
  WEST,
  ALL_SIDES,
} from "../constants/piece-constants.js";
import { gameTableController } from "../logic/game-table-controller.js";
import { drawPiece } from "../ui/display.js";

/**
 * Jigsaw puzzle piece class
 * Manages all piece properties, position, rotation, grouping, and geometry
 */
export class Piece {
  /**
   * Create a new Piece
   * @param {Object} data - Piece initialization data
   * @param {string} data.id - Unique piece identifier
   * @param {number} data.gridX - Grid X coordinate
   * @param {number} data.gridY - Grid Y coordinate
   * @param {string} [data.groupId] - Initial group ID (will be managed by GroupManager)
   * @param {number} data.imgX - X coordinate in source image
   * @param {number} data.imgY - Y coordinate in source image
   * @param {number} data.w - Width in source image
   * @param {number} data.h - Height in source image
   * @param {HTMLCanvasElement} [data.bitmap] - Piece bitmap (will be generated if not provided)
   * @param {Path2D} data.path - Piece path
   * @param {number} [data.scale] - Display scale (defaults to DEFAULT_PIECE_SCALE)
   * @param {Point} [data.nw] - Northwest corner position
   * @param {number} [data.displayX] - Display X position (used if nw not provided)
   * @param {number} [data.displayY] - Display Y position (used if nw not provided)
   * @param {number} [data.rotation=0] - Rotation in degrees
   * @param {number} [data.zIndex] - Z-index for layering
   * @param {Object} [data.geometryCorners] - Corner points for geometry calculation
   * @param {Object} [data.geometrySidePoints] - Side points for geometry calculation
   * @param {Object} [data.corners] - Pre-calculated corner points
   * @param {Object} [data.sPoints] - Pre-calculated side points
   * @param {HTMLCanvasElement} [data.master] - Master canvas for bitmap generation
   */
  constructor(data) {
    // Core identity
    this.id = data.id;
    this.gridPos = new Point(data.gridX, data.gridY);

    // GroupId - set from data if available (deserialization), otherwise null (new piece)
    // GroupManager will set/update this during initialization
    this._groupId = data.groupId || null;

    const nw = new Point(data.imgX, data.imgY);
    // Physical dimensions - Rectangle stores position (imgX, imgY) and size (w, h)
    this.imgRect = new Rectangle(nw, data.w, data.h);

    // Visual representation
    this.bitmap = data.bitmap;
    this.path = data.path;
    //TODO: scale has to do with display size, not with piece geometry
    this.scale = data.scale || DEFAULT_PIECE_SCALE;

    // Position and orientation
    // Position is now managed by GameTableController - initialize it there
    const initialPosition =
      data.nw instanceof Point
        ? data.nw
        : new Point(data.displayX || 0, data.displayY || 0);
    this.rotation = data.rotation || 0;
    this.zIndex = data.zIndex !== undefined ? data.zIndex : null; // Z-index for layering, null means not yet assigned

    // Calculate piece geometry if geometry data is provided
    if (data.geometryCorners && data.geometrySidePoints && nw) {
      this.corners = normalizePointsToOrigin(data.geometryCorners, nw);
      const normalizedSidePoints = normalizePointsToOrigin(
        data.geometrySidePoints,
        nw
      );
      // Convert single points to arrays: empty for border, 3 copies for inner sides
      this.sPoints = this._convertSidePointArrays(normalizedSidePoints);
    } else {
      this.corners = convertToPoints(data.corners);
      // sPoints already in array format from serialization
      this.sPoints = this._convertSidePointArrays(
        convertToPoints(data.sPoints)
      );
    }

    // Generate path if not provided and geometry is available
    if (!this.path && this.corners && this.sPoints) {
      this.path = this.generatePath();
    }

    // Generate bitmap if not provided and we have all necessary data
    if (!this.bitmap && data.master && this.path && nw) {
      const frame = this.calculateBoundingFrame();
      this.bitmap = drawPiece(frame, this.path, nw, data.master);
    }

    // Register position with GameTableController
    gameTableController.setPiecePosition(this.id, initialPosition);
  }

  /**
   * Get cached worldData - delegates to GameTableController
   * @returns {Object} {worldCorners, worldSPoints}
   */
  get worldData() {
    return gameTableController.getWorldData(this);
  }

  // ===== Position Management =====
  // Position is managed by GameTableController - use gameTableController.getPiecePosition(id)
  // and gameTableController.setPiecePosition(id, position) directly

  /**
   * Get groupId (read-only via getter)
   * @returns {string|null} Current group ID or null if not assigned
   */
  get groupId() {
    return this._groupId;
  }

  /**
   * Get the center point of the piece based on its actual geometry
   * Delegates to GameTableController
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Point} Center point in world coordinates
   */
  getCenter(element = null) {
    return gameTableController.getCenter(this, element);
  }

  // ===== Rotation Management =====

  /**
   * Rotate by specified degrees
   * @param {number} degrees - Degrees to rotate (positive = clockwise)
   */
  rotate(degrees) {
    this.rotation = (this.rotation + degrees) % 360;
    if (this.rotation < 0) this.rotation += 360;
  }

  /**
   * Set absolute rotation
   * @param {number} degrees - Absolute rotation in degrees
   */
  setRotation(degrees) {
    this.rotation = degrees % 360;
    if (this.rotation < 0) this.rotation += 360;
  }

  // ===== Group Management =====

  /**
   * Internal method to change groupId - only for use by GroupManager and Group
   * @param {string} newGroupId - New group ID
   * @private
   */
  _setGroupId(newGroupId) {
    this._groupId = newGroupId;
  }

  /**
   * Convert side points to arrays ensuring proper structure
   * For geometry: converts single points to 3 copies, null to empty array
   * For deserialization: ensures arrays of Points are properly structured
   * @param {Object} sidePoints - Object with {north, east, south, west} side points (single or arrays)
   * @returns {Object} Object with {north, east, south, west} arrays of points
   * @private
   */
  _convertSidePointArrays(sidePoints) {
    const result = {};
    ALL_SIDES.forEach((side) => {
      const value = sidePoints[side];
      if (!value) {
        // Border side - empty array
        result[side] = [];
      } else if (Array.isArray(value)) {
        // Already an array from deserialization - keep as is
        result[side] = value;
      } else {
        // Single point from geometry - convert to 3 copies
        result[side] = [value, value.clone(), value.clone()];
      }
    });
    return result;
  }

  // getGroupPieces() method has been removed - use GroupManager.getGroup().allPieces instead

  // ===== Geometry Access =====

  /**
   * Get world-space corner coordinates
   * @returns {Object} {nw, ne, se, sw} world coordinates
   */
  getWorldCorners() {
    return this.worldData?.worldCorners || {};
  }

  /**
   * Get world-space side point coordinates
   * @returns {Object} {north, east, south, west} world coordinates
   */
  getWorldSidePoints() {
    return this.worldData?.worldSPoints || {};
  }

  /**
   * Calculate the minimal bounding rectangle that contains all corner and side points
   * This is the "minmax frame" needed for pieces with non-orthogonal cuts
   * @returns {Rectangle} Rectangle with topLeft and bottomRight Point properties
   */
  calculateBoundingFrame() {
    // Collect all corner and side points
    const allPoints = [
      this.corners.nw,
      this.corners.ne,
      this.corners.se,
      this.corners.sw,
    ];

    // Add side points if they exist (now arrays)
    if (this.sPoints[NORTH] && this.sPoints[NORTH].length > 0) {
      allPoints.push(...this.sPoints[NORTH]);
    }
    if (this.sPoints[EAST] && this.sPoints[EAST].length > 0) {
      allPoints.push(...this.sPoints[EAST]);
    }
    if (this.sPoints[SOUTH] && this.sPoints[SOUTH].length > 0) {
      allPoints.push(...this.sPoints[SOUTH]);
    }
    if (this.sPoints[WEST] && this.sPoints[WEST].length > 0) {
      allPoints.push(...this.sPoints[WEST]);
    }

    // Calculate bounding frame using polygon utility
    const frame = boundingFrame(allPoints);

    return frame;
  }

  /**
   * Generate Path2D for this piece from corners and side points
   * Each edge is a spline curve from corner to corner through side points
   * @returns {Path2D} Generated path for this piece
   */
  generatePath() {
    const path = new Path2D();

    // Start at NW corner
    path.moveTo(this.corners.nw.x, this.corners.nw.y);

    // North edge: spline nw -> ne through north sPoints
    this._addEdgeSpline(
      path,
      this.corners.nw,
      this.sPoints[NORTH],
      this.corners.ne
    );

    // East edge: spline ne -> se through east sPoints
    this._addEdgeSpline(
      path,
      this.corners.ne,
      this.sPoints[EAST],
      this.corners.se
    );

    // Move to NW to continue with west and south edges
    path.moveTo(this.corners.nw.x, this.corners.nw.y);

    // West edge: spline nw -> sw through west sPoints
    this._addEdgeSpline(
      path,
      this.corners.nw,
      this.sPoints[WEST],
      this.corners.sw
    );

    // South edge: spline sw -> se through south sPoints
    this._addEdgeSpline(
      path,
      this.corners.sw,
      this.sPoints[SOUTH],
      this.corners.se
    );

    return path;
  }

  /**
   * Add a spline curve for one edge to the path
   * Creates smooth interpolating spline that passes through all side points
   * Uses cubic Bezier curves with calculated control points based on tangents
   * @param {Path2D} path - Path to add the curve to
   * @param {Point} startCorner - Starting corner point
   * @param {Point[]} sidePoints - Array of side points (may be empty for border edges)
   * @param {Point} endCorner - Ending corner point
   * @private
   */
  _addEdgeSpline(path, startCorner, sidePoints, endCorner) {
    if (!sidePoints || sidePoints.length === 0) {
      // Border edge - straight line
      path.lineTo(endCorner.x, endCorner.y);
      return;
    }

    // Include start corner for proper tangent calculation
    const points = [startCorner, ...sidePoints, endCorner];

    // Tension parameter: 0 = straight lines, 1 = maximum curvature
    const tension = 0.2;

    // Start from index 1 (first side point) since index 0 is startCorner
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1]; // Previous point
      const p1 = points[i]; // Current target point
      const p2 = i < points.length - 1 ? points[i + 1] : null; // Next point (or null for last)

      // Calculate tangent at previous point (p0)
      // Tangent is based on direction from point before p0 to p1
      const pPrev = i > 1 ? points[i - 2] : p0;
      const tangent1 = p1.sub(pPrev).scaled(tension);

      // Calculate tangent at current point (p1)
      // Tangent is based on direction from p0 to point after p1
      const pNext = p2 || p1;
      const tangent2 = pNext.sub(p0).scaled(tension);

      // Control points for cubic Bezier
      const cp1 = p0.add(tangent1);
      const cp2 = p1.sub(tangent2);

      // Draw cubic Bezier curve from p0 to p1
      path.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p1.x, p1.y);

      // Debug: Draw small cross at side points (skip corners)
      /*
      if (i > 0 && i < points.length - 1) {
        const crossSize = 3;
        path.moveTo(p1.x - crossSize, p1.y);
        path.lineTo(p1.x + crossSize, p1.y);
        path.moveTo(p1.x, p1.y - crossSize);
        path.lineTo(p1.x, p1.y + crossSize);
        path.moveTo(p1.x, p1.y); // Return to point for next curve
      }
        */
    }
  }

  // ===== Persistence =====

  /**
   * Serialize piece to plain object for saving
   * @param {boolean} [includeBitmap=false] - Whether to include bitmap data
   * @returns {Object} Serializable piece data
   */
  serialize(includeBitmap = false) {
    const position =
      gameTableController.getPiecePosition(this.id) || new Point(0, 0);
    const data = {
      id: this.id,
      gridX: this.gridPos.x,
      gridY: this.gridPos.y,
      rotation: this.rotation,
      displayX: position.x,
      displayY: position.y,
      groupId: this.groupId,
      zIndex: this.zIndex,
      corners: this.corners,
      sPoints: this.sPoints,
      w: this.imgRect.width,
      h: this.imgRect.height,
      scale: DEFAULT_PIECE_SCALE,
      imgX: this.imgRect.position.x,
      imgY: this.imgRect.position.y,
    };

    if (includeBitmap && this.bitmap?.toDataURL) {
      try {
        data.bitmapData = this.bitmap.toDataURL();
      } catch (e) {
        console.warn(
          `[Piece] Failed to serialize bitmap for piece ${this.id}:`,
          e
        );
      }
    }

    return data;
  }

  // ===== Utility Methods =====

  /**
   * Debug string representation
   * @returns {string} Debug string
   */
  toString() {
    const position =
      gameTableController.getPiecePosition(this.id) || new Point(0, 0);
    return `Piece{id:${this.id}, grid:(${this.gridPos.x},${
      this.gridPos.y
    }), pos:(${position.x.toFixed(1)},${position.y.toFixed(1)}), rot:${
      this.rotation
    }°, group:${this.groupId}}`;
  }
}
