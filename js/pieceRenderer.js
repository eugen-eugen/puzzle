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
  screenToViewport,
  ensureRectInView,
  enforceInitialMargins,
  fitAllPiecesInView,
} from "./app.js";
// windowManager no longer needed for cross-window transfer (single-window mode)

const pieceElements = new Map(); // id -> DOM element
let currentDrag = null;
let selectedPieceId = null;

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
let lastTapX = 0;
let lastTapY = 0;
// Track active touch pointers for multi-touch gestures (e.g., two-finger detach)
const activeTouchIds = new Set();

function updateTouchDebug() {
  const el = document.getElementById("touchDebug");
  if (!el) return;
  el.textContent = "t:" + activeTouchIds.size;
}

function rotatePieceOrGroup(piece, el, rotationDegrees = 90) {
  const groupPieces = getGroupPieces(piece);
  if (groupPieces.length > 1) {
    rotateGroup(piece, rotationDegrees);
  } else {
    piece.rotation = (piece.rotation + rotationDegrees) % 360;
    el.style.transform = `rotate(${piece.rotation}deg)`;
  }
  ensureRectInView(
    piece.displayX,
    piece.displayY,
    el.offsetWidth,
    el.offsetHeight,
    { forceZoom: false }
  );
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
    wrapper.style.left = left + "px";
    wrapper.style.top = top + "px";
    wrapper.style.transform = `rotate(${p.rotation}deg)`;
    wrapper.appendChild(canvas);
    attachPieceEvents(wrapper, p);
    container.appendChild(wrapper);
    pieceElements.set(p.id, wrapper);
    // Track display position (for now separate from original grid coordinates)
    p.displayX = left;
    p.displayY = top;
    p.scale = SCALE;
    spatialIndex.insert({
      id: p.id,
      x: left + scaledW / 2,
      y: top + scaledH / 2,
    });
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

// Render pieces using their saved displayX/displayY and rotation instead of scattering.
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
      typeof p.displayX === "number"
        ? p.displayX
        : Math.random() * (areaW - scaledW);
    const top =
      typeof p.displayY === "number"
        ? p.displayY
        : Math.random() * (areaH - scaledH);
    wrapper.style.left = left + "px";
    wrapper.style.top = top + "px";
    wrapper.style.transform = `rotate(${p.rotation}deg)`;
    wrapper.appendChild(canvas);
    // Normalize state fields in case they were absent
    p.displayX = left;
    p.displayY = top;
    p.scale = scale;
    pieceElements.set(p.id, wrapper);
    attachPieceEvents(wrapper, p);
    container.appendChild(wrapper);
    spatialIndex.insert({
      id: p.id,
      x: left + scaledW / 2,
      y: top + scaledH / 2,
    });
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
      updateTouchDebug();
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
      console.debug(
        "[pieceRenderer] detaching piece from group via",
        isCtrlPressed ? "control" : "multi-touch",
        piece.id
      );
      detachPieceFromGroup(piece);
    }

    // Double-tap detection (touch): detect before initiating drag
    if (e.pointerType === "touch" && e.isPrimary && activeTouchIds.size === 1) {
      const now = performance.now();
      const dt = now - lastTapTime;
      const dx = e.clientX - lastTapX;
      const dy = e.clientY - lastTapY;
      const distSq = dx * dx + dy * dy;
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
      lastTapX = e.clientX;
      lastTapY = e.clientY;
    }

    // Convert screen coordinates to viewport coordinates (after double-tap check)
    const viewportPos = screenToViewport(e.clientX, e.clientY);
    const rect = el.getBoundingClientRect();

    currentDrag = {
      id: piece.id,
      offsetX: viewportPos.x - piece.displayX,
      offsetY: viewportPos.y - piece.displayY,
      originLeft: parseFloat(el.style.left),
      originTop: parseFloat(el.style.top),
      isDetached: (isCtrlPressed || multiTouchDetach) && piece.groupId, // Track if this piece was detached
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
    console.debug(
      "[pieceRenderer] drag start",
      piece.id,
      isCtrlPressed || multiTouchDetach ? "(detached)" : ""
    );
  });

  el.addEventListener("pointermove", (e) => {
    if (!currentDrag || currentDrag.id !== piece.id) return;
    e.preventDefault();

    // Convert screen coordinates to viewport coordinates
    const viewportPos = screenToViewport(e.clientX, e.clientY);
    let newLeft = viewportPos.x - currentDrag.offsetX;
    let newTop = viewportPos.y - currentDrag.offsetY;

    // Calculate movement delta
    const deltaX = newLeft - piece.displayX;
    const deltaY = newTop - piece.displayY;

    // Move pieces - if detached, only move this piece; otherwise move the whole group
    if (currentDrag.isDetached) {
      moveSinglePiece(piece, deltaX, deltaY);
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
    if (e.pointerType === "touch") updateTouchDebug();
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
          piece.displayX,
          piece.displayY,
          el.offsetWidth,
          el.offsetHeight,
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
    if (e.pointerType === "touch") updateTouchDebug();
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
          piece.displayX,
          piece.displayY,
          el.offsetWidth,
          el.offsetHeight,
          { forceZoom: false }
        );
      }
    }
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (_) {}
  });

  el.addEventListener("dblclick", () => {
    rotatePieceOrGroup(piece, el, 90);
  });
}

