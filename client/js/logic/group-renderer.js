// group-renderer.js - Renders connected piece groups as single canvas elements
// Eliminates visual seams between connected pieces by clipping the master image
// with the group's outer boundary path (free edges only).

import { Point } from "../geometry/point.js";
import { Rectangle } from "../geometry/rectangle.js";
import { Group } from "../model/group.js";
import { groupManager } from "./group-manager.js";
import { gameTableController } from "./game-table-controller.js";
import { getPieceElement } from "./piece-renderer.js";
import {
  NORTH,
  EAST,
  SOUTH,
  WEST,
  DEFAULT_PIECE_SCALE,
} from "../constants/piece-constants.js";
import { GROUPS_CHANGED } from "../constants/custom-events.js";
import { registerGlobalEvent } from "../utils/event-util.js";
import { state } from "../game-engine.js";
import { getOutlineWidth } from "../ui/display.js";
import { addEdgeSpline, addEdgeSplineReversed } from "../model/clipped.js";
import { darkenColor, lightenColor } from "../utils/color-util.js";

/**
 * Map of groupId -> group canvas wrapper element
 * @type {Map<string, HTMLElement>}
 */
const groupElements = new Map();

/**
 * Lazily resolve the pieces container and current scale from the DOM.
 */
function getContainer() {
  return document.getElementById("piecesContainer");
}

function getCurrentScale() {
  return state.pieces?.[0]?.scale || DEFAULT_PIECE_SCALE;
}

/**
 * Render all existing multi-piece groups.
 * Called once after pieces are loaded/positioned and groups initialized.
 */
export function renderExistingGroups() {
  for (const [groupId, group] of groupManager.getAllGroups()) {
    if (group.size() > 1) {
      renderGroup(groupId);
    }
  }
}

/**
 * Handle group merge: render the merged group as a single element,
 * hide individual piece elements that are part of the group.
 * @param {string} groupId - The ID of the merged group
 */
export function renderGroup(groupId) {
  const group = groupManager.getGroup(groupId);
  if (!group || group.size() <= 1) return;

  const pieces = group.allPieces;

  // All pieces share the same master image
  const master = pieces[0].master;
  if (!master) return;

  // 1. Compute the group's bounding box in image coordinates
  const groupBounds = computeGroupImageBounds(pieces);

  // 2. Build the outer boundary path (free edges only)
  const outerPath = buildGroupOuterPath(pieces, groupBounds.offset);

  // 3. Create canvas and clip the master image through the outer path
  const canvas = renderGroupCanvas(groupBounds, outerPath, pieces, master);

  // 4. Create or update the group DOM element
  const wrapper = createOrUpdateGroupElement(
    groupId,
    canvas,
    groupBounds,
    pieces,
  );

  // 5. Hide individual piece elements
  hidePieceElements(pieces);
}

/**
 * Update the position of a group element (called during drag)
 * @param {string} groupId - The group ID
 */
export function updateGroupPosition(groupId) {
  const wrapper = groupElements.get(groupId);
  if (!wrapper) return;

  const group = groupManager.getGroup(groupId);
  if (!group || group.isEmpty()) return;

  // Use the reference piece stored on the wrapper
  const refPieceId = parseInt(wrapper.dataset.refPieceId);
  const refOffsetX = parseFloat(wrapper.dataset.refOffsetX) || 0;
  const refOffsetY = parseFloat(wrapper.dataset.refOffsetY) || 0;

  // Get reference piece's current element position
  const refElement = getPieceElement(refPieceId);
  if (!refElement) return;

  const refLeft = parseFloat(refElement.style.left) || 0;
  const refTop = parseFloat(refElement.style.top) || 0;

  const scale = getCurrentScale();
  wrapper.style.left = refLeft + refOffsetX * scale + "px";
  wrapper.style.top = refTop + refOffsetY * scale + "px";

  // Sync rotation from reference piece
  const refPiece = group.allPieces.find((p) => p.id === refPieceId);
  if (refPiece) {
    wrapper.style.transform = `rotate(${refPiece.rotation}deg)`;
  }
}

/**
 * Highlight a group by re-rendering its border in green.
 * @param {string} groupId - The group to highlight
 */
export function highlightGroup(groupId) {
  rerenderGroupWithColor(groupId, "#2ea862");
}

/**
 * Remove highlight from a group by re-rendering its border in the default color.
 * @param {string} groupId - The group to unhighlight
 */
export function unhighlightGroup(groupId) {
  rerenderGroupWithColor(groupId, "#D2691E");
}

/**
 * Clear all group highlights, restoring default border color.
 */
