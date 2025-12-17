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
import { DEFAULT_PIECE_SCALE } from "../constants/piece-constants.js";
import { gameTableController } from "../game-table-controller.js";

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
   * @param {HTMLCanvasElement} data.bitmap - Piece bitmap
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
   */
  constructor(data) {
    // Core identity
    this.id = data.id;
    this.gridPos = new Point(data.gridX, data.gridY);

    // GroupId will be set by GroupManager after construction
    // Store the requested groupId for GroupManager to use
    this._requestedGroupId = data.groupId;
    this._groupId = null;

    // Physical dimensions - Rectangle stores position (imgX, imgY) and size (w, h)
    this.imgRect = new Rectangle(
      new Point(data.imgX, data.imgY),
      data.w,
      data.h
    );

    // Visual representation
    this.bitmap = data.bitmap;
    this.path = data.path;
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
    if (data.geometryCorners && data.geometrySidePoints && data.nw) {
      this.corners = normalizePointsToOrigin(data.geometryCorners, data.nw);
      this.sPoints = normalizePointsToOrigin(data.geometrySidePoints, data.nw);
    } else {
      this.corners = convertToPoints(data.corners);
      this.sPoints = convertToPoints(data.sPoints);
    }

    // Generate path if not provided and geometry is available
    if (!this.path && this.corners && this.sPoints) {
      this.path = this.generatePath();
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
    const corners = this.corners;
    const sPoints = this.sPoints;

    // Start with corner points
    const allPoints = [corners.nw, corners.ne, corners.se, corners.sw];

    // Add side points if they exist
    if (sPoints.north) allPoints.push(sPoints.north);
    if (sPoints.east) allPoints.push(sPoints.east);
    if (sPoints.south) allPoints.push(sPoints.south);
    if (sPoints.west) allPoints.push(sPoints.west);

    // Find min/max coordinates
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of allPoints) {
      if (point && point.x !== undefined && point.y !== undefined) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }

    // Handle edge case where no valid points found
    if (!isFinite(minX)) {
      return Rectangle.fromPoints(
        new Point(0, 0),
        new Point(this.imgRect.width, this.imgRect.height)
      );
    }

    return Rectangle.fromPoints(new Point(minX, minY), new Point(maxX, maxY));
  }

  /**
   * Generate Path2D for this piece from corners and side points
   * Path is shrunk to 0.8 to create a gap between pieces
   * @returns {Path2D} Generated path for this piece
   */
  generatePath() {
    const path = new Path2D();
    const pts = [];

    // Start with NW corner (at origin)
    pts.push(this.corners.nw);

    // Top edge
    if (this.sPoints.north) {
      pts.push(this.sPoints.north);
    }
    pts.push(this.corners.ne);

    // Right edge
    if (this.sPoints.east) {
      pts.push(this.sPoints.east);
    }
    pts.push(this.corners.se);

    // Bottom edge
    if (this.sPoints.south) {
      pts.push(this.sPoints.south);
    }
    pts.push(this.corners.sw);

    // Left edge
    if (this.sPoints.west) {
      pts.push(this.sPoints.west);
    }

    // Build path
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      path.lineTo(pts[i].x, pts[i].y);
    }
    path.closePath();
    return path;
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

  /**
   * Create piece from serialized data
   * @param {Object} data - Serialized piece data
   * @param {HTMLCanvasElement} bitmap - Reconstructed bitmap
   * @param {Path2D} path - Reconstructed path
   * @returns {Piece} New piece instance
   */
  static deserialize(data, bitmap, path) {
    return new Piece({
      ...data,
      bitmap,
      path,
    });
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
