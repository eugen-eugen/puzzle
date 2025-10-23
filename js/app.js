// app.js - bootstrap for piece box window
import { initCommChannel } from "./windowManager.js";
import { processImage } from "./imageProcessor.js";
import { generateJigsawPieces } from "./jigsawGenerator.js";
import { scatterInitialPieces, getPieceElement } from "./pieceRenderer.js";
import { state } from "./gameEngine.js";

const imageInput = document.getElementById("imageInput");
const pieceSlider = document.getElementById("pieceSlider");
const pieceDisplay = document.getElementById("pieceDisplay");
const progressDisplay = document.getElementById("progressDisplay");
const piecesContainer = document.getElementById("piecesContainer");
const piecesViewport = document.getElementById("piecesViewport");
const checkButton = document.getElementById("checkButton");
const helpButton = document.getElementById("helpButton");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const zoomInButton = document.getElementById("zoomInButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomResetButton = document.getElementById("zoomResetButton");
const zoomDisplay = document.getElementById("zoomDisplay");

let currentImage = null;
let isGenerating = false;

// Zoom and pan state
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;

// Convert slider position (0-100) to piece count using logarithmic scale
function sliderToPieceCount(sliderValue) {
  if (sliderValue === 0) return 0;
  // Logarithmic scale: 1 to 1000 pieces
  // Using formula: pieces = Math.round(Math.pow(10, 0 + (3 * sliderValue / 100)))
  const logValue = (sliderValue / 100) * 3; // Maps 0-100 to 0-3
  const pieces = Math.round(Math.pow(10, logValue));
  return Math.max(1, Math.min(1000, pieces));
}

// Update the piece count display
function updatePieceDisplay() {
  const pieceCount = sliderToPieceCount(parseInt(pieceSlider.value));
  pieceDisplay.textContent = pieceCount;
}

// Zoom and Pan functions
function updateViewportTransform() {
  piecesViewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function updateZoomDisplay() {
  zoomDisplay.textContent = Math.round(zoomLevel * 100) + "%";
}

function setZoom(newZoomLevel, centerX = null, centerY = null) {
  const oldZoom = zoomLevel;
  zoomLevel = Math.max(0.1, Math.min(5.0, newZoomLevel));

  // If zoom center is provided, adjust pan to zoom to that point
  if (centerX !== null && centerY !== null) {
    const containerRect = piecesContainer.getBoundingClientRect();
    const viewportCenterX = centerX - containerRect.left;
    const viewportCenterY = centerY - containerRect.top;

    // Adjust pan to keep the zoom center point in the same position
    panX = viewportCenterX - (viewportCenterX - panX) * (zoomLevel / oldZoom);
    panY = viewportCenterY - (viewportCenterY - panY) * (zoomLevel / oldZoom);
  }

  updateViewportTransform();
  updateZoomDisplay();
}

function resetZoomAndPan() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  updateViewportTransform();
  updateZoomDisplay();
}

function getCurrentZoom() {
  return zoomLevel;
}

// Coordinate transformation functions
function screenToViewport(screenX, screenY) {
  const containerRect = piecesContainer.getBoundingClientRect();
  const relativeX = screenX - containerRect.left;
  const relativeY = screenY - containerRect.top;

  // Apply inverse zoom and pan transformation
  const viewportX = (relativeX - panX) / zoomLevel;
  const viewportY = (relativeY - panY) / zoomLevel;

  return { x: viewportX, y: viewportY };
}

function viewportToScreen(viewportX, viewportY) {
  const containerRect = piecesContainer.getBoundingClientRect();

  // Apply zoom and pan transformation
  const relativeX = viewportX * zoomLevel + panX;
  const relativeY = viewportY * zoomLevel + panY;

  const screenX = relativeX + containerRect.left;
  const screenY = relativeY + containerRect.top;

  return { x: screenX, y: screenY };
}

function updateProgress() {
  if (state.totalPieces === 0) {
    progressDisplay.textContent = "0 / 0 (0%)";
    return;
  }

  // Calculate score using the corrected formula:
  // Score = <amount of pieces> - <amount of ungrouped pieces> - (g-1)*Heaviside(g-1)
  // This ensures 0% at start (all ungrouped) and 100% when all pieces form one group

  const totalPieces = state.totalPieces;

  // Count ungrouped pieces (pieces without groupId or groupId === null)
  const ungroupedPieces = state.pieces.filter((piece) => !piece.groupId).length;

  // Count unique groups (pieces with groupId)
  const groupIds = new Set(
    state.pieces.filter((piece) => piece.groupId).map((piece) => piece.groupId)
  );
  const numberOfGroups = groupIds.size; // g in the formula

  // Heaviside step function: H(g-1) = 0 if g≤1, else 1
  const heavisideValue = numberOfGroups <= 1 ? 0 : 1;

  // Apply the corrected scoring formula
  const score =
    totalPieces - ungroupedPieces - (numberOfGroups - 1) * heavisideValue;
  const percentage = ((score / totalPieces) * 100).toFixed(1);

  progressDisplay.textContent = `${score} / ${totalPieces} (${percentage}%)`;

  // Show Check button when 100% is reached
  if (percentage === "100.0") {
    checkButton.style.display = "block";
  } else {
    checkButton.style.display = "none";
  }
}

// Generate puzzle with current slider value
async function generatePuzzle() {
  if (!currentImage || isGenerating) return;

  const pieceCount = sliderToPieceCount(parseInt(pieceSlider.value));

  if (pieceCount === 0) {
    // Show original image when slider is at 0
    piecesViewport.innerHTML = `
      <div class="original-image-container">
        <img src="${currentImage.src}" alt="Original image" style="max-width:100%;max-height:100%;object-fit:contain;" />
      </div>
    `;
    state.pieces = [];
    state.totalPieces = 0;
    updateProgress();
    return;
  }

  isGenerating = true;
  piecesViewport.innerHTML = "";
  progressDisplay.textContent = "Generating...";

  try {
    const { pieces, rows, cols } = generateJigsawPieces(
      currentImage,
      pieceCount
    );
    state.pieces = pieces;
    state.totalPieces = pieces.length;
    scatterInitialPieces(piecesViewport, pieces);
    clearAllPieceOutlines(); // Clear any previous validation feedback
    updateProgress();
  } catch (e) {
    console.error(e);
    alert("Failed to generate puzzle: " + e.message);
    progressDisplay.textContent = "Error";
  } finally {
    isGenerating = false;
  }
}

// Handle image upload
imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    progressDisplay.textContent = "Loading image...";
    currentImage = await processImage(file);

    // Reset slider to 0 and show original image
    pieceSlider.value = 0;
    updatePieceDisplay();

    // Show original image
    piecesViewport.innerHTML = `
      <div class="original-image-container">
        <img src="${currentImage.src}" alt="Original image" style="max-width:100%;max-height:100%;object-fit:contain;" />
      </div>
    `;

    state.pieces = [];
    state.totalPieces = 0;
    updateProgress();
  } catch (e) {
    console.error(e);
    alert("Failed to load image: " + e.message);
    progressDisplay.textContent = "Error";
  }
});

