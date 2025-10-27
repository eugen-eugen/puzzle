// pieceRenderer.js - render real jigsaw piece bitmaps with drag & rotation

import { SpatialIndex, chooseCellSize } from "./spatialIndex.js";
import { state } from "./gameEngine.js";
import {
  initConnectionManager,
  handleDragMove,
  handleDragEnd,
} from "./connectionManager.js";
import {
  updateProgress,
  clearAllPieceOutlines,
  ensureRectInView,
  enforceInitialMargins,
  fitAllPiecesInView,
  getViewportState,
} from "./app.js";
import { Point, rotatePointDeg } from "./geometry/Point.js";
import { applyPiecePosition, screenToViewport } from "./display.js";
// windowManager no longer needed for cross-window transfer (single-window mode)

const pieceElements = new Map(); // id -> DOM element
let currentDrag = null;
let selectedPieceId = null;
let onSelectionChangeCallback = null;

// ================================
// Module Constants (magic numbers -> named)
// ================================
const DEFAULT_RENDER_SCALE = 0.7; // initial downscale factor for display vs original image size
const MIN_RENDERED_DIMENSION = 24; // Minimum drawn width/height to keep piece interactable
const OUTSIDE_THRESHOLD_PX = 40; // Distance from right boundary to mark piece as 'outside'
const DETACH_FLASH_DURATION_MS = 1000; // Duration of detached visual indicator
const CONNECTION_TOLERANCE_SQ = 30 * 30; // Squared distance tolerance passed to connection manager (~30px)
const DOUBLE_TAP_MAX_DELAY_MS = 320; // Max delay between taps to count as double-tap
const DOUBLE_TAP_MAX_DIST_SQ = 26 * 26; // Spatial tolerance between taps

// Keep old constant name for backward compatibility inside this module (if referenced elsewhere)
const SCALE = DEFAULT_RENDER_SCALE;
let spatialIndex = null;
// State for detecting double taps on touch devices
let lastTapTime = 0;
let lastTapPieceId = null;
// Store last tap position as a Point instead of separate scalars
let lastTapPos = new Point(0, 0);
// Track active touch pointers for multi-touch gestures (e.g., two-finger detach)
const activeTouchIds = new Set();

// Ensure piece has proper position setup (now handled by Piece class)
// This function is now mainly for backward compatibility
function ensurePiecePosition(piece) {
  // Piece class instances already have position and accessors set up
  if (piece.position instanceof Point) return piece;

  // Handle missing position (should be rare with new Piece class)
  if (!piece.position || !(piece.position instanceof Point)) {
    const initX = piece.position?.x || 0;
    const initY = piece.position?.y || 0;
    piece.position = new Point(initX, initY);
  }

  return piece;
}

// Treat element dimensions as a Point (width -> x, height -> y) for geometric ops.
function elementSizePoint(el) {
  return new Point(el.offsetWidth, el.offsetHeight);
}

function rotatePieceOrGroup(piece, el, rotationDegrees = 90) {
  const groupPieces = piece.getGroupPieces();
  if (groupPieces.length > 1) {
    rotateGroup(piece, rotationDegrees);
  } else {
    piece.rotate(rotationDegrees);
    el.style.transform = `rotate(${piece.rotation}deg)`;
  }
  ensureRectInView(piece.position, new Point(el.offsetWidth, el.offsetHeight), {
    forceZoom: false,
  });
}

