// help.js - Help modal component
// Manages the help/instructions modal display and interactions

// DOM elements
const helpButton = document.getElementById("helpButton");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");

// Show help modal
export function showHelp() {
  if (helpModal) {
    helpModal.style.display = "flex";
  }
}

// Hide help modal
export function hideHelp() {
  if (helpModal) {
    helpModal.style.display = "none";
  }
}

// Check if help modal is currently open
export function isHelpOpen() {
  return helpModal && helpModal.style.display === "flex";
}

// Handle clicking outside help modal to close it
function handleHelpModalClick(e) {
  if (e.target === helpModal) {
    hideHelp();
  }
}

// Handle Escape key to close help modal
function handleEscapeKey(e) {
  if (e.key === "Escape" && isHelpOpen()) {
    hideHelp();
  }
}

// Initialize help modal functionality
export function initHelp() {
  // Help button click handler
  if (helpButton) {
    helpButton.addEventListener("click", showHelp);
  }

  // Close button click handler
  if (closeHelp) {
    closeHelp.addEventListener("click", hideHelp);
  }

  // Click outside modal to close
  if (helpModal) {
    helpModal.addEventListener("click", handleHelpModalClick);
  }

  // Escape key to close
  document.addEventListener("keydown", handleEscapeKey);
}
