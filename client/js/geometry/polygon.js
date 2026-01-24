// polygon.js - Polygon utility functions
// Provides geometric operations on polygons represented as arrays of Points

import { Point } from "./point.js";
import { Rectangle } from "./rectangle.js";

/**
 * Calculate the minimal bounding rectangle that contains all given points
 * @param {Point[]} points - Array of Point objects
 * @returns {Rectangle} Rectangle with topLeft and bottomRight properties
 */
export function boundingFrame(points) {
  if (!points || points.length === 0) {
    return Rectangle.fromPoints(new Point(0, 0), new Point(0, 0));
  }

  // Find min/max coordinates
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (point && point.x !== undefined && point.y !== undefined) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  // Handle edge case where no valid points found
  if (!isFinite(minX)) {
    return Rectangle.fromPoints(new Point(0, 0), new Point(0, 0));
  }

  return Rectangle.fromPoints(new Point(minX, minY), new Point(maxX, maxY));
}