export function scatterInitialPieces(container, pieces) {
  // Use viewport dimensions rather than container bounds since pieces are positioned in viewport space
  const areaW = container.clientWidth || 800; // fallback if no size
  const areaH = container.clientHeight || 600;
  console.debug("[pieceRenderer] scatterInitialPieces count", pieces.length);
  pieceElements.clear();
  // Initialize spatial index
  const avgSize =
    (pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) / pieces.length) *
    SCALE;
  spatialIndex = new SpatialIndex(areaW, areaH, chooseCellSize(avgSize));
  pieces.forEach((p) => {
    const wrapper = document.createElement("div");
    wrapper.className = "piece";
    wrapper.dataset.id = p.id;
    // Use a canvas element to draw the piece bitmap (already clipped) scaled down.
    const canvas = document.createElement("canvas");
    const scaledW = Math.max(MIN_RENDERED_DIMENSION, p.bitmap.width * SCALE);
    const scaledH = Math.max(MIN_RENDERED_DIMENSION, p.bitmap.height * SCALE);
    canvas.width = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(SCALE, SCALE);
    ctx.drawImage(p.bitmap, 0, 0);
    ctx.restore();
    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + "px";
    const left = Math.random() * (areaW - scaledW);
    const top = Math.random() * (areaH - scaledH);
    // Initialize Point position then apply via helper
    p.position = new Point(left, top);
    ensurePiecePosition(p); // installs accessors early
    applyPiecePosition(wrapper, p);
    wrapper.style.transform = `rotate(${p.rotation}deg)`;
    wrapper.appendChild(canvas);
    attachPieceEvents(wrapper, p);
    container.appendChild(wrapper);
    pieceElements.set(p.id, wrapper);
    // Position already set & applied above
    p.scale = SCALE;
    const centerPoint = p.position.added(scaledW / 2, scaledH / 2);
    spatialIndex.insert({ id: p.id, position: centerPoint });
  });
  // Initialize connection manager once pieces & spatial index are ready
  initConnectionManager({
    spatialIndex,
    getPieceById: (id) => state.pieces.find((pp) => pp.id === id),
    tolerance: CONNECTION_TOLERANCE_SQ, // squared distance tolerance (~30px)
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });
  installGlobalListeners(container);
}

// Render pieces using their saved position and rotation instead of scattering.
// Creates a fresh spatial index reflecting current positions.
export function renderPiecesAtPositions(container, pieces) {
  const areaW = container.clientWidth || 800;
  const areaH = container.clientHeight || 600;
  console.debug("[pieceRenderer] renderPiecesAtPositions count", pieces.length);
  pieceElements.clear();
  // Initialize spatial index based on average size similar to scatter
  const avgSize =
    (pieces.reduce((acc, p) => acc + Math.min(p.w, p.h), 0) / pieces.length) *
    (pieces[0]?.scale || SCALE || 0.7);
  spatialIndex = new SpatialIndex(areaW, areaH, chooseCellSize(avgSize));
  pieces.forEach((p) => {
    const wrapper = document.createElement("div");
    wrapper.className = "piece";
    wrapper.dataset.id = p.id;
    const canvas = document.createElement("canvas");
    const scale = p.scale || SCALE;
    const scaledW = Math.max(24, p.bitmap.width * scale);
    const scaledH = Math.max(24, p.bitmap.height * scale);
    canvas.width = scaledW;
    canvas.height = scaledH;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(p.bitmap, 0, 0);
    ctx.restore();
    wrapper.style.width = scaledW + "px";
    wrapper.style.height = scaledH + "px";
    // Use saved position; if missing, fallback to random placement
    const left =
      p.position instanceof Point
        ? p.position.x
        : Math.random() * (areaW - scaledW);
    const top =
      p.position instanceof Point
        ? p.position.y
        : Math.random() * (areaH - scaledH);
    // Initialize Point position then apply via helper
    p.position = new Point(left, top);
    ensurePiecePosition(p);
    applyPiecePosition(wrapper, p);
    wrapper.style.transform = `rotate(${p.rotation}deg)`;
    wrapper.appendChild(canvas);
    // Position already set & applied above
    p.scale = scale;
    pieceElements.set(p.id, wrapper);
    attachPieceEvents(wrapper, p);
    container.appendChild(wrapper);
    const centerPoint = p.position.added(scaledW / 2, scaledH / 2);
    spatialIndex.insert({ id: p.id, position: centerPoint });
  });
  initConnectionManager({
    spatialIndex,
    getPieceById: (id) => state.pieces.find((pp) => pp.id === id),
    tolerance: 900,
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });
  installGlobalListeners(container);
}

