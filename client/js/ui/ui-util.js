// ui-util.js - Utility functions for UI canvas operations

/**
 * Reset canvas transform and clear it completely
 * @param {HTMLCanvasElement} canvas - The canvas to clear
 */
export function resetAndClearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