// Function to draw piece outline with specified color
function drawPieceOutline(piece, color, lineWidth = 3) {
  console.log(
    `[drawPieceOutline] Drawing piece ${piece.id} with color ${color}`
  );

  const element = getPieceElement(piece.id);
  if (!element) {
    console.warn(`[drawPieceOutline] No element found for piece ${piece.id}`);
    return;
  }

  const canvas = element.querySelector("canvas");
  if (!canvas) {
    console.warn(`[drawPieceOutline] No canvas found for piece ${piece.id}`);
    return;
  }

  if (!piece.path) {
    console.warn(`[drawPieceOutline] No path found for piece ${piece.id}`);
    return;
  }

  const ctx = canvas.getContext("2d");
  const scale = piece.scale || 0.35;
  const pad = piece.pad || 0;

  console.log(
    `[drawPieceOutline] Drawing with scale=${scale}, pad=${pad}, lineWidth=${lineWidth}`
  );

  // Save current context state
  ctx.save();

  // Clear any previous outline by redrawing the piece
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Redraw the piece bitmap
  ctx.scale(scale, scale);
  ctx.drawImage(piece.bitmap, 0, 0);

  // Draw the outline
  ctx.translate(pad, pad);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / scale; // Adjust line width for scale
  ctx.stroke(piece.path);

  console.log(
    `[drawPieceOutline] Successfully drew outline for piece ${piece.id}`
  );

  // Restore context state
  ctx.restore();
}

