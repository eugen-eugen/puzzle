// Piece.js - Jigsaw puzzle piece model class
// Encapsulates all piece-related properties and behaviors
// Integrates with Point geometry system and provides automatic worldData caching
// Updated: 2025-11-13 - Legacy methods removed, GroupManager enforced

import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import { state } from "../game-engine.js";
import { DEFAULT_PIECE_SCALE } from "../constants/piece-constants.js";
import { applyPieceTransform } from "../display.js";
import { gameTableController } from "../game-table-controller.js";

/**
 * Jigsaw puzzle piece class
 * Manages all piece properties, position, rotation, grouping, and geometry
 */
export class Piece {
  constructor(data) {
    // Core identity
    this.id = data.id;
    this.gridX = data.gridX;
    this.gridY = data.gridY;

    // Initialize groupId - only the constructor and GroupManager should set this
    this._groupId = data.groupId || `g${data.id}`;
    this._allowGroupIdChange = true; // Allow changes during construction

    // Define groupId property with getter/setter to track modifications
    Object.defineProperty(this, "groupId", {
      get() {
        return this._groupId;
      },
      set(value) {
        if (!this._allowGroupIdChange) {
          const error = new Error(
            `[Piece] Direct groupId modification is not allowed for piece ${this.id}. Use GroupManager operations instead.`
          );
          console.error(error.message);
          console.trace("Stack trace for unauthorized groupId modification:");
          throw error;
        }
        this._groupId = value;
      },
      enumerable: true,
      configurable: true,
    });

    // Physical dimensions
    this.w = data.w;
    this.h = data.h;
    this.imgX = data.imgX;
    this.imgY = data.imgY;

    // Visual representation
    this.bitmap = data.bitmap;
    this.path = data.path;
    this.scale = data.scale || DEFAULT_PIECE_SCALE;

    // Position and orientation
    this.position =
      data.position instanceof Point
        ? data.position.clone()
        : new Point(data.displayX || 0, data.displayY || 0);
    this.rotation = data.rotation || 0;
    this.zIndex = data.zIndex !== undefined ? data.zIndex : null; // Z-index for layering, null means not yet assigned

    // Calculate piece geometry if geometry data is provided
    if (data.geometryCorners && data.hSides && data.vSides && data.c_nw) {
      this.corners = this._calculatePieceCorners(
        data.geometryCorners,
        data.c_nw
      );
      this.sPoints = this._calculatePieceSidePoints(
        data.hSides,
        data.vSides,
        data.c_nw,
        data.rows,
        data.cols
      );
    } else {
      // Fallback to legacy data structure
      const rawCorners = data.corners || {
        nw: { x: 0, y: 0 },
        ne: { x: this.w, y: 0 },
        se: { x: this.w, y: this.h },
        sw: { x: 0, y: this.h },
      };
      const rawSPoints = data.sPoints || {};

      // Ensure corners and side points are Point instances
      this.corners = this._ensureCornersArePoints(rawCorners);
      this.sPoints = this._ensureSidePointsArePoints(rawSPoints);
    }

    this.edges = data.edges || { north: 0, east: 0, south: 0, west: 0 };

    // Set up worldData cache
    this._initializeWorldDataCache();

    // Register with GameTableController for position tracking
    try {
      if (gameTableController && gameTableController.registerPiece) {
        gameTableController.registerPiece(this);
      }
    } catch (e) {
      // Non-fatal: controller may not be initialized yet during early bootstrap
      console.warn(
        `[Piece] Controller registration skipped for piece ${this.id}:`,
        e.message
      );
    }

    // Lock groupId changes after construction
    this._allowGroupIdChange = false;
  }

  /**
   * Convert corner objects to Point instances
   * @private
   */
  _ensureCornersArePoints(corners) {
    return {
      nw: new Point(corners.nw.x, corners.nw.y),
      ne: new Point(corners.ne.x, corners.ne.y),
      se: new Point(corners.se.x, corners.se.y),
      sw: new Point(corners.sw.x, corners.sw.y),
    };
  }

  /**
   * Convert side point objects to Point instances (handling nulls)
   * @private
   */
  _ensureSidePointsArePoints(sPoints) {
    return {
      north: sPoints.north ? new Point(sPoints.north.x, sPoints.north.y) : null,
      east: sPoints.east ? new Point(sPoints.east.x, sPoints.east.y) : null,
      south: sPoints.south ? new Point(sPoints.south.x, sPoints.south.y) : null,
      west: sPoints.west ? new Point(sPoints.west.x, sPoints.west.y) : null,
    };
  }

