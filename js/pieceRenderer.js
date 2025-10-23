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
} from "./app.js";
// windowManager no longer needed for cross-window transfer (single-window mode)

const pieceElements = new Map(); // id -> DOM element
let currentDrag = null;
let selectedPieceId = null;

const SCALE = 0.35; // initial downscale factor for display vs original image size
let spatialIndex = null;

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
    const scaledW = Math.max(24, p.bitmap.width * SCALE);
    const scaledH = Math.max(24, p.bitmap.height * SCALE);
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
    tolerance: 900, // default squared distance tolerance (~30px)
    onHighlightChange: (pieceId, data) => applyHighlight(pieceId, data),
    getPieceElement: (id) => pieceElements.get(id),
  });
  installGlobalListeners(container);
}

function attachPieceEvents(el, piece) {
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // left only
    e.preventDefault();
    selectPiece(piece.id);

    // Clear validation outlines when piece is picked up
    clearAllPieceOutlines();

    // Check if Shift is pressed - this will detach the piece from its group
    const isShiftPressed = e.shiftKey;
    if (isShiftPressed && piece.groupId) {
      console.debug(
        "[pieceRenderer] Shift+drag: detaching piece from group",
        piece.id
      );
      detachPieceFromGroup(piece);
    }

    // Convert screen coordinates to viewport coordinates
    const viewportPos = screenToViewport(e.clientX, e.clientY);
    const rect = el.getBoundingClientRect();

    currentDrag = {
      id: piece.id,
      offsetX: viewportPos.x - piece.displayX,
      offsetY: viewportPos.y - piece.displayY,
      originLeft: parseFloat(el.style.left),
      originTop: parseFloat(el.style.top),
      isDetached: isShiftPressed && piece.groupId, // Track if this piece was detached
    };
    el.setPointerCapture(e.pointerId);
    console.debug(
      "[pieceRenderer] drag start",
      piece.id,
      isShiftPressed ? "(detached)" : ""
    );
  });

  el.addEventListener("pointermove", (e) => {
    if (!currentDrag || currentDrag.id !== piece.id) return;

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
    // Note: boundary checking might need adjustment for zoom, but keeping simple for now
    if (newLeft + el.offsetWidth > cRect.width + 40) {
      if (!el.dataset.outside)
        console.debug("[pieceRenderer] outside threshold", piece.id);
      el.dataset.outside = "true";
    } else if (el.dataset.outside) {
      console.debug("[pieceRenderer] back inside", piece.id);
      delete el.dataset.outside;
    }
    // Connection candidate evaluation during drag
    handleDragMove(piece);
  });

  el.addEventListener("pointerup", () => {
    // End drag in single-window mode
    const wasDetached = currentDrag?.isDetached || false;
    currentDrag = null;
    handleDragEnd(piece, wasDetached);
  });

  el.addEventListener("dblclick", () => {
    // Rotate 90° on double-click
    piece.rotation = (piece.rotation + 90) % 360;
    el.style.transform = `rotate(${piece.rotation}deg)`;
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
  // If piece has no group, return just this piece
  if (!piece.groupId) {
    return [piece];
  }

  // Find all pieces with the same groupId
  return state.pieces.filter((p) => p.groupId === piece.groupId);
}

function detachPieceFromGroup(piece) {
  if (!piece.groupId) return; // Already not in a group

  const oldGroupId = piece.groupId;

  console.debug(
    "[pieceRenderer] Detaching piece",
    piece.id,
    "from group",
    oldGroupId
  );

  // Remove this piece from the group
  piece.groupId = null;

  // Add visual indication that this piece is detached
  const el = pieceElements.get(piece.id);
  if (el) {
    el.classList.add("detached-piece");
    // Remove the class after a short time to show the action
    setTimeout(() => el.classList.remove("detached-piece"), 1000);
  }

  // If the group now has only one piece left, remove its groupId too
  const remainingGroupPieces = state.pieces.filter(
    (p) => p.groupId === oldGroupId
  );
  if (remainingGroupPieces.length === 1) {
    console.debug(
      "[pieceRenderer] Group",
      oldGroupId,
      "now has only one piece, ungrouping"
    );
    remainingGroupPieces[0].groupId = null;
  }

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
  window.addEventListener("keydown", (e) => {
    if (!selectedPieceId) return;
    const pieceEl = pieceElements.get(selectedPieceId);
    if (!pieceEl) return;
    const piece = findPiece(selectedPieceId);
    if (!piece) return;
    if (e.key === "r" || e.key === "R") {
      piece.rotation = (piece.rotation + (e.shiftKey ? 270 : 90)) % 360;
      pieceEl.style.transform = `rotate(${piece.rotation}deg)`;
    }
  });
}

// Temporary lookup; to be replaced with centralized state reference.
function findPiece(id) {
  // We expect global state from gameEngine; import lazily to avoid circular refs.
  try {
    const { state } = require("./gameEngine.js"); // will fail in ESM
    return state.pieces.find((p) => p.id === id);
  } catch {
    // Fallback: no direct access; return null (rotation already stored on element side)
    return null;
  }
}

// transferPieceToTable removed (single-window mode)

// cloneBitmapPayload removed (no longer needed with dataURL strategy)
