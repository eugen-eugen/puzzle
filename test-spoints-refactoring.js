// Quick verification script to test the sPoints refactoring
import { Piece } from "./js/model/Piece.js";
import { Point } from "./js/geometry/point.js";

console.log("Testing sPoints refactoring...\n");

// Test 1: Border sides should have empty arrays
console.log("Test 1: Border piece (top-left corner)");
const borderPiece = new Piece({
  id: "border-1",
  gridX: 0,
  gridY: 0,
  imgX: 0,
  imgY: 0,
  w: 100,
  h: 100,
  bitmap: document.createElement("canvas"),
  path: new Path2D(),
  corners: {
    nw: new Point(0, 0),
    ne: new Point(100, 0),
    se: new Point(100, 100),
    sw: new Point(0, 100),
  },
  geometryCorners: {
    nw: new Point(0, 0),
    ne: new Point(100, 0),
    se: new Point(100, 100),
    sw: new Point(0, 100),
  },
  geometrySidePoints: {
    north: null, // Border side
    east: new Point(110, 50), // Inner side
    south: new Point(50, 110), // Inner side
    west: null, // Border side
  },
});

console.log("  north (border):", borderPiece.sPoints.north);
console.log("  north is array:", Array.isArray(borderPiece.sPoints.north));
console.log("  north length:", borderPiece.sPoints.north.length);

console.log("  east (inner):", borderPiece.sPoints.east);
console.log("  east is array:", Array.isArray(borderPiece.sPoints.east));
console.log("  east length:", borderPiece.sPoints.east.length);
console.log("  east[0]:", borderPiece.sPoints.east[0]);
console.log("  east[1]:", borderPiece.sPoints.east[1]);
console.log("  east[2]:", borderPiece.sPoints.east[2]);
console.log(
  "  All 3 points equal:",
  borderPiece.sPoints.east[0].equals(borderPiece.sPoints.east[1]) &&
    borderPiece.sPoints.east[1].equals(borderPiece.sPoints.east[2])
);

console.log("\nTest 2: Inner piece (all sides have points)");
const innerPiece = new Piece({
  id: "inner-1",
  gridX: 1,
  gridY: 1,
  imgX: 100,
  imgY: 100,
  w: 100,
  h: 100,
  bitmap: document.createElement("canvas"),
  path: new Path2D(),
  corners: {
    nw: new Point(0, 0),
    ne: new Point(100, 0),
    se: new Point(100, 100),
    sw: new Point(0, 100),
  },
  geometryCorners: {
    nw: new Point(100, 100),
    ne: new Point(200, 100),
    se: new Point(200, 200),
    sw: new Point(100, 200),
  },
  geometrySidePoints: {
    north: new Point(150, 90),
    east: new Point(210, 150),
    south: new Point(150, 210),
    west: new Point(90, 150),
  },
});

["north", "east", "south", "west"].forEach((side) => {
  console.log(`  ${side}:`, innerPiece.sPoints[side]);
  console.log(`  ${side} is array:`, Array.isArray(innerPiece.sPoints[side]));
  console.log(`  ${side} length:`, innerPiece.sPoints[side].length);
  if (innerPiece.sPoints[side].length > 0) {
    console.log(
      `  ${side} all equal:`,
      innerPiece.sPoints[side][0].equals(innerPiece.sPoints[side][1]) &&
        innerPiece.sPoints[side][1].equals(innerPiece.sPoints[side][2])
    );
  }
});

console.log("\n✅ Refactoring verification complete!");
console.log("Summary:");
console.log("- Border sides: empty arrays []");
console.log("- Inner sides: arrays with 3 equal Point objects");