  /**
   * Calculate piece corners relative to northwest corner
   * @private
   */
  _calculatePieceCorners(geometryCorners, c_nw) {
    const { c_ne, c_se, c_sw } = geometryCorners;
    return {
      nw: new Point(0, 0),
      ne: c_ne.sub(c_nw),
      se: c_se.sub(c_nw),
      sw: c_sw.sub(c_nw),
    };
  }

  /**
   * Calculate piece side points relative to northwest corner
   * @private
   */
  _calculatePieceSidePoints(hSides, vSides, c_nw, rows, cols) {
    const r = this.gridY;
    const c = this.gridX;

    return {
      north:
        r > 0
          ? new Point(hSides[r - 1][c].x, hSides[r - 1][c].y).sub(c_nw)
          : null,
      east:
        c < cols - 1 && vSides[r][c]
          ? new Point(vSides[r][c].x, vSides[r][c].y).sub(c_nw)
          : null,
      south:
        r < rows - 1
          ? new Point(hSides[r][c].x, hSides[r][c].y).sub(c_nw)
          : null,
      west:
        c > 0 && vSides[r][c - 1]
          ? new Point(vSides[r][c - 1].x, vSides[r][c - 1].y).sub(c_nw)
          : null,
    };
  }

  /**
   * Initialize worldData cache
   * @private
   */
  _initializeWorldDataCache() {
    this._setupWorldDataCache();
  }

  /**
   * Sets up a cached worldData property that automatically invalidates
   * when relevant geometric properties change.
   * @private
   */
  _setupWorldDataCache() {
    let cachedWorldData = null;
    let lastPositionX = null;
    let lastPositionY = null;
    let lastRotation = null;
    let lastScale = null;

    const invalidateCache = () => {
      cachedWorldData = null;
    };

    // Define the worldData getter that computes and caches the result
    Object.defineProperty(this, "worldData", {
      get() {
        // Ensure piece has position Point before computing world data
        if (
          !this.position ||
          !(this.position instanceof Point)
        ) {
          // Initialize position if missing (fallback for pieces not yet processed)
          this.position = new Point(0, 0);
        }

        // Check if we need to recompute due to property changes
        const currentPosition = this.position;
        const currentRotation = this.rotation;
        const currentScale = this.scale;

        // Check if position coordinates changed (since Point is mutable)
        const positionChanged =
          currentPosition &&
          (currentPosition.x !== lastPositionX ||
            currentPosition.y !== lastPositionY);

        // Check if other properties changed
        const otherPropsChanged =
          cachedWorldData &&
          (currentRotation !== lastRotation || currentScale !== lastScale);

        // Invalidate cache if any relevant property changed
        if (positionChanged || otherPropsChanged) {
          invalidateCache();
        }

        // Compute if cache is invalid
        if (!cachedWorldData) {
          cachedWorldData = this._computeWorldDataInternal();
          lastPositionX = currentPosition ? currentPosition.x : null;
          lastPositionY = currentPosition ? currentPosition.y : null;
          lastRotation = currentRotation;
          lastScale = currentScale;
        }

        return cachedWorldData;
      },
      configurable: true, // Allow reconfiguration if needed
    });
  }

  /**
   * Internal computation function for world-space coordinates.
   * Computes the world-space coordinates for the corners and side points of a puzzle piece,
   * taking into account its position, scale, and rotation.
   * Updated to work with the new centered positioning system.
   * @private
   */
  _computeWorldDataInternal() {
    // Requires: this.bitmap.width/height, this.position, this.rotation, this.scale
    // Note: this.scale is guaranteed to be set in constructor, so no null check needed

    const scale = this.scale;

    // Calculate the bounding frame to determine visual center
    const boundingFrame = this.calculateBoundingFrame();

    // The piece position now represents the visual center, so calculate canvas top-left
    const bitmapSize = new Point(
      this.bitmap.width * scale,
      this.bitmap.height * scale
    );
    const canvasCenter = bitmapSize.scaled(0.5);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);
    const canvasTopLeft = this.position.sub(offset);

    // Pivot point for rotation should be the visual center of the piece
    const pivot = this.getCenter();

    const toCanvasLocalPoint = (pt) =>
      pt.sub(boundingFrame.topLeft).scaled(scale);

    // Corners
    const c = this.corners;
    const cornersLocal = {
      nw: toCanvasLocalPoint(c.nw),
      ne: toCanvasLocalPoint(c.ne),
      se: toCanvasLocalPoint(c.se),
      sw: toCanvasLocalPoint(c.sw),
    };

    const worldCorners = {};
    for (const [key, pLocal] of Object.entries(cornersLocal)) {
      // Translate to canvas position, then rotate around visual center
      const translated = pLocal.add(canvasTopLeft);
      const rotated = translated.rotatedAroundDeg(pivot, this.rotation);
      worldCorners[key] = rotated;
    }