export function clearGroupHighlights() {
  for (const groupId of highlightedGroups) {
    rerenderGroupWithColor(groupId, "#D2691E");
  }
  highlightedGroups.clear();
}

/** Set of currently highlighted group IDs */
const highlightedGroups = new Set();

/**
 * Re-render a group's canvas with the specified border color.
 */
function rerenderGroupWithColor(groupId, color) {
  const wrapper = groupElements.get(groupId);
  if (!wrapper) return;

  const group = groupManager.getGroup(groupId);
  if (!group || group.size() <= 1) return;

  const pieces = group.allPieces;
  const master = pieces[0].master;
  if (!master) return;

  const groupBounds = computeGroupImageBounds(pieces);
  const outerPath = buildGroupOuterPath(pieces, groupBounds.offset);
  const canvas = renderGroupCanvas(
    groupBounds,
    outerPath,
    pieces,
    master,
    color,
  );

  // Update the display canvas inside the wrapper
  const outlineWidth = getOutlineWidth();
  const padding = Math.ceil(outlineWidth * 2);
  const scale = getCurrentScale();
  const scaledW = Math.ceil((groupBounds.width + 2 * padding) * scale);
  const scaledH = Math.ceil((groupBounds.height + 2 * padding) * scale);

  const displayCanvas = wrapper.querySelector("canvas");
  if (displayCanvas) {
    displayCanvas.width = scaledW;
    displayCanvas.height = scaledH;
    const displayCtx = displayCanvas.getContext("2d");
    displayCtx.scale(scale, scale);
    displayCtx.drawImage(canvas, 0, 0);
  }

  // Track highlight state
  if (color !== "#D2691E") {
    highlightedGroups.add(groupId);
  } else {
    highlightedGroups.delete(groupId);
  }
}

/**
 * Check if a group has a rendered group element
 * @param {string} groupId
 * @returns {boolean}
 */
export function hasGroupElement(groupId) {
  return groupElements.has(groupId);
}

/**
 * Get the group element for a given group ID
 * @param {string} groupId
 * @returns {HTMLElement|undefined}
 */
export function getGroupElement(groupId) {
  return groupElements.get(groupId);
}

// ================================
// Internal Implementation
// ================================

/**
 * Compute the bounding box of all pieces in image coordinates.
 * Returns offset (top-left in image space) and dimensions.
 */