function attachPieceEvents(el, piece) {
  el.addEventListener("pointerdown", (e) => {
    // Only primary button / finger
    if (e.button !== 0 && e.pointerType !== "touch") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === "touch") {
      activeTouchIds.add(e.pointerId);
    }
    selectPiece(piece.id);

    // Clear validation outlines when piece is picked up
    clearAllPieceOutlines();

    // Check if Control is pressed - this will detach the piece from its group
    const isCtrlPressed = e.ctrlKey;

    // Multi-touch detach condition (two or more active touch points)
    const multiTouchDetach =
      e.pointerType === "touch" && activeTouchIds.size >= 2;
    if ((isCtrlPressed || multiTouchDetach) && piece.groupId) {
      detachPieceFromGroup(piece);
    }

    // Double-tap detection (touch): detect before initiating drag

    const now = performance.now();
    const dt = now - lastTapTime;
    const tapPos = new Point(e.clientX, e.clientY);

    // Use Point delta instead of separate dx/dy scalars
    const delta = Point.from(tapPos).sub(lastTapPos);
    const distSq = delta.x * delta.x + delta.y * delta.y;

    if (
      piece.id === lastTapPieceId &&
      dt <= DOUBLE_TAP_MAX_DELAY_MS &&
      distSq <= DOUBLE_TAP_MAX_DIST_SQ
    ) {
      // Treat as double-tap -> rotate 90° clockwise
      rotatePieceOrGroup(piece, el, 90);
      // Reset tap state to avoid chaining triple taps
      lastTapTime = 0;
      lastTapPieceId = null;
      return; // Skip drag init
    }
    // Record as first tap
    lastTapTime = now;
    lastTapPieceId = piece.id;
    lastTapPos = tapPos;

    // Convert screen coordinates to viewport coordinates (after double-tap check)
    const viewportState = getViewportState();
    const viewportPos = screenToViewport(
      new Point(e.clientX, e.clientY),
      new Point(viewportState.panX, viewportState.panY),
      viewportState.zoomLevel
    );
    const rect = el.getBoundingClientRect();

    currentDrag = {
      id: piece.id,
      offsetX: viewportPos.x - piece.position.x,
      offsetY: viewportPos.y - piece.position.y,
      originLeft: parseFloat(el.style.left),
      originTop: parseFloat(el.style.top),
      isDetached: (isCtrlPressed || multiTouchDetach) && piece.groupId, // Track if this piece was detached
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  el.addEventListener("pointermove", (e) => {
    if (!currentDrag || currentDrag.id !== piece.id) return;
    e.preventDefault();

    // Convert screen coordinates to viewport coordinates
    const viewportState = getViewportState();
    const viewportPos = screenToViewport(
      new Point(e.clientX, e.clientY),
      new Point(viewportState.panX, viewportState.panY),
      viewportState.zoomLevel
    );
    let newLeft = viewportPos.x - currentDrag.offsetX;
    let newTop = viewportPos.y - currentDrag.offsetY;

    // Calculate movement delta
    const deltaX = newLeft - piece.position.x;
    const deltaY = newTop - piece.position.y;

    // Move pieces - if detached, only move this piece; otherwise move the whole group
    if (currentDrag.isDetached) {
      const delta = new Point(deltaX, deltaY);
      moveSinglePiece(piece, delta);
    } else {
      moveGroup(piece, deltaX, deltaY);
    }

    const container = el.parentElement;
    const cRect = container.getBoundingClientRect();
    // Border overflow detection (any side beyond threshold)
    const overLeft = newLeft < -OUTSIDE_THRESHOLD_PX;
    const overTop = newTop < -OUTSIDE_THRESHOLD_PX;
    const overRight =
      newLeft + el.offsetWidth > cRect.width + OUTSIDE_THRESHOLD_PX;
    const overBottom =
      newTop + el.offsetHeight > cRect.height + OUTSIDE_THRESHOLD_PX;
    const isOutside = overLeft || overTop || overRight || overBottom;
    if (isOutside && !el.dataset.outside) {
      console.debug("[pieceRenderer] outside threshold (global)", piece.id);
      el.dataset.outside = "true";
    } else if (!isOutside && el.dataset.outside) {
      console.debug("[pieceRenderer] back inside", piece.id);
      delete el.dataset.outside;
    }
    // Connection candidate evaluation during drag
    handleDragMove(piece);
  });

  el.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") activeTouchIds.delete(e.pointerId);
    if (currentDrag && currentDrag.id === piece.id) {
      const wasDetached = currentDrag?.isDetached || false;
      currentDrag = null;
      handleDragEnd(piece, wasDetached);
      const wentOutside = !!el.dataset.outside;
      enforceInitialMargins();
      if (wentOutside) {
        // New logic: fit all pieces into view
        fitAllPiecesInView();
        delete el.dataset.outside; // reset flag
      } else {
        ensureRectInView(
          piece.position,
          new Point(el.offsetWidth, el.offsetHeight),
          { forceZoom: false }
        );
      }
    }
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });

  // In case pointer leaves (e.g., finger lifted outside element), end drag
  el.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch") activeTouchIds.delete(e.pointerId);
    if (currentDrag && currentDrag.id === piece.id) {
      const wasDetached = currentDrag?.isDetached || false;
      currentDrag = null;
      handleDragEnd(piece, wasDetached);
      const wentOutside = !!el.dataset.outside;
      enforceInitialMargins();
      if (wentOutside) {
        fitAllPiecesInView();
        delete el.dataset.outside;
      } else {
        ensureRectInView(
          piece.position,
          new Point(el.offsetWidth, el.offsetHeight),
          { forceZoom: false }
        );
      }
    }
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });
}