// Function to clear piece outline (redraw without stroke)
function clearPieceOutline(piece) {
  console.log(`[clearPieceOutline] Clearing outline for piece ${piece.id}`);

  const element = getPieceElement(piece.id);
  if (!element) {
    console.warn(`[clearPieceOutline] No element found for piece ${piece.id}`);
    return;
  }

  const canvas = element.querySelector("canvas");
  if (!canvas) {
    console.warn(`[clearPieceOutline] No canvas found for piece ${piece.id}`);
    return;
  }

  const ctx = canvas.getContext("2d");
  const scale = piece.scale || 0.35;

  // Save current context state
  ctx.save();

  // Clear and redraw the piece without outline
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(piece.bitmap, 0, 0);

  console.log(
    `[clearPieceOutline] Successfully cleared outline for piece ${piece.id}`
  );

  // Restore context state
  ctx.restore();
}

// Function to clear all piece outlines
function clearAllPieceOutlines() {
  if (!state.pieces) return;

  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });
}

// Check if pieces are in correct positions
function checkPuzzleCorrectness() {
  console.log(
    "[checkPuzzleCorrectness] Starting check with",
    state.pieces?.length,
    "pieces"
  );

  if (!state.pieces || state.pieces.length === 0) {
    console.log("[checkPuzzleCorrectness] No pieces to check");
    return;
  }

  // Clear previous validation outlines
  state.pieces.forEach((piece) => {
    clearPieceOutline(piece);
  });

  let correctCount = 0;
  let incorrectCount = 0;

  // Since pieces can be rotated and moved freely, we need to check if they form
  // a valid puzzle configuration based on their connections and relative positions

  // For a piece to be "correct", it must meet these criteria:
  // 1. Be in correct rotation (0 degrees)
  // 2. Be connected to all expected neighbors
  // 3. Have reasonable relative positioning to neighbors
  state.pieces.forEach((piece) => {
    let isCorrect = true;
    let reasons = [];

    // Check rotation first - pieces should be in original orientation (0 degrees) for "correct"
    if (piece.rotation !== 0) {
      isCorrect = false;
      reasons.push(`Wrong rotation: ${piece.rotation}° (should be 0°)`);
    }

    // Get pieces that should be neighbors based on grid coordinates
    const expectedNeighbors = {
      north: state.pieces.find(
        (p) => p.gridX === piece.gridX && p.gridY === piece.gridY - 1
      ),
      east: state.pieces.find(
        (p) => p.gridX === piece.gridX + 1 && p.gridY === piece.gridY
      ),
      south: state.pieces.find(
        (p) => p.gridX === piece.gridX && p.gridY === piece.gridY + 1
      ),
      west: state.pieces.find(
        (p) => p.gridX === piece.gridX - 1 && p.gridY === piece.gridY
      ),
    };

    // For a more strict check, we'll examine positioning relative to neighbors
    // If all pieces are just connected in one blob but wrong positions, we should catch this
    let hasCorrectNeighborPositioning = true;

    Object.entries(expectedNeighbors).forEach(
      ([direction, expectedNeighbor]) => {
        if (expectedNeighbor) {
          // Check if they're in the same group (connected)
          if (!piece.groupId || piece.groupId !== expectedNeighbor.groupId) {
            isCorrect = false;
            reasons.push(
              `Not connected to expected neighbor at (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY})`
            );
          } else {
            // Additionally check relative positioning
            const pieceX = piece.displayX || 0;
            const pieceY = piece.displayY || 0;
            const neighborX = expectedNeighbor.displayX || 0;
            const neighborY = expectedNeighbor.displayY || 0;

            const deltaX = neighborX - pieceX;
            const deltaY = neighborY - pieceY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Expected piece dimensions (rough estimate)
            const expectedPieceSize = 100 * (piece.scale || 0.35); // Adjust based on actual piece size

            // Check if the relative positioning makes sense for the direction
            let positionIsCorrect = false;
            const tolerance = expectedPieceSize * 0.5; // Allow some tolerance

            switch (direction) {
              case "north":
                // North neighbor should be above (negative Y) and roughly same X
                positionIsCorrect =
                  deltaY < -tolerance && Math.abs(deltaX) < tolerance;
                break;
              case "south":
                // South neighbor should be below (positive Y) and roughly same X
                positionIsCorrect =
                  deltaY > tolerance && Math.abs(deltaX) < tolerance;
                break;
              case "east":
                // East neighbor should be to the right (positive X) and roughly same Y
                positionIsCorrect =
                  deltaX > tolerance && Math.abs(deltaY) < tolerance;
                break;
              case "west":
                // West neighbor should be to the left (negative X) and roughly same Y
                positionIsCorrect =
                  deltaX < -tolerance && Math.abs(deltaY) < tolerance;
                break;
            }

            if (!positionIsCorrect) {
              hasCorrectNeighborPositioning = false;
              reasons.push(
                `Neighbor ${direction} (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY}) is not positioned correctly relative to this piece`
              );
            }
          }
        }
      }
    );

    // If neighbor positioning is wrong, mark as incorrect
    if (!hasCorrectNeighborPositioning) {
      isCorrect = false;
    }

    console.log(
      `[checkPuzzleCorrectness] Piece ${piece.id} at (${piece.gridX}, ${piece.gridY}):`,
      isCorrect ? "CORRECT" : "INCORRECT",
      isCorrect ? "" : `- Reasons: ${reasons.join(", ")}`
    );

    // Apply visual feedback using shape outlines
    if (isCorrect) {
      drawPieceOutline(piece, "#2ea862", 4); // Green outline for correct pieces
      correctCount++;
    } else {
      drawPieceOutline(piece, "#c94848", 4); // Red outline for incorrect pieces
      incorrectCount++;
    }
  });

  console.log(
    `[checkPuzzleCorrectness] Results: ${correctCount} correct, ${incorrectCount} incorrect`
  );

  // Add blinking effect for incorrect pieces
  setTimeout(() => {
    console.log(
      "[checkPuzzleCorrectness] Starting blink effect for incorrect pieces"
    );
    let blinkingPieces = 0;

    state.pieces.forEach((piece) => {
      let isCorrect = true;

      // Repeat the same correctness check as above
      if (piece.rotation !== 0) {
        isCorrect = false;
      }

      const expectedNeighbors = {
        north: state.pieces.find(
          (p) => p.gridX === piece.gridX && p.gridY === piece.gridY - 1
        ),
        east: state.pieces.find(
          (p) => p.gridX === piece.gridX + 1 && p.gridY === piece.gridY
        ),
        south: state.pieces.find(
          (p) => p.gridX === piece.gridX && p.gridY === piece.gridY + 1
        ),
        west: state.pieces.find(
          (p) => p.gridX === piece.gridX - 1 && p.gridY === piece.gridY
        ),
      };

      let hasCorrectNeighborPositioning = true;

      Object.entries(expectedNeighbors).forEach(
        ([direction, expectedNeighbor]) => {
          if (expectedNeighbor) {
            if (!piece.groupId || piece.groupId !== expectedNeighbor.groupId) {
              isCorrect = false;
            } else {
              // Check relative positioning
              const pieceX = piece.displayX || 0;
              const pieceY = piece.displayY || 0;
              const neighborX = expectedNeighbor.displayX || 0;
              const neighborY = expectedNeighbor.displayY || 0;

              const deltaX = neighborX - pieceX;
              const deltaY = neighborY - pieceY;
              const expectedPieceSize = 100 * (piece.scale || 0.35);
              const tolerance = expectedPieceSize * 0.5;

              let positionIsCorrect = false;
              switch (direction) {
                case "north":
                  positionIsCorrect =
                    deltaY < -tolerance && Math.abs(deltaX) < tolerance;
                  break;
                case "south":
                  positionIsCorrect =
                    deltaY > tolerance && Math.abs(deltaX) < tolerance;
                  break;
                case "east":
                  positionIsCorrect =
                    deltaX > tolerance && Math.abs(deltaY) < tolerance;
                  break;
                case "west":
                  positionIsCorrect =
                    deltaX < -tolerance && Math.abs(deltaY) < tolerance;
                  break;
              }

              if (!positionIsCorrect) {
                hasCorrectNeighborPositioning = false;
              }
            }
          }
        }
      );

      if (!hasCorrectNeighborPositioning) {
        isCorrect = false;
      }

      // Create blinking effect for incorrect pieces
      if (!isCorrect) {
        blinkingPieces++;
        console.log(
          `[checkPuzzleCorrectness] Starting blink for piece ${piece.id}`
        );

        // Cycle between clear and red outline for blinking effect
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
          console.log(
            `[checkPuzzleCorrectness] Blink ${blinkCount} for piece ${piece.id}`
          );

          if (blinkCount % 2 === 0) {
            clearPieceOutline(piece);
          } else {
            drawPieceOutline(piece, "#c94848", 4);
          }
          blinkCount++;

          if (blinkCount >= 8) {
            // Blink 4 times (8 half-cycles)
            console.log(
              `[checkPuzzleCorrectness] Finished blinking for piece ${piece.id}`
            );
            clearInterval(blinkInterval);
            drawPieceOutline(piece, "#c94848", 4); // End with red outline
          }
        }, 300); // 300ms intervals for blinking
      }
    });

    console.log(
      `[checkPuzzleCorrectness] Started blinking for ${blinkingPieces} pieces`
    );
  }, 100); // Small delay before starting blink effect
}