function moveGroup(draggedPiece, deltaX, deltaY) {
  // Get all pieces in the same group as the dragged piece
  const groupPieces = getGroupPieces(draggedPiece);

  groupPieces.forEach((p) => {
    // Update piece position
    p.displayX += deltaX;
    p.displayY += deltaY;

    // Update DOM element position
    const el = pieceElements.get(p.id);
    if (el) {
      el.style.left = p.displayX + "px";
      el.style.top = p.displayY + "px";
    }

    // Update spatial index
    if (spatialIndex) {
      const scaledW = el ? el.offsetWidth : p.bitmap.width * SCALE;
      const scaledH = el ? el.offsetHeight : p.bitmap.height * SCALE;
      spatialIndex.update({
        id: p.id,
        x: p.displayX + scaledW / 2,
        y: p.displayY + scaledH / 2,
      });
    }
  });
}

function getGroupPieces(piece) {
  // All pieces always have a groupId now
  // Find all pieces with the same groupId
  return state.pieces.filter((p) => p.groupId === piece.groupId);
}

function detachPieceFromGroup(piece) {
  const oldGroupId = piece.groupId;

  console.debug(
    "[pieceRenderer] Detaching piece",
    piece.id,
    "from group",
    oldGroupId
  );

  // Create a new unique group for this piece
  const newGroupId = "g" + piece.id + "_" + Date.now();
  piece.groupId = newGroupId;

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

function moveSinglePiece(piece, deltaX, deltaY) {
  // Update piece position
  piece.displayX += deltaX;
  piece.displayY += deltaY;

  // Update DOM element position
  const el = pieceElements.get(piece.id);
  if (el) {
    el.style.left = piece.displayX + "px";
    el.style.top = piece.displayY + "px";
  }

  // Update spatial index
  if (spatialIndex) {
    const scaledW = el ? el.offsetWidth : piece.bitmap.width * SCALE;
    const scaledH = el ? el.offsetHeight : piece.bitmap.height * SCALE;
    spatialIndex.update({
      id: piece.id,
      x: piece.displayX + scaledW / 2,
      y: piece.displayY + scaledH / 2,
    });
  }
}

function rotateGroup(selectedPiece, rotationDegrees) {
  // Get all pieces in the same group as the selected piece
  const groupPieces = getGroupPieces(selectedPiece);

  // Calculate the rotation center (center of the selected piece)
  const selectedEl = pieceElements.get(selectedPiece.id);
  if (!selectedEl) return;

  const scaledW = selectedEl.offsetWidth;
  const scaledH = selectedEl.offsetHeight;
  const centerX = selectedPiece.displayX + scaledW / 2;
  const centerY = selectedPiece.displayY + scaledH / 2;

  // Convert rotation to radians
  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  groupPieces.forEach((piece) => {
    // Update piece rotation
    piece.rotation = (piece.rotation + rotationDegrees) % 360;
    if (piece.rotation < 0) piece.rotation += 360;

    // Calculate piece center before rotation
    const pieceEl = pieceElements.get(piece.id);
    if (!pieceEl) return;

    const pieceScaledW = pieceEl.offsetWidth;
    const pieceScaledH = pieceEl.offsetHeight;
    const pieceCenterX = piece.displayX + pieceScaledW / 2;
    const pieceCenterY = piece.displayY + pieceScaledH / 2;

    // Rotate piece center around selected piece center
    const dx = pieceCenterX - centerX;
    const dy = pieceCenterY - centerY;
    const newCenterX = centerX + (dx * cos - dy * sin);
    const newCenterY = centerY + (dx * sin + dy * cos);

    // Update piece position (convert back from center to top-left)
    piece.displayX = newCenterX - pieceScaledW / 2;
    piece.displayY = newCenterY - pieceScaledH / 2;

    // Update DOM element
    pieceEl.style.left = piece.displayX + "px";
    pieceEl.style.top = piece.displayY + "px";
    pieceEl.style.transform = `rotate(${piece.rotation}deg)`;

    // Update spatial index
    if (spatialIndex) {
      spatialIndex.update({
        id: piece.id,
        x: piece.displayX + pieceScaledW / 2,
        y: piece.displayY + pieceScaledH / 2,
      });
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
        piece.displayX,
        piece.displayY,
        pieceEl.offsetWidth,
        pieceEl.offsetHeight,
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