    // Side points
    const sp = this.sPoints;
    const worldSPoints = {};
    ["north", "east", "south", "west"].forEach((side) => {
      const p = sp[side];
      if (!p) {
        worldSPoints[side] = null;
        return;
      }
      const local = toCanvasLocalPoint(p);
      const translated = local.add(canvasTopLeft);
      const rotated = translated.rotatedAroundDeg(pivot, this.rotation);
      worldSPoints[side] = rotated;
    });

    return { worldCorners, worldSPoints };
  }

  // ===== Position Management =====

  /**
   * Set absolute position
   * @param {Point} point - Point instance
   */
  setPosition(point) {
    this.position = point;
  }

  /**
   * Set position by specifying the center point of the piece
   * Converts center coordinates to the internal position representation used by setPosition()
   * This is the inverse operation of getCenter()
   * @param {Point} centerPoint - Center point of the piece
   * @param {HTMLElement} element - DOM element for accurate dimensions
   */
  placeCenter(centerPoint, element) {
    // Reverse the getCenter() calculation
    const w = element.offsetWidth;
    const h = element.offsetHeight;

    // Calculate offset used in getCenter()
    const boundingFrame = this.calculateBoundingFrame();
    const scale = this.scale || 0.35;

    const canvasCenter = new Point(w / 2, h / 2);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);

    // getCenter() returns: this.position.sub(offset).add(canvasCenter)
    // So to get this.position from centerPoint: centerPoint.sub(canvasCenter).add(offset)
    const position = centerPoint.sub(canvasCenter).add(offset);
    this.setPosition(position);
  }

  /**
   * Move by relative offset
   * @param {number|Point} deltaX - X offset or Point instance
   * @param {number} [deltaY] - Y offset (if deltaX is number)
   */
  move(deltaX, deltaY) {
    if (deltaX instanceof Point) {
      this.position.mutAdd(deltaX);
    } else {
      this.position.mutAdd(new Point(deltaX, deltaY));
    }
  }

  /**
   * Get the center point of the piece based on its actual geometry
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Point} Center point
   */
  getCenter(element = null) {
    // Calculate offset used in positioning calculations
    const boundingFrame = this.calculateBoundingFrame();
    const scale = this.scale || 0.35;

    let w, h;
    if (element) {
      // Use DOM element dimensions if available
      w = element.offsetWidth;
      h = element.offsetHeight;
    } else {
      // Use scaled bounding frame dimensions when no element is provided
      w = boundingFrame.width * scale;
      h = boundingFrame.height * scale;
    }

    const canvasCenter = new Point(w / 2, h / 2);
    const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
    const offset = scaledCenterOffset.sub(canvasCenter);

    // The visual center is now at the position plus canvas center minus offset
    return this.position.sub(offset).add(canvasCenter);
  }

  /**
   * Get bounding rectangle based on actual piece geometry
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Object} {x, y, width, height}
   */
  getBounds(element = null) {
    if (element) {
      // With the new positioning system, calculate where the element actually is
      const w = element.offsetWidth;
      const h = element.offsetHeight;

      // Calculate the positioning offset used in applyPieceTransform
      const boundingFrame = this.calculateBoundingFrame();
      const scale = this.scale || 0.35;

      const canvasCenter = new Point(w / 2, h / 2);
      const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
      const offset = scaledCenterOffset.sub(canvasCenter);
      const topLeft = this.position.sub(offset);

      return {
        x: topLeft.x,
        y: topLeft.y,
        width: w,
        height: h,
      };
    }

    // Calculate bounds based on actual piece geometry
    const boundingFrame = this.calculateBoundingFrame();
    const scale = this.scale || 0.35;
    const scaledFrame = boundingFrame.scaled(scale);
    const halfSize = scaledFrame.centerOffset;

    return {
      x: this.position.x - halfSize.x,
      y: this.position.y - halfSize.y,
      width: scaledFrame.width,
      height: scaledFrame.height,
    };
  }

  /**
   * Get selection bounds that properly center around the actual piece shape
   * This is specifically for visual selection highlighting (blue frame)
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Object} {x, y, width, height} for selection frame
   */
  getSelectionBounds(element = null) {
    if (element) {
      // Use DOM element dimensions if available, but adjust for centering
      const boundingFrame = this.calculateBoundingFrame();
      const scale = this.scale || 0.35;

      const bitmapSize = new Point(element.offsetWidth, element.offsetHeight);
      const bitmapCenter = bitmapSize.scaled(0.5);
      const scaledCenterOffset = boundingFrame.centerOffset.scaled(scale);
      const offset = scaledCenterOffset.sub(bitmapCenter);
      const topLeft = this.position.sub(offset);

      // Return bounds centered on the actual piece shape
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: bitmapSize.x,
        height: bitmapSize.y,
      };
    }

    // Fallback to regular bounds calculation
    return this.getBounds();
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
    this._allowGroupIdChange = true;
    this.groupId = newGroupId;
    this._allowGroupIdChange = false;
  }

  // getGroupPieces() method has been removed - use GroupManager.getGroup().getPieces() instead

  /**
   * Detach this piece from its current group (create new group)
   * @deprecated Use GroupManager.detachPiece() instead - this method throws an error
   * @throws {Error} Always throws - use GroupManager.detachPiece() instead
   */
  detachFromGroup() {
    throw new Error(
      "[Piece] detachFromGroup() is removed. Use GroupManager.detachPiece() instead."
    );
  }

  /**
   * Merge this piece's group with another piece's group
   * @deprecated Use GroupManager.mergeGroups() instead - this method throws an error
   * @param {Piece} otherPiece - Target piece whose group to merge with
   * @throws {Error} Always throws - use GroupManager.mergeGroups() instead
   */
  mergeWithGroup(otherPiece) {
    throw new Error(
      "[Piece] mergeWithGroup() is removed. Use GroupManager.mergeGroups() instead."
    );
  }

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
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    // Handle edge case where no valid points found
    if (!isFinite(minX)) {
      return Rectangle.fromPoints(new Point(0, 0), new Point(this.w || 0, this.h || 0));
    }

    return Rectangle.fromPoints(new Point(minX, minY), new Point(maxX, maxY));
  }

  /**
   * Generate Path2D for this piece using the standardized path generation
   * @returns {Path2D} Generated path for this piece
   */
  generatePath() {
    // Use the same logic as Geometry.createPiecePath to avoid circular dependency
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
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
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
    const data = {
      id: this.id,
      gridX: this.gridX,
      gridY: this.gridY,
      rotation: this.rotation,
      displayX: this.position.x,
      displayY: this.position.y,
      groupId: this.groupId,
      zIndex: this.zIndex,
      edges: this.edges,
      corners: this.corners,
      sPoints: this.sPoints,
      w: this.w,
      h: this.h,
      scale: this.scale,
      imgX: this.imgX,
      imgY: this.imgY,
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
      position: new Point(data.displayX || 0, data.displayY || 0),
    });
  }

  // ===== Utility Methods =====

  /**
   * (Removed) Spatial index updates handled exclusively by GameTableController.
   */

  /**
   * Check if this piece is correctly positioned (for puzzle completion)
   * @param {number} [tolerance=50] - Position tolerance in pixels
   * @returns {boolean} True if piece is in correct position
   */
  isCorrectlyPositioned(tolerance = 50) {
    // This would need grid-to-world coordinate conversion logic
    // For now, placeholder implementation
    return false;
  }

  /**
   * Check if this piece is correctly positioned relative to another piece that should be its neighbor
   * @param {Piece} otherPiece - The piece to check positioning against
   * @param {string} direction - Expected direction of neighbor: 'north', 'south', 'east', 'west'
   * @returns {boolean} True if pieces are correctly positioned as neighbors
   */
  isNeighbor(otherPiece, direction) {
    // Phase 2: Delegate to GameTableController when available
    // Always use controller-based neighbor logic (legacy fallback removed)
    return gameTableController.arePiecesNeighbors(this, otherPiece);
    /* Legacy geometric code removed intentionally. Direction-specific checks
       can be reintroduced inside controller if needed. */
  }

  /**
   * Check if this piece is a neighbor of another piece in any direction
   * Used for Group connectivity validation - checks all four directions
   * @param {Piece} otherPiece - The piece to check against
   * @returns {boolean} True if pieces are neighbors in any direction
   */
  isAnyNeighbor(otherPiece) {
    // Phase 2: Use controller-level neighbor logic when available
    return gameTableController.arePiecesNeighbors(this, otherPiece);
  }

  /**
   * Check if this piece is properly managed by GroupManager
   * @returns {boolean} True if piece's group exists in GroupManager
   */
  isProperlyGrouped() {
    if (typeof window !== "undefined" && window.groupManager) {
      const group = window.groupManager.getGroup(this.groupId);
      return group && group.getPieces().includes(this);
    }
    return false; // Cannot verify without GroupManager
  }

  /**
   * Debug string representation
   * @returns {string} Debug string
   */
  toString() {
    return `Piece{id:${this.id}, grid:(${this.gridX},${
      this.gridY
    }), pos:(${this.position.x.toFixed(1)},${this.position.y.toFixed(
      1
    )}), rot:${this.rotation}°, group:${this.groupId}}`;
  }
}

// Factory function for creating pieces (maintains compatibility with existing code)
export function createPieceWithWorldData(data) {
  return new Piece(data);
}