// Handle Check button click
checkButton.addEventListener("click", () => {
  checkPuzzleCorrectness();
});

// Handle Help button click
helpButton.addEventListener("click", () => {
  helpModal.style.display = "flex";
});

// Handle closing help modal
closeHelp.addEventListener("click", () => {
  helpModal.style.display = "none";
});

// Close modal when clicking outside of it
helpModal.addEventListener("click", (e) => {
  if (e.target === helpModal) {
    helpModal.style.display = "none";
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && helpModal.style.display === "flex") {
    helpModal.style.display = "none";
  }
});

// Handle slider changes - generate puzzle in real-time
pieceSlider.addEventListener("input", () => {
  updatePieceDisplay();
  generatePuzzle();
});

// Zoom button event listeners
zoomInButton.addEventListener("click", () => {
  setZoom(zoomLevel * 1.2);
});

zoomOutButton.addEventListener("click", () => {
  setZoom(zoomLevel / 1.2);
});

zoomResetButton.addEventListener("click", () => {
  resetZoomAndPan();
});

// Mouse wheel zoom
piecesContainer.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  setZoom(zoomLevel * zoomFactor, e.clientX, e.clientY);
});

// Pan functionality
piecesContainer.addEventListener("mousedown", (e) => {
  // Only pan with middle mouse button or Ctrl+left mouse button, and only if not clicking on a piece
  if (
    (e.button === 1 || (e.button === 0 && e.ctrlKey)) &&
    e.target === piecesContainer
  ) {
    e.preventDefault();
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    piecesContainer.style.cursor = "grabbing";
  }
});

document.addEventListener("mousemove", (e) => {
  if (isPanning) {
    e.preventDefault();
    const deltaX = e.clientX - lastPanX;
    const deltaY = e.clientY - lastPanY;
    panX += deltaX;
    panY += deltaY;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    updateViewportTransform();
  }
});

document.addEventListener("mouseup", (e) => {
  if (isPanning) {
    isPanning = false;
    piecesContainer.style.cursor = "grab";
  }
});

// Keyboard shortcuts for zoom and pan
document.addEventListener("keydown", (e) => {
  // Only if not in modal and not typing in input
  if (helpModal.style.display === "flex" || e.target.tagName === "INPUT")
    return;

  switch (e.key) {
    case "+":
    case "=":
      e.preventDefault();
      setZoom(zoomLevel * 1.2);
      break;
    case "-":
      e.preventDefault();
      setZoom(zoomLevel / 1.2);
      break;
    case "0":
      e.preventDefault();
      resetZoomAndPan();
      break;
  }
});

// Initialize display
updatePieceDisplay();
updateZoomDisplay();

initCommChannel(updateProgress);

// Export functions for use by other modules
export {
  updateProgress,
  clearAllPieceOutlines,
  screenToViewport,
  viewportToScreen,
  getCurrentZoom,
};
