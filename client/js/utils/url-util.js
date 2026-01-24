// url-util.js - URL parameter parsing and deep link handling
// Parses URL parameters and saves to application state

import { Util } from "./numeric-util.js";
import { state } from "../game-engine.js";

/**
 * Parse URL parameters for deep link mode and save to application state
 * Sets state deep link fields if valid deep link parameters are found
 */
export function parseDeepLinkParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const imageParam = params.get("image");
    const piecesParam = params.get("pieces");
    const noRotateParam = params.get("norotate");
    const removeColorParam = params.get("removeColor");
    const licenseParam = params.get("license");
    const resumeParam = params.get("resume");

    // Deep link requires both image and pieces parameters
    if (!imageParam || !piecesParam) {
      state.deepLinkImageUrl = null;
      state.deepLinkPieceCount = null;
      return;
    }

    const pieceCount = parseInt(piecesParam, 10);

    // Validate piece count
    if (!Util.isPositiveNumber(pieceCount)) {
      console.warn("[url-util] Invalid pieces param:", piecesParam);
      state.deepLinkImageUrl = null;
      state.deepLinkPieceCount = null;
      return;
    }

    const noRotate = noRotateParam === "y" ? "y" : "n";
    const removeColor = removeColorParam === "y" ? "y" : "n";
    const resume = resumeParam || "n";

    // Save to application state (flat structure)
    state.deepLinkImageUrl = imageParam;
    state.deepLinkPieceCount = pieceCount;
    state.deepLinkNoRotate = noRotate;
    state.deepLinkRemoveColor = removeColor;
    state.deepLinkLicense = licenseParam || null;
    state.deepLinkResume = resume;
    state.noRotate = noRotate === "y";
  } catch (err) {
    console.warn("[url-util] Error parsing deep link params:", err);
    state.deepLinkImageUrl = null;
    state.deepLinkPieceCount = null;
  }
}

/**
 * Check if the current URL contains deep link parameters
 * @returns {boolean} True if deep link parameters are present in state
 */
export function hasDeepLinkParams() {
  return state.deepLinkImageUrl !== null && state.deepLinkPieceCount !== null;
}
