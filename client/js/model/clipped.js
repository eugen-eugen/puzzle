// clipped.js - Shared spline edge drawing utilities for piece and group rendering
// Consolidates the addEdgeSpline algorithm used by both Piece path generation
// and group-renderer boundary tracing.

import { Point } from "../geometry/point.js";

/**
 * Tension parameter for Catmull-Rom style spline interpolation.
 * 0 = straight lines, 1 = maximum curvature.
 */
const SPLINE_TENSION = 0.2;

/**
 * Add a spline curve for one edge to a Path2D.
 * Creates smooth interpolating spline that passes through all side points.
 * Uses cubic Bezier curves with calculated control points based on tangents.
 *
 * @param {Path2D} path - Path to add the curve to
 * @param {import('../geometry/point.js').Point} startCorner - Starting corner point
 * @param {import('../geometry/point.js').Point[]} sidePoints - Array of side points (may be empty for border edges)
 * @param {import('../geometry/point.js').Point} endCorner - Ending corner point
 * @param {Point|number} [offsetOrDx=0] - Point offset or horizontal offset number
 * @param {number} [dy=0] - Vertical offset (only used when offsetOrDx is a number)
 */
export function addEdgeSpline(
  path,
  startCorner,
  sidePoints,
  endCorner,
  offsetOrDx = 0,
  dy = 0,
) {
  const dx = offsetOrDx instanceof Point ? offsetOrDx.x : offsetOrDx;
  const dyVal = offsetOrDx instanceof Point ? offsetOrDx.y : dy;

  if (!sidePoints || sidePoints.length === 0) {
    path.lineTo(endCorner.x + dx, endCorner.y + dyVal);
    return;
  }

  const points = [startCorner, ...sidePoints, endCorner];

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = i < points.length - 1 ? points[i + 1] : null;

    const pPrev = i > 1 ? points[i - 2] : p0;
    const tangent1 = p1.sub(pPrev).scaled(SPLINE_TENSION);

    const pNext = p2 || p1;
    const tangent2 = pNext.sub(p0).scaled(SPLINE_TENSION);

    const cp1 = p0.add(tangent1);
    const cp2 = p1.sub(tangent2);

    path.bezierCurveTo(
      cp1.x + dx,
      cp1.y + dyVal,
      cp2.x + dx,
      cp2.y + dyVal,
      p1.x + dx,
      p1.y + dyVal,
    );
  }
}

/**
 * Add a spline edge in reverse direction.
 * Used for tracing south (SE->SW) and west (SW->NW) edges in closed outlines.
 *
 * @param {Path2D} path
 * @param {import('../geometry/point.js').Point} fromCorner - Where we're coming from (e.g., SE)
 * @param {import('../geometry/point.js').Point[]} sidePoints - Original edge side points (in original direction)
 * @param {import('../geometry/point.js').Point} toCorner - Where we're going (e.g., SW)
 * @param {Point|number} [offsetOrDx=0] - Point offset or horizontal offset number
 * @param {number} [dy=0] - Vertical offset (only used when offsetOrDx is a number)
 */
export function addEdgeSplineReversed(
  path,
  fromCorner,
  sidePoints,
  toCorner,
  offsetOrDx = 0,
  dy = 0,
) {
  if (!sidePoints || sidePoints.length === 0) {
    const dx = offsetOrDx instanceof Point ? offsetOrDx.x : offsetOrDx;
    const dyVal = offsetOrDx instanceof Point ? offsetOrDx.y : dy;
    path.lineTo(toCorner.x + dx, toCorner.y + dyVal);
    return;
  }

  const reversedSidePoints = [...sidePoints].reverse();
  addEdgeSpline(path, fromCorner, reversedSidePoints, toCorner, offsetOrDx, dy);
}
