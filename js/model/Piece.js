// Piece.js - Jigsaw puzzle piece model class
// Encapsulates all piece-related properties and behaviors
// Integrates with Point geometry system and provides automatic worldData caching

import { Point, rotatePointDeg } from "../geometry/Point.js";
import { state } from "../gameEngine.js";

// WorldData cache setup - moved here to avoid circular dependencies
const FALLBACK_PIECE_SCALE = 0.35;

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
    this.groupId = data.groupId || `g${data.id}`;

    // Physical dimensions
    this.w = data.w;
    this.h = data.h;
    this.imgX = data.imgX;
    this.imgY = data.imgY;
    this.pad = data.pad;

    // Visual representation
    this.bitmap = data.bitmap;
    this.path = data.path;
    this.scale = data.scale || 0.35;

    // Position and orientation
    this.position =
      data.position instanceof Point
        ? data.position.clone()
        : new Point(data.displayX || 0, data.displayY || 0);
    this.rotation = data.rotation || 0;

    // Geometry for connection detection
    this.corners = data.corners || {
      nw: { x: 0, y: 0 },
      ne: { x: this.w, y: 0 },
      se: { x: this.w, y: this.h },
      sw: { x: 0, y: this.h },
    };
    this.sPoints = data.sPoints || {};
    this.edges = data.edges || { north: 0, east: 0, south: 0, west: 0 };

    // Set up worldData cache
    this._initializeWorldDataCache();
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
          !(this.position instanceof Point) ||
          !this.position.isValid()
        ) {
          // Initialize position if missing or invalid (fallback for pieces not yet processed)
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
   * taking into account its position, scale, rotation, and padding.
   * @private
   */
  _computeWorldDataInternal() {
    // Requires: this.bitmap.width/height, this.pad, this.position, this.rotation, this.scale
    if (this.scale == null) this.scale = FALLBACK_PIECE_SCALE; // fallback if not set
    const bmpW = this.bitmap.width * this.scale;
    const bmpH = this.bitmap.height * this.scale;
    const cx = this.position.x + bmpW / 2;
    const cy = this.position.y + bmpH / 2;
    const pivot = new Point(cx, cy);

    const scale = this.scale;
    const pad = this.pad;

    // Local -> scaled canvas local (without rotation yet)
    const toCanvasLocalPoint = (pt) =>
      new Point((pt.x + pad) * scale, (pt.y + pad) * scale);

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
      // Translate to piece origin, then rotate around pivot
      const translated = pLocal.addPoint(this.position);
      const rotated = rotatePointDeg(
        translated.x,
        translated.y,
        pivot.x,
        pivot.y,
        this.rotation
      );
      worldCorners[key] = rotated; // rotatePointDeg already returns plain object
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
      const translated = local.addPoint(this.position);
      const rotated = rotatePointDeg(
        translated.x,
        translated.y,
        pivot.x,
        pivot.y,
        this.rotation
      );
      worldSPoints[side] = rotated; // rotatePointDeg already returns plain object
    });

    return { worldCorners, worldSPoints };
  }

  // ===== Position Management =====

  /**
   * Set absolute position
   * @param {number|Point} x - X coordinate or Point instance
   * @param {number} [y] - Y coordinate (if x is number)
   */
  setPosition(x, y) {
    if (x instanceof Point) {
      this.position.mutCopy(x);
    } else {
      this.position.mutSet(x, y);
    }
  }

  /**
   * Move by relative offset
   * @param {number|Point} deltaX - X offset or Point instance
   * @param {number} [deltaY] - Y offset (if deltaX is number)
   */
  move(deltaX, deltaY) {
    if (deltaX instanceof Point) {
      this.position.mutAdd(deltaX.x, deltaX.y);
    } else {
      this.position.mutAdd(deltaX, deltaY);
    }
  }

  /**
   * Get the center point of the piece
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Point} Center point
   */
  getCenter(element = null) {
    const w = element ? element.offsetWidth : this.bitmap.width * this.scale;
    const h = element ? element.offsetHeight : this.bitmap.height * this.scale;
    return this.position.added(w / 2, h / 2);
  }

  /**
   * Get bounding rectangle
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Object} {x, y, width, height}
   */
  getBounds(element = null) {
    const w = element ? element.offsetWidth : this.bitmap.width * this.scale;
    const h = element ? element.offsetHeight : this.bitmap.height * this.scale;
    return {
      x: this.position.x,
      y: this.position.y,
      width: w,
      height: h,
    };
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
   * Get all pieces in the same group
   * @returns {Piece[]} Array of pieces in the same group (including this piece)
   */
  getGroupPieces() {
    return state.pieces.filter((p) => p.groupId === this.groupId);
  }

  /**
   * Detach this piece from its current group (create new group)
   * @returns {string} New group ID
   */
  detachFromGroup() {
    const oldGroupId = this.groupId;
    const newGroupId = `g${this.id}_${Date.now()}`;
    this.groupId = newGroupId;
    console.debug(
      `[Piece] Detached piece ${this.id} from group ${oldGroupId} to ${newGroupId}`
    );
    return newGroupId;
  }

  /**
   * Merge this piece's group with another piece's group
   * @param {Piece} otherPiece - Target piece whose group to merge with
   */
  mergeWithGroup(otherPiece) {
    if (this.groupId === otherPiece.groupId) return; // Already in same group

    const fromGroupId = this.groupId;
    const toGroupId = otherPiece.groupId;

    // Update all pieces in this piece's group to the target group
    state.pieces.forEach((piece) => {
      if (piece.groupId === fromGroupId) {
        piece.groupId = toGroupId;
      }
    });

    console.debug(`[Piece] Merged group ${fromGroupId} into ${toGroupId}`);
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
      edges: this.edges,
      sPoints: this.sPoints,
      pad: this.pad,
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
   * Apply piece position and rotation to DOM element
   * @param {HTMLElement} element - Target DOM element
   */
  applyToElement(element) {
    if (!element) return;
    element.style.left = this.position.x + "px";
    element.style.top = this.position.y + "px";
    element.style.transform = `rotate(${this.rotation}deg)`;
  }

  /**
   * Update spatial index with current position
   * @param {SpatialIndex} spatialIndex - Spatial index to update
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   */
  updateSpatialIndex(spatialIndex, element = null) {
    if (!spatialIndex) return;
    const centerPoint = this.getCenter(element);
    spatialIndex.update({ id: this.id, position: centerPoint });
  }

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
   * String representation for debugging
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
