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
   * @param {Point} data.gridPos - Grid position
   * @param {string} [data.groupId] - Initial group ID (will be managed by GroupManager)
   * @param {Point} data.imgPos - Position in source image
   * @param {number} data.w - Width in source image
   * @param {number} data.h - Height in source image
   * @param {HTMLCanvasElement} [data.bitmap] - Piece bitmap (will be generated if not provided)
   * @param {Object} [data.paths] - Piece paths object {north, east, south, west} with Path2D for each edge
   * @param {number} [data.scale] - Display scale (defaults to DEFAULT_PIECE_SCALE)
   * @param {Point} [data.position] - Display position
   * @param {number} [data.rotation=0] - Rotation in degrees
   * @param {number} [data.zIndex] - Z-index for layering
   * @param {Object} [data.geometryCorners] - Corner points for geometry calculation
   * @param {Object} [data.geometrySidePoints] - Side points for geometry calculation
   * @param {Object} [data.corners] - Pre-calculated corner Point objects
   * @param {Object} [data.sPoints] - Pre-calculated side Point arrays
   * @param {HTMLCanvasElement} [data.master] - Master canvas for bitmap generation
   */
  constructor(data) {
    // Core identity
    this.id = data.id;
    this.gridPos = data.gridPos;

    // GroupId - set from data if available (deserialization), otherwise null (new piece)
    // GroupManager will set/update this during initialization
    this._groupId = data.groupId || null;

    // Physical dimensions - Rectangle stores position (imgPos) and size (w, h)
    this.imgRect = new Rectangle(data.imgPos, data.w, data.h);

    // Store nw and master for redrawing (needed for border updates)
    this.nw = data.imgPos;
    this.master = data.master;

    // Visual representation
    this.bitmap = data.bitmap;
    this.paths = data.paths;
    //TODO: scale has to do with display size, not with piece geometry
    this.scale = data.scale || DEFAULT_PIECE_SCALE;

    // Position and orientation
    // Position is now managed by GameTableController - initialize it there
    const initialPosition = data.position || new Point(0, 0);
    this.rotation = data.rotation || 0;
    this.zIndex = data.zIndex !== undefined ? data.zIndex : null; // Z-index for layering, null means not yet assigned

    // Calculate piece geometry if geometry data is provided
    if (data.geometryCorners && data.geometrySidePoints) {
      this.corners = normalizePointsToOrigin(data.geometryCorners, data.imgPos);
      const normalizedSidePoints = normalizePointsToOrigin(
        data.geometrySidePoints,
        data.imgPos
      );
      // Convert single points to arrays: empty for border, 3 copies for inner sides
      this.sPoints = this._convertSidePointArrays(normalizedSidePoints);
    } else {
      // corners and sPoints are already Point objects, but may need conversion
      this.corners = data.corners;
      this.sPoints = data.sPoints
        ? this._convertSidePointArrays(data.sPoints)
        : {};
    }

    // Generate paths if not provided and geometry is available
    if (
      !this.paths &&
      this.corners &&
      this.corners.nw &&
      this.corners.ne &&
      this.corners.se &&
      this.corners.sw &&
      this.sPoints
    ) {
      this.paths = this.generatePath();
    }

    // Generate bitmap if not provided and we have all necessary data
    if (!this.bitmap && data.master && this.paths && this.nw) {
      const frame = this.calculateBoundingFrame();
      this.bitmap = drawPiece(frame, this.paths, this.nw, data.master, this);
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
        // Already an array - ensure Point instances
        result[side] = value.map(pt => 
          pt instanceof Point ? pt : new Point(pt.x, pt.y)
        );
      } else {
        // Single Point from test data or geometry - convert to array with 3 copies
        const point = value instanceof Point ? value : new Point(value.x, value.y);
        result[side] = [point, point, point];
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
   * Generate Path2D objects for this piece from corners and side points
   * Creates separate paths for each edge direction for selective rendering
   * @returns {Object} Object with {north, east, south, west, combined} Path2D objects
   */
  generatePath() {
    const paths = {
      north: new Path2D(),
      east: new Path2D(),
      south: new Path2D(),
      west: new Path2D(),
      combined: new Path2D(),
    };

    paths.north.moveTo(this.corners.nw.x, this.corners.nw.y);
    this._addEdgeSpline(
      paths.north,
      this.corners.nw,
      this.sPoints[NORTH],
      this.corners.ne
    );

    paths.east.moveTo(this.corners.ne.x, this.corners.ne.y);
    this._addEdgeSpline(
      paths.east,
      this.corners.ne,
      this.sPoints[EAST],
      this.corners.se
    );

    paths.west.moveTo(this.corners.nw.x, this.corners.nw.y);
    this._addEdgeSpline(
      paths.west,
      this.corners.nw,
      this.sPoints[WEST],
      this.corners.sw
    );

    paths.south.moveTo(this.corners.sw.x, this.corners.sw.y);
    this._addEdgeSpline(
      paths.south,
      this.corners.sw,
      this.sPoints[SOUTH],
      this.corners.se
    );

    paths.combined.moveTo(this.corners.nw.x, this.corners.nw.y);
    this._addEdgeSpline(
      paths.combined,
      this.corners.nw,
      this.sPoints[NORTH],
      this.corners.ne
    );

    this._addEdgeSpline(
      paths.combined,
      this.corners.ne,
      this.sPoints[EAST],
      this.corners.se
    );

    paths.combined.moveTo(this.corners.nw.x, this.corners.nw.y);
    this._addEdgeSpline(
      paths.combined,
      this.corners.nw,
      this.sPoints[WEST],
      this.corners.sw
    );

    this._addEdgeSpline(
      paths.combined,
      this.corners.sw,
      this.sPoints[SOUTH],
      this.corners.se
    );

    return paths;
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
      gridPos: this.gridPos,
      rotation: this.rotation,
      position: position,
      groupId: this.groupId,
      zIndex: this.zIndex,
      corners: this.corners,
      sPoints: this.sPoints,
      w: this.imgRect.width,
      h: this.imgRect.height,
      scale: DEFAULT_PIECE_SCALE,
      imgPos: this.imgRect.position,
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

  /**
   * Deserialize plain object to piece data with Point and Rectangle objects
   * Does not create a Piece instance, but converts plain objects to proper geometry types
   * Matches the output format of serialize()
   * @param {Object} data - Serialized piece data from serialize()
   * @returns {Object} Piece data with Point and Rectangle instances where applicable
   * @static
   */
  static deserialize(data) {
    // Convert to Point objects if they're plain objects (for backwards compatibility)
    const gridPos =
      data.gridPos instanceof Point
        ? data.gridPos
        : new Point(data.gridPos.x, data.gridPos.y);
    const position =
      data.position instanceof Point
        ? data.position
        : new Point(data.position.x, data.position.y);
    const imgPos =
      data.imgPos instanceof Point
        ? data.imgPos
        : new Point(data.imgPos.x, data.imgPos.y);

    // Convert corners to Point objects if they're plain objects
    const corners = convertToPoints(data.corners);

    // Convert sPoints arrays to arrays of Point objects
    const sPoints = {};
    ALL_SIDES.forEach((side) => {
      const value = data.sPoints?.[side];
      if (!value || !Array.isArray(value)) {
        sPoints[side] = [];
      } else {
        sPoints[side] = value.map((pt) =>
          pt instanceof Point ? pt : new Point(pt.x, pt.y)
        );
      }
    });

    // Return object ready for Piece constructor
    return {
      id: data.id,
      gridPos: gridPos,
      rotation: data.rotation,
      position: position,
      groupId: data.groupId,
      zIndex: data.zIndex,
      corners: corners,
      sPoints: sPoints,
      w: data.w,
      h: data.h,
      imgPos: imgPos,
      scale: data.scale,
      bitmapData: data.bitmapData,
    };
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