function computeGroupImageBounds(pieces) {
  let bounds = new Rectangle();

  for (const piece of pieces) {
    const frame = piece.calculateBoundingFrame();
    // frame is in local/normalized coords; piece.nw is the image-space origin
    const imgMin = frame.topLeft.add(piece.nw);
    const imgMax = frame.bottomRight.add(piece.nw);
    bounds = bounds.plus(Rectangle.fromPoints(imgMin, imgMax));
  }

  return {
    offset: bounds.topLeft,
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * Build the clipping path for a group of pieces.
 * Adds each piece's complete closed outline to the path.
 * The union of all piece outlines forms the group's clipping region.
 *
 * @param {Array} pieces - All pieces in the group
 * @param {Point} offset - The top-left offset to subtract (group canvas origin)
 * @returns {Path2D} The combined clipping path
 */
function buildGroupOuterPath(pieces, offset) {
  const path = new Path2D();

  for (const piece of pieces) {
    // Shift from piece-local coords to group-canvas coords
    const shift = piece.nw.sub(offset);

    // Add the complete closed outline for this piece
    addPieceOutline(path, piece, shift);
  }

  return path;
}

/**
 * Add a piece's complete closed outline to the path, shifted by offset.
 * Traces: NW -> north edge -> NE -> east edge -> SE -> south edge (reversed) -> SW -> west edge (reversed) -> NW
 */
function addPieceOutline(path, piece, shift) {
  const corners = piece.corners;

  // Start at NW corner
  path.moveTo(corners.nw.x + shift.x, corners.nw.y + shift.y);

  // North edge: NW -> NE
  addEdgeSpline(path, corners.nw, piece.sPoints[NORTH], corners.ne, shift);

  // East edge: NE -> SE
  addEdgeSpline(path, corners.ne, piece.sPoints[EAST], corners.se, shift);

  // South edge: SE -> SW
  addEdgeSplineReversed(
    path,
    corners.se,
    piece.sPoints[SOUTH],
    corners.sw,
    shift,
  );

  // West edge: SW -> NW
  addEdgeSplineReversed(
    path,
    corners.sw,
    piece.sPoints[WEST],
    corners.nw,
    shift,
  );

  path.closePath();
}

/**
 * Build a path containing only free edges (edges without a group neighbor).
 * Used for stroking the group's outer border.
 */
function buildFreeEdgesPath(pieces, offset) {
  const path = new Path2D();

  for (const piece of pieces) {
    const neighbors = Group.getGroupNeighbors(piece);
    const shift = piece.nw.sub(offset);
    const corners = piece.corners;

    if (!neighbors[NORTH]) {
      path.moveTo(corners.nw.x + shift.x, corners.nw.y + shift.y);
      addEdgeSpline(path, corners.nw, piece.sPoints[NORTH], corners.ne, shift);
    }
    if (!neighbors[EAST]) {
      path.moveTo(corners.ne.x + shift.x, corners.ne.y + shift.y);
      addEdgeSpline(path, corners.ne, piece.sPoints[EAST], corners.se, shift);
    }
    if (!neighbors[SOUTH]) {
      path.moveTo(corners.sw.x + shift.x, corners.sw.y + shift.y);
      addEdgeSpline(path, corners.sw, piece.sPoints[SOUTH], corners.se, shift);
    }
    if (!neighbors[WEST]) {
      path.moveTo(corners.nw.x + shift.x, corners.nw.y + shift.y);
      addEdgeSpline(path, corners.nw, piece.sPoints[WEST], corners.sw, shift);
    }
  }

  return path;
}

/**
 * Draw borders on the group canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Path2D} borderPath
 * @param {number} outlineWidth
 * @param {string} [color="#D2691E"] - Border color (hex)
 */
function drawGroupBorders(ctx, borderPath, outlineWidth, color = "#D2691E") {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Dark shadow
  ctx.strokeStyle = darkenColor(color, 0.4);
  ctx.lineWidth = outlineWidth;
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.stroke(borderPath);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Main color
  ctx.strokeStyle = color;
  ctx.lineWidth = outlineWidth;
  ctx.stroke(borderPath);

  // Light highlight
  ctx.strokeStyle = lightenColor(color, 0.3);
  ctx.lineWidth = outlineWidth / 2;
  ctx.stroke(borderPath);
}

/**
 * Render the group as a single canvas, clipping the master image through the combined path.
 * Also draws borders on the group's free (outer) edges.
 * @param {Object} groupBounds - Group bounding box
 * @param {Path2D} outerPath - Clipping path
 * @param {Array} pieces - Pieces in the group
 * @param {HTMLCanvasElement} master - Master image
 * @param {string} [borderColor="#D2691E"] - Border color
 */
function renderGroupCanvas(
  groupBounds,
  outerPath,
  pieces,
  master,
  borderColor = "#D2691E",
) {
  const outlineWidth = getOutlineWidth();
  const pw = Math.ceil(groupBounds.width);
  const ph = Math.ceil(groupBounds.height);
  const padding = Math.ceil(outlineWidth * 2);

  const canvas = document.createElement("canvas");
  canvas.width = pw + 2 * padding;
  canvas.height = ph + 2 * padding;
  const ctx = canvas.getContext("2d");

  // Offset everything by padding to leave room for border strokes
  ctx.translate(padding, padding);

  // Clip with the combined path of all piece edges and draw master image
  ctx.save();
  ctx.clip(outerPath);
  ctx.drawImage(
    master,
    groupBounds.offset.x,
    groupBounds.offset.y,
    pw,
    ph,
    0,
    0,
    pw,
    ph,
  );
  ctx.restore();

  // Draw borders on free edges only
  const borderPath = buildFreeEdgesPath(pieces, groupBounds.offset);
  drawGroupBorders(ctx, borderPath, outlineWidth, borderColor);

  return canvas;
}

/**
 * Create or update the group DOM element
 */
function createOrUpdateGroupElement(groupId, canvas, groupBounds, pieces) {
  let wrapper = groupElements.get(groupId);

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "piece group-piece";
    wrapper.dataset.groupId = groupId;
    const cont = getContainer();
    if (cont) {
      cont.appendChild(wrapper);
    }
    groupElements.set(groupId, wrapper);
  }

  // Clear existing content and add new canvas
  wrapper.innerHTML = "";
  const outlineWidth = getOutlineWidth();
  const padding = Math.ceil(outlineWidth * 2);
  const scale = getCurrentScale();
  const scaledW = Math.ceil((groupBounds.width + 2 * padding) * scale);
  const scaledH = Math.ceil((groupBounds.height + 2 * padding) * scale);

  const displayCanvas = document.createElement("canvas");
  displayCanvas.width = scaledW;
  displayCanvas.height = scaledH;
  const displayCtx = displayCanvas.getContext("2d");
  displayCtx.scale(scale, scale);
  displayCtx.drawImage(canvas, 0, 0);

  wrapper.style.width = scaledW + "px";
  wrapper.style.height = scaledH + "px";
  wrapper.appendChild(displayCanvas);

  // Position the group element based on the first piece's world position
  const refPiece = pieces[0];
  const refPos = gameTableController.getPiecePosition(refPiece.id);
  const refFrame = refPiece.calculateBoundingFrame();

  // Calculate offset from reference piece position to group canvas origin
  // Include padding for the border stroke area
  const pieceImgOrigin = refPiece.nw.add(refFrame.topLeft);
  const refOffset = groupBounds.offset
    .sub(pieceImgOrigin)
    .sub(new Point(padding, padding));

  wrapper.dataset.refPieceId = refPiece.id;
  wrapper.dataset.refOffsetX = refOffset.x;
  wrapper.dataset.refOffsetY = refOffset.y;

  // Position it using reference piece's element position as baseline
  const scaledRefOffset = refOffset.scaled(scale);
  const refElement = getPieceElement(refPiece.id);
  if (refElement) {
    const refLeft = parseFloat(refElement.style.left) || 0;
    const refTop = parseFloat(refElement.style.top) || 0;
    wrapper.style.left = refLeft + scaledRefOffset.x + "px";
    wrapper.style.top = refTop + scaledRefOffset.y + "px";
  }

  wrapper.style.transform = `rotate(${refPiece.rotation}deg)`;
  wrapper.style.position = "absolute";
  wrapper.style.pointerEvents = "none"; // Let interactions pass through to piece wrappers

  // Copy z-index from the highest piece in the group
  let maxZ = 0;
  pieces.forEach((p) => {
    if (p.zIndex && p.zIndex > maxZ) maxZ = p.zIndex;
  });
  if (maxZ > 0) wrapper.style.zIndex = maxZ.toString();

  return wrapper;
}

/**
 * Hide the canvas content of piece elements that belong to a rendered group.
 * The wrapper div stays visible and interactive (draggable, selectable).
 */
function hidePieceElements(pieces) {
  pieces.forEach((piece) => {
    const el = getPieceElement(piece.id);
    if (el) {
      const canvas = el.querySelector("canvas");
      if (canvas) canvas.style.visibility = "hidden";
    }
  });
}

// ================================
// Event Listeners
// ================================

registerGlobalEvent(GROUPS_CHANGED, (event) => {
  const { type, toGroupId, fromGroupId, pieceId } = event.detail;

  if (type === "merged" && toGroupId) {
    // Remove old group element if the from-group had one
    if (fromGroupId && groupElements.has(fromGroupId)) {
      const oldWrapper = groupElements.get(fromGroupId);
      oldWrapper.remove();
      groupElements.delete(fromGroupId);
    }
    // Also remove the existing to-group element (will be re-rendered)
    if (groupElements.has(toGroupId)) {
      const oldWrapper = groupElements.get(toGroupId);
      oldWrapper.remove();
      groupElements.delete(toGroupId);
    }
    // Re-render the merged group
    requestAnimationFrame(() => {
      renderGroup(toGroupId);
    });
  } else if (type === "detached" && fromGroupId) {
    // Remove old group rendering
    if (groupElements.has(fromGroupId)) {
      const oldWrapper = groupElements.get(fromGroupId);
      oldWrapper.remove();
      groupElements.delete(fromGroupId);
    }

    // Show the detached piece's canvas
    const piece = findPieceById(pieceId);
    if (piece) {
      const el = getPieceElement(piece.id);
      if (el) {
        const canvas = el.querySelector("canvas");
        if (canvas) canvas.style.visibility = "";
      }
    }

    // Re-render the remaining group if it still has multiple pieces
    const remainingGroup = groupManager.getGroup(fromGroupId);
    if (remainingGroup && remainingGroup.size() > 1) {
      requestAnimationFrame(() => {
        // Show piece canvases temporarily until group renders
        remainingGroup.allPieces.forEach((p) => {
          const el = getPieceElement(p.id);
          if (el) {
            const canvas = el.querySelector("canvas");
            if (canvas) canvas.style.visibility = "";
          }
        });
        renderGroup(fromGroupId);
      });
    } else if (remainingGroup) {
      // Single piece remaining - show its canvas
      remainingGroup.allPieces.forEach((p) => {
        const el = getPieceElement(p.id);
        if (el) {
          const canvas = el.querySelector("canvas");
          if (canvas) canvas.style.visibility = "";
        }
      });
    }
  }
});

/**
 * Find piece by ID from the state
 */
function findPieceById(pieceId) {
  return state?.pieces?.find((p) => p.id === pieceId);
}