function moveGroup(draggedPiece, deltaX, deltaY) {
  // Get all pieces in the same group as the dragged piece
  const groupPieces = draggedPiece.getGroupPieces();

  groupPieces.forEach((p) => {
    // Update piece position
    ensurePiecePosition(p);
    p.position.mutAdd(deltaX, deltaY);

    // Update DOM element position
    const el = pieceElements.get(p.id);
    if (el) {
      applyPiecePosition(el, p);
    }

    // Update spatial index
    if (spatialIndex) {
      const scaledW = el ? el.offsetWidth : p.bitmap.width * SCALE;
      const scaledH = el ? el.offsetHeight : p.bitmap.height * SCALE;
      const centerPoint = p.position.added(scaledW / 2, scaledH / 2);
      spatialIndex.update({ id: p.id, position: centerPoint });
    }
  });
}

function getGroupPieces(piece) {
  // Use Piece class method
  return piece.getGroupPieces();
}

function detachPieceFromGroup(piece) {
  const oldGroupId = piece.groupId;

  console.debug(
    "[pieceRenderer] Detaching piece",
    piece.id,
    "from group",
    oldGroupId
  );

  // Create a new unique group for this piece using Piece method
  const newGroupId = piece.detachFromGroup();

  // Add visual indication that this piece is detached
  const el = pieceElements.get(piece.id);
  if (el) {
    el.classList.add("detached-piece");
    // Remove the class after a short time to show the action
    setTimeout(
      () => el.classList.remove("detached-piece"),
      DETACH_FLASH_DURATION_MS
    );
  }

  console.debug(
    "[pieceRenderer] Piece",
    piece.id,
    "moved to new group",
    newGroupId
  );

  // Update progress after detachment
  updateProgress();

  // TODO: In the future, implement proper group splitting if the removal
  // breaks the group into multiple disconnected components
}

function moveSinglePiece(piece, delta) {
  const d =
    delta instanceof Point ? delta : new Point(delta.x || 0, delta.y || 0);
  piece.move(d);

  // Update DOM element position
  const el = pieceElements.get(piece.id);
  if (el) {
    applyPiecePosition(el, piece);
  }

  // Update spatial index
  if (spatialIndex) {
    piece.updateSpatialIndex(spatialIndex, el);
  }
}

function rotateGroup(selectedPiece, rotationDegrees) {
  // All pieces sharing groupId rotate around the selected piece's visual center.
  const groupPieces = selectedPiece.getGroupPieces();
  const selectedEl = pieceElements.get(selectedPiece.id);
  if (!selectedEl) return;
  const selectedSize = elementSizePoint(selectedEl);
  const pivot = selectedPiece.getCenter(selectedEl);

  groupPieces.forEach((piece) => {
    const pieceEl = pieceElements.get(piece.id);
    if (!pieceEl) return;

    // Update cumulative rotation using Piece method
    piece.rotate(rotationDegrees);

    const size = elementSizePoint(pieceEl);
    const halfSize = size.scaled(0.5);
    const preCenter = piece.getCenter(pieceEl);
    const rotatedCenter = Point.from(
      rotatePointDeg(
        preCenter.x,
        preCenter.y,
        pivot.x,
        pivot.y,
        rotationDegrees
      )
    );
    const topLeft = rotatedCenter.clone().mutSubPoint(halfSize);
    piece.setPosition(topLeft);

    // Apply DOM updates
    piece.applyToElement(pieceEl);

    if (spatialIndex) {
      piece.updateSpatialIndex(spatialIndex, pieceEl);
    }
  });
}

