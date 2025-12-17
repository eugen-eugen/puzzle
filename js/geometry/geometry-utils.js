// geometry-utils.js - Utility functions for geometric operations
// ----------------------------------------------------------------
// Generic utility functions for working with geometric objects.

import { Point } from "./point.js";

/**
 * Normalize all Point fields in an object relative to an origin Point.
 * Creates a new object with all Point fields shifted by subtracting the origin.
 * Non-Point fields are copied as-is.
 *
 * @param {Object} pointsObject - Object containing Point fields to normalize
 * @param {Point} origin - Origin point to subtract from all Point fields
 * @returns {Object} New object with normalized Point fields
 *
 * @example
 * const corners = { nw: new Point(100, 50), ne: new Point(200, 50) };
 * const origin = new Point(100, 50);
 * const normalized = normalizePointsToOrigin(corners, origin);
 * // Result: { nw: Point(0, 0), ne: Point(100, 0) }
 */
export function normalizePointsToOrigin(pointsObject, origin) {
  const result = {};

  for (const [key, value] of Object.entries(pointsObject)) {
    if (value instanceof Point) {
      result[key] = value.sub(origin);
    } else {
      // Copy non-Point fields as-is
      result[key] = value;
    }
  }

  return result;
}

/**
 * Convert all fields with x/y attributes to Point instances.
 * Handles null values by preserving them as null.
 * Creates a new object with the same field names.
 *
 * @param {Object} xyObject - Object where fields have {x, y} attributes or are null
 * @returns {Object} New object with Point instances (or null for null fields)
 *
 * @example
 * const raw = { north: {x: 10, y: 20}, south: null };
 * const points = convertToPoints(raw);
 * // Result: { north: Point(10, 20), south: null }
 */
export function convertToPoints(xyObject) {
  const result = {};

  for (const [key, value] of Object.entries(xyObject)) {
    if (value && typeof value.x === "number" && typeof value.y === "number") {
      result[key] = new Point(value.x, value.y);
    } else {
      // Preserve null or other non-point values
      result[key] = value;
    }
  }

  return result;
}

