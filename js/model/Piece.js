// Piece.js - Jigsaw puzzle piece model class
// Encapsulates all piece-related properties and behaviors
// Integrates with Point geometry system and provides automatic worldData caching

import { Point, rotatePointDeg } from "../geometry/Point.js";
import { Rectangle } from "../geometry/Rectangle.js";
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
  }

  /**
   * Convert corner objects to Point instances
   * @private
   */
  _ensureCornersArePoints(corners) {
    return {
      nw: Point.from(corners.nw),
      ne: Point.from(corners.ne),
      se: Point.from(corners.se),
      sw: Point.from(corners.sw),
    };
  }

  /**
   * Convert side point objects to Point instances (handling nulls)
   * @private
   */
  _ensureSidePointsArePoints(sPoints) {
    return {
      north: sPoints.north ? Point.from(sPoints.north) : null,
      east: sPoints.east ? Point.from(sPoints.east) : null,
      south: sPoints.south ? Point.from(sPoints.south) : null,
      west: sPoints.west ? Point.from(sPoints.west) : null,
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
      north: r > 0 ? Point.from(hSides[r - 1][c]).sub(c_nw) : null,
      east:
        c < cols - 1 && vSides[r][c]
          ? Point.from(vSides[r][c]).sub(c_nw)
          : null,
      south: r < rows - 1 ? Point.from(hSides[r][c]).sub(c_nw) : null,
      west:
        c > 0 && vSides[r][c - 1]
          ? Point.from(vSides[r][c - 1]).sub(c_nw)
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
   * Updated to work with the new centered positioning system.
   * @private
   */
  _computeWorldDataInternal() {
    // Requires: this.bitmap.width/height, this.pad, this.position, this.rotation, this.scale
    if (this.scale == null) this.scale = FALLBACK_PIECE_SCALE; // fallback if not set

    const scale = this.scale;
    const pad = this.pad;

    // Calculate the bounding frame to determine visual center
    const boundingFrame = this.calculateBoundingFrame();
    const visualCenterX = (boundingFrame.minX + boundingFrame.maxX) / 2;
    const visualCenterY = (boundingFrame.minY + boundingFrame.maxY) / 2;

    // The piece position now represents the visual center, so calculate canvas top-left
    const bmpW = this.bitmap.width * scale;
    const bmpH = this.bitmap.height * scale;
    const canvasCenterX = bmpW / 2;
    const canvasCenterY = bmpH / 2;

    // Calculate offset to canvas top-left from visual center
    const offsetX = (visualCenterX + pad) * scale - canvasCenterX;
    const offsetY = (visualCenterY + pad) * scale - canvasCenterY;

    // Canvas top-left position
    const canvasX = this.position.x - offsetX;
    const canvasY = this.position.y - offsetY;

    // Pivot point for rotation is still the visual center (this.position)
    const pivot = new Point(this.position.x, this.position.y);

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
      // Translate to canvas position, then rotate around visual center
      const translated = pLocal.addPoint(new Point(canvasX, canvasY));
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
      const translated = local.addPoint(new Point(canvasX, canvasY));
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
   * Get the center point of the piece based on its actual geometry
   * @param {HTMLElement} [element] - DOM element for accurate dimensions
   * @returns {Point} Center point
   */
  getCenter(element = null) {
    if (element) {
      // With the new centered positioning, the piece position IS the visual center
      // But we need to account for the DOM element's center
      const w = element.offsetWidth;
      const h = element.offsetHeight;

      // Calculate offset used in applyToElement
      const boundingFrame = this.calculateBoundingFrame();
      const scale = this.scale || 0.35;
      const pad = this.pad || 0;

      const visualCenterX = (boundingFrame.minX + boundingFrame.maxX) / 2;
      const visualCenterY = (boundingFrame.minY + boundingFrame.maxY) / 2;

      const canvasCenterX = w / 2;
      const canvasCenterY = h / 2;

      const offsetX = (visualCenterX + pad) * scale - canvasCenterX;
      const offsetY = (visualCenterY + pad) * scale - canvasCenterY;

      // The visual center is now at the position plus canvas center minus offset
      return new Point(
        this.position.x - offsetX + canvasCenterX,
        this.position.y - offsetY + canvasCenterY
      );
    }

    // Without element, the position now represents the visual center of the piece
    return this.position.clone();
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

      // Calculate the positioning offset used in applyToElement
      const boundingFrame = this.calculateBoundingFrame();
      const scale = this.scale || 0.35;
      const pad = this.pad || 0;

      const visualCenterX = (boundingFrame.minX + boundingFrame.maxX) / 2;
      const visualCenterY = (boundingFrame.minY + boundingFrame.maxY) / 2;

      const canvasCenterX = w / 2;
      const canvasCenterY = h / 2;

      const offsetX = (visualCenterX + pad) * scale - canvasCenterX;
      const offsetY = (visualCenterY + pad) * scale - canvasCenterY;

      return {
        x: this.position.x - offsetX,
        y: this.position.y - offsetY,
        width: w,
        height: h,
      };
    }

    // Calculate bounds based on actual piece geometry
    const boundingFrame = this.calculateBoundingFrame();
    const scale = this.scale || 0.35;
    const pad = this.pad || 0;

    // Calculate visual dimensions
    const visualWidth = boundingFrame.width * scale;
    const visualHeight = boundingFrame.height * scale;

    return {
      x: this.position.x - visualWidth / 2,
      y: this.position.y - visualHeight / 2,
      width: visualWidth,
      height: visualHeight,
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
      const pad = this.pad || 0;

      const bitmapWidth = element.offsetWidth;
      const bitmapHeight = element.offsetHeight;

      // Calculate the actual visual piece center within the bitmap
      const pieceVisualCenterX = (boundingFrame.minX + boundingFrame.maxX) / 2;
      const pieceVisualCenterY = (boundingFrame.minY + boundingFrame.maxY) / 2;

      // Calculate offset from bitmap center to piece visual center
      const bitmapCenterX = bitmapWidth / 2;
      const bitmapCenterY = bitmapHeight / 2;
      const offsetX = (pieceVisualCenterX + pad) * scale - bitmapCenterX;
      const offsetY = (pieceVisualCenterY + pad) * scale - bitmapCenterY;

      // Return bounds centered on the actual piece shape
      return {
        x: this.position.x - offsetX,
        y: this.position.y - offsetY,
        width: bitmapWidth,
        height: bitmapHeight,
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

  /**
   * Rotate this piece's entire group around this piece as the pivot
   * @param {number} rotationDegrees - Degrees to rotate (positive = clockwise)
   * @param {Function} getPieceElement - Function to get DOM element by piece ID
   * @param {Object} spatialIndex - Spatial index for updating piece positions
   */
  rotateGroup(rotationDegrees, getPieceElement, spatialIndex) {
    const groupPieces = this.getGroupPieces();
    const selectedEl = getPieceElement(this.id);
    if (!selectedEl) return;

    // With the new positioning system, the pivot is the visual center (this.position)
    const pivot = this.getCenter(selectedEl);

    groupPieces.forEach((piece) => {
      const pieceEl = getPieceElement(piece.id);
      if (!pieceEl) return;

      piece.rotate(rotationDegrees);

      // Get the current visual center of the piece
      const preCenter = piece.getCenter(pieceEl);

      // Rotate the center around the pivot
      const rotatedCenter = Point.from(
        rotatePointDeg(
          preCenter.x,
          preCenter.y,
          pivot.x,
          pivot.y,
          rotationDegrees
        )
      );

      // With the new positioning system, the position IS the visual center
      piece.setPosition(rotatedCenter);

      piece.applyToElement(pieceEl);

      if (spatialIndex) {
        piece.updateSpatialIndex(spatialIndex, pieceEl);
      }
    });
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
      if (point && typeof point.x === "number" && typeof point.y === "number") {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }

    // Handle edge case where no valid points found
    if (!isFinite(minX)) {
      return Rectangle.fromMinMax(0, 0, this.w || 0, this.h || 0);
    }

    return Rectangle.fromMinMax(minX, minY, maxX, maxY);
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
      edges: this.edges,
      corners: this.corners,
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
   * Adjusts positioning so the visual center of the piece shape aligns with the position
   * @param {HTMLElement} element - Target DOM element
   */
  applyToElement(element) {
    if (!element) return;

    // Calculate offset to center the actual piece shape within the padded canvas
    const boundingFrame = this.calculateBoundingFrame();
    const scale = this.scale || 0.35;
    const pad = this.pad || 0;

    // Calculate the visual center offset from the canvas origin
    const visualCenterX = (boundingFrame.minX + boundingFrame.maxX) / 2;
    const visualCenterY = (boundingFrame.minY + boundingFrame.maxY) / 2;

    // Calculate how much to offset the element position to center the piece shape
    const canvasCenterX =
      (element.offsetWidth || this.bitmap.width * scale) / 2;
    const canvasCenterY =
      (element.offsetHeight || this.bitmap.height * scale) / 2;

    const offsetX = (visualCenterX + pad) * scale - canvasCenterX;
    const offsetY = (visualCenterY + pad) * scale - canvasCenterY;

    // Apply position with centering offset
    element.style.left = this.position.x - offsetX + "px";
    element.style.top = this.position.y - offsetY + "px";
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
   * Check if this piece is correctly positioned relative to another piece that should be its neighbor
   * @param {Piece} otherPiece - The piece to check positioning against
   * @param {string} direction - Expected direction of neighbor: 'north', 'south', 'east', 'west'
   * @returns {boolean} True if pieces are correctly positioned as neighbors
   */
  isNeighbor(otherPiece, direction) {
    if (!otherPiece || !this.worldData || !otherPiece.worldData) {
      return false;
    }

    const tolerance = 5; // Allow small positioning tolerance in pixels
    const thisCorners = this.worldData.worldCorners;
    const otherCorners = otherPiece.worldData.worldCorners;

    switch (direction) {
      case "north":
        // North neighbor: this piece's NW/NE should align with other's SW/SE
        return (
          Math.abs(thisCorners.nw.x - otherCorners.sw.x) < tolerance &&
          Math.abs(thisCorners.nw.y - otherCorners.sw.y) < tolerance &&
          Math.abs(thisCorners.ne.x - otherCorners.se.x) < tolerance &&
          Math.abs(thisCorners.ne.y - otherCorners.se.y) < tolerance
        );

      case "south":
        // South neighbor: this piece's SW/SE should align with other's NW/NE
        return (
          Math.abs(thisCorners.sw.x - otherCorners.nw.x) < tolerance &&
          Math.abs(thisCorners.sw.y - otherCorners.nw.y) < tolerance &&
          Math.abs(thisCorners.se.x - otherCorners.ne.x) < tolerance &&
          Math.abs(thisCorners.se.y - otherCorners.ne.y) < tolerance
        );

      case "east":
        // East neighbor: this piece's NE/SE should align with other's NW/SW
        return (
          Math.abs(thisCorners.ne.x - otherCorners.nw.x) < tolerance &&
          Math.abs(thisCorners.ne.y - otherCorners.nw.y) < tolerance &&
          Math.abs(thisCorners.se.x - otherCorners.sw.x) < tolerance &&
          Math.abs(thisCorners.se.y - otherCorners.sw.y) < tolerance
        );

      case "west":
        // West neighbor: this piece's NW/SW should align with other's NE/SE
        return (
          Math.abs(thisCorners.nw.x - otherCorners.ne.x) < tolerance &&
          Math.abs(thisCorners.nw.y - otherCorners.ne.y) < tolerance &&
          Math.abs(thisCorners.sw.x - otherCorners.se.x) < tolerance &&
          Math.abs(thisCorners.sw.y - otherCorners.se.y) < tolerance
        );

      default:
        return false;
    }
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