function applyHighlight(pieceId, candidateData) {
  // Remove previous highlight classes
  pieceElements.forEach((el) => el.classList.remove("candidate-highlight"));
  if (pieceId == null) return;
  const el = pieceElements.get(pieceId);
  if (el) el.classList.add("candidate-highlight");
}

export function getPieceElement(id) {
  return pieceElements.get(id);
}

export function getSelectedPiece() {
  if (!selectedPieceId) return null;
  return findPiece(selectedPieceId);
}

export function fixSelectedPieceOrientation() {
  if (!selectedPieceId) return false;

  const piece = findPiece(selectedPieceId);
  const pieceEl = pieceElements.get(selectedPieceId);
  if (!piece || !pieceEl) return false;

  // Calculate how much to rotate to get back to 0 degrees
  const currentRotation = piece.rotation;
  if (currentRotation === 0) return true; // Already correctly oriented

  // Calculate the shortest rotation to get to 0
  let targetRotation = -currentRotation;
  if (targetRotation <= -180) targetRotation += 360;
  if (targetRotation > 180) targetRotation -= 360;

  // Apply the rotation
  if (piece.getGroupPieces().length > 1) {
    // If piece is in a group, rotate the whole group
    rotateGroup(piece, targetRotation);
  } else {
    // Single piece rotation
    piece.rotation = 0; // Set directly to 0 for precision
    pieceEl.style.transform = `rotate(0deg)`;
  }

  return true;
}

export function setSelectionChangeCallback(callback) {
  onSelectionChangeCallback = callback;
}

function selectPiece(id) {
  if (selectedPieceId === id) return;
  if (selectedPieceId != null) {
    const prev = pieceElements.get(selectedPieceId);
    if (prev) prev.classList.remove("selected");
  }
  const el = pieceElements.get(id);
  if (el) {
    el.classList.add("selected");
    // bring to front
    el.style.zIndex = Date.now().toString();
  }
  selectedPieceId = id;

  // Notify callback about selection change
  if (onSelectionChangeCallback) {
    const piece = findPiece(id);
    onSelectionChangeCallback(piece);
  }
}

function installGlobalListeners(container) {
  if (installGlobalListeners._installed) return;
  installGlobalListeners._installed = true;
  container.addEventListener("click", (e) => {
    if (e.target === container) {
      // deselect
      if (selectedPieceId != null) {
        const prev = pieceElements.get(selectedPieceId);
        if (prev) prev.classList.remove("selected");
        selectedPieceId = null;

        // Notify callback about deselection
        if (onSelectionChangeCallback) {
          onSelectionChangeCallback(null);
        }
      }
    }
  });
  // Prevent touch-based scrolling inside puzzle area
  container.addEventListener(
    "touchmove",
    (e) => {
      if (currentDrag) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if (!selectedPieceId) return;
    const pieceEl = pieceElements.get(selectedPieceId);
    if (!pieceEl) return;
    const piece = findPiece(selectedPieceId);
    if (!piece) return;
    if (e.key === "r" || e.key === "R") {
      const rotationAmount = e.shiftKey ? 270 : 90; // Shift+R = counter-clockwise

      // If piece is in a group with other pieces, rotate the entire group around this piece's center
      const groupPieces = getGroupPieces(piece);
      if (groupPieces.length > 1) {
        rotateGroup(piece, rotationAmount);
      } else {
        // Single piece rotation
        piece.rotation = (piece.rotation + rotationAmount) % 360;
        pieceEl.style.transform = `rotate(${piece.rotation}deg)`;
      }
      ensureRectInView(
        piece.position,
        new Point(pieceEl.offsetWidth, pieceEl.offsetHeight),
        { forceZoom: false }
      );
    }
  });
}

// Lookup piece by ID from state
function findPiece(id) {
  // Use the imported state from gameEngine
  return state.pieces.find((p) => p.id === id);
}

// transferPieceToTable removed (single-window mode)

// cloneBitmapPayload removed (no longer needed with dataURL strategy)
