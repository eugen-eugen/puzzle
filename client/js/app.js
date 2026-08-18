// app.js - bootstrap for piece box window
import "../css/main.css";
import "../css/piece-box.css";
import "../css/animations.css";
import "../css/components/picture-gallery.css";

// Register service worker
import "../public/service-worker.js";

import {
  initPersistence,
  clearSavedGame,
  loadGame,
  hasSavedGame,
  setCurrentImageForPersistence,
} from "./persistence/persistence.js";
import { showResumeModal } from "./components/resume.js";
import { state } from "./game-engine.js";
import { initI18n, t, applyTranslations } from "./i18n.js";
import { loadRemoteImageWithTimeout } from "./utils/image-util.js";
import { gameTableController } from "./logic/game-table-controller.js";
import {
  initViewport,
  applyPieceCorrectnessVisualFeedback,
  applyViewportGrayscaleFilter,
  getViewport,
} from "./ui/display.js";
import {
  initControlBar,
  generatePuzzle,
  setSliderValue,
  setCurrentImage,
  setCurrentImageSource,
  setCurrentImageLicense,
  pieceCountToSlider,
  updatePieceDisplay,
} from "./components/control-bar.js";
import {
  showPictureGallery,
  hidePictureGallery,
} from "./components/picture-gallery.js";
import {
  DEEPLINK_ENABLED,
  DEEPLINK_DISABLED,
  PERSISTENCE_RESTORE,
  PERSISTENCE_CAN_RESUME,
  PERSISTENCE_CANNOT_RESUME,
} from "./constants/custom-events.js";
import { NORTH, EAST, SOUTH, WEST } from "./constants/piece-constants.js";
import { registerGlobalEvent } from "./utils/event-util.js";
import { PUZZLE_STATE_CHANGED } from "./constants/custom-events.js";
import { parseDeepLinkParams } from "./utils/url-util.js";
import { initHelp } from "./components/help.js";
import {
  initOnlineMode,
  onPuzzleReady,
  buildJoinUrl,
} from "./comm/online-game.js";
import { isOnlineMode } from "./comm/network-manager.js";
import { Point } from "./geometry/point.js";
import { Piece } from "./model/piece.js";
import { renderPiecesAtPositions } from "./logic/piece-renderer.js";

// DOM elements for puzzle-specific functionality
const piecesContainer = document.getElementById("piecesContainer");

let deepLinkActive = false; // true when URL provides image & pieces params

/**
 * Apply piece positions received from the server to local state.
 * Called when joining an existing game that already has piece positions.
 */
function applyServerPieceState(serverPieces) {
  for (const piece of state.pieces) {
    const remote = serverPieces[piece.id];
    if (!remote) continue;
    gameTableController.setPiecePosition(
      piece.id,
      new Point(remote.x, remote.y),
    );
    if (remote.rotation !== undefined) piece.setRotation(remote.rotation);
    if (remote.groupId !== undefined) piece._setGroupId(remote.groupId);
    if (remote.zIndex !== undefined) piece.zIndex = remote.zIndex;
  }
}

/**
 * Reconstruct pieces from full serialized server state (same as persistence resume).
 * This ensures geometry (corners, sPoints) is identical to the host's pieces.
 */
function reconstructPiecesFromServer(
  masterImage,
  serializedPieces,
  piecePositions,
) {
  // Create master canvas from image
  const master = document.createElement("canvas");
  master.width = masterImage.width;
  master.height = masterImage.height;
  const mctx = master.getContext("2d");
  mctx.drawImage(masterImage, 0, 0);

  // Reset state pieces
  state.pieces = [];

  // Deserialize each piece
  for (const sp of serializedPieces) {
    const deserializedData = Piece.deserialize(sp);
    const piece = new Piece({ ...deserializedData, master });
    state.pieces.push(piece);

    // Use latest position from piecePositions if available (may be more up-to-date than full_state)
    const latestPos = piecePositions?.[piece.id];
    if (latestPos) {
      gameTableController.setPiecePosition(
        piece.id,
        new Point(latestPos.x, latestPos.y),
      );
      if (latestPos.rotation !== undefined)
        piece.setRotation(latestPos.rotation);
      if (latestPos.groupId !== undefined) piece._setGroupId(latestPos.groupId);
      if (latestPos.zIndex !== undefined) piece.zIndex = latestPos.zIndex;
    } else {
      gameTableController.setPiecePosition(piece.id, deserializedData.position);
    }
  }

  state.totalPieces = state.pieces.length;

  // Render pieces at their positions
  const viewport = getViewport();
  if (viewport) {
    viewport.innerHTML = "";
    renderPiecesAtPositions(viewport, state.pieces);
  }
}

/**
 * Show online mode indicator as a globe button; clicking opens a dialog with online info.
 */
function showOnlineGameInfo(roomId) {
  const joinUrl = buildJoinUrl(roomId);

  // Globe button
  const btn = document.createElement("button");
  btn.id = "online-game-btn";
  btn.textContent = "🌐";
  btn.title = t("online.openInfo");
  btn.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:9999;font-size:24px;background:none;border:none;cursor:pointer;line-height:1;padding:4px;";
  document.body.appendChild(btn);

  // Player count badge
  const badge = document.createElement("span");
  badge.id = "online-player-badge";
  badge.textContent = "1";
  badge.style.cssText =
    "position:absolute;top:0;right:0;background:#2ea862;color:#fff;font-size:10px;border-radius:50%;width:14px;height:14px;display:flex;align-items:center;justify-content:center;";
  btn.style.position = "fixed";
  btn.appendChild(badge);

  btn.addEventListener("click", () => openOnlineDialog(roomId, joinUrl));

  document.addEventListener("online:player_count", (event) => {
    const el = document.getElementById("online-player-badge");
    if (el) el.textContent = String(event.detail.count);
  });
}

function openOnlineDialog(roomId, joinUrl) {
  // Remove existing
  const existing = document.getElementById("online-info-dialog");
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "online-info-dialog";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;";

  const dialog = document.createElement("div");
  dialog.style.cssText =
    "background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);";

  const badge = document.getElementById("online-player-badge");
  const playerCount = badge ? badge.textContent : "1";

  dialog.innerHTML = `
    <h3 style="margin:0 0 16px;font-size:18px;">🌐 ${t("online.title")}</h3>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:#666;">${t("online.roomId")}</label>
      <div style="font-family:monospace;font-size:14px;">${roomId}</div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;color:#666;">${t("online.players")}</label>
      <div id="online-dialog-players" style="font-size:14px;">${playerCount}</div>
    </div>
    <div style="margin-bottom:16px;">
      <label style="font-size:12px;color:#666;">${t("online.shareLink")}</label>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <input type="text" value="${joinUrl}" readonly
          style="flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:12px;"
          onclick="this.select()"/>
        <button id="online-copy-btn"
          style="padding:6px 12px;border:none;border-radius:4px;background:#2ea862;color:#fff;cursor:pointer;font-size:12px;">
          ${t("online.copy")}
        </button>
      </div>
    </div>
    <button id="online-close-btn"
      style="width:100%;padding:8px;border:none;border-radius:4px;background:#eee;cursor:pointer;font-size:14px;">
      ${t("online.close")}
    </button>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  dialog.querySelector("#online-copy-btn").addEventListener("click", (e) => {
    navigator.clipboard.writeText(joinUrl);
    e.target.textContent = t("online.copied");
    setTimeout(() => {
      e.target.textContent = t("online.copy");
    }, 2000);
  });

  dialog
    .querySelector("#online-close-btn")
    .addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Check if pieces are in correct positions
export function checkPuzzleCorrectness() {
  let correctCount = 0;
  let incorrectCount = 0;

  // Since pieces can be rotated and moved freely, we need to check if they form
  // a valid puzzle configuration based on their connections and relative positions

  // First, check if all pieces have the same rotation (uniform rotation is acceptable)
  const rotations = state.pieces.map((p) => p.rotation);
  const allSameRotation = rotations.every((r) => r === rotations[0]);

  // For a piece to be "correct", it must meet these criteria:
  // 1. Have the same rotation as all other pieces (uniform rotation is OK)
  // 2. Be connected to all expected neighbors
  // 3. Have correct relative positioning to neighbors
  state.pieces.forEach((piece) => {
    let isCorrect = true;
    let reasons = [];

    // Check rotation - all pieces should have uniform rotation
    if (!allSameRotation) {
      // If rotations are not uniform, check if this specific piece matches the most common rotation
      const rotationCounts = {};
      rotations.forEach((r) => {
        rotationCounts[r] = (rotationCounts[r] || 0) + 1;
      });
      const mostCommonRotation = Object.entries(rotationCounts).sort(
        (a, b) => b[1] - a[1],
      )[0][0];

      if (piece.rotation !== Number(mostCommonRotation)) {
        isCorrect = false;
        reasons.push(
          `Inconsistent rotation: ${piece.rotation}° (most pieces at ${mostCommonRotation}°)`,
        );
      }
    }

    // Get pieces that should be neighbors based on grid coordinates
    const expectedNeighbors = {
      [NORTH]: state.pieces.find(
        (p) => p.gridX === piece.gridX && p.gridY === piece.gridY - 1,
      ),
      [EAST]: state.pieces.find(
        (p) => p.gridX === piece.gridX + 1 && p.gridY === piece.gridY,
      ),
      [SOUTH]: state.pieces.find(
        (p) => p.gridX === piece.gridX && p.gridY === piece.gridY + 1,
      ),
      [WEST]: state.pieces.find(
        (p) => p.gridX === piece.gridX - 1 && p.gridY === piece.gridY,
      ),
    };

    // For a more strict check, we'll examine precise corner alignment between neighbors
    // This ensures pieces are not just connected but positioned with correct corner matching
    Object.entries(expectedNeighbors).forEach(
      ([direction, expectedNeighbor]) => {
        if (expectedNeighbor) {
          // Check if they're in the same group (connected)
          if (piece.groupId !== expectedNeighbor.groupId) {
            isCorrect = false;
            reasons.push(
              `Not connected to expected neighbor at (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY})`,
            );
          } else {
            // Check if neighbor is correctly positioned by comparing corner alignment
            const positionIsCorrect = gameTableController.arePiecesNeighbors(
              piece,
              expectedNeighbor,
            );

            if (!positionIsCorrect) {
              isCorrect = false;
              reasons.push(
                `Neighbor ${direction} (${expectedNeighbor.gridX}, ${expectedNeighbor.gridY}) corners are not properly aligned with this piece`,
              );
            }
          }
        }
      },
    );

    // Apply visual feedback using shape outlines
    applyPieceCorrectnessVisualFeedback(piece, isCorrect);
    if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  });
}

// Viewport panning is now handled by ui-interaction-manager.js using interact.js
// Help modal is now handled by components/help.js
// Auto-save is handled by persistence module listening to DRAG_END and PIECES_CONNECTED events

// Keyboard shortcuts (zoom shortcuts are now in controlBar.js)

// Bootstrap with i18n before initializing UI & persistence
async function bootstrap() {
  await initI18n();
  applyTranslations();

  // Initialize display viewport
  initViewport();

  // Apply grayscale filter from localStorage if set
  applyViewportGrayscaleFilter();

  // Initialize control bar
  initControlBar();

  // Initialize help modal
  initHelp();

  // Deep link mode: ?image=<url>&pieces=<n>&norotate=y&removeColor=y
  // Parse and save to state
  parseDeepLinkParams();

  // Online multiplayer mode: ?online=new or ?online=<roomId>
  if (state.onlineMode === "join") {
    // Joining an existing game - connect to server, receive config, load puzzle
    hidePictureGallery();
    deepLinkActive = true;
    await initOnlineMode({
      onJoinReceiveConfig: async (initState) => {
        const config = initState.config;
        if (!config || !config.imageUrl) {
          console.error("[online] No image URL in server config");
          deepLinkActive = false;
          return;
        }

        // Set state from server config
        state.noRotate = config.noRotate || false;

        loadRemoteImageWithTimeout(config.imageUrl, {
          timeout: 10000,
          onLoad: async (img) => {
            setCurrentImage(img);
            setCurrentImageSource(config.imageUrl);
            setCurrentImageLicense(config.license);
            if (config.removeColor) {
              applyViewportGrayscaleFilter("y");
            }

            // Reconstruct pieces from server's full serialized state (includes geometry)
            if (
              initState.pieces &&
              Array.isArray(initState.pieces) &&
              initState.pieces.length > 0
            ) {
              reconstructPiecesFromServer(
                img,
                initState.pieces,
                initState.piecePositions,
              );
            } else {
              // Fallback: generate locally if server has no piece data yet
              const sliderVal = pieceCountToSlider(config.pieceCount);
              setSliderValue(sliderVal);
              updatePieceDisplay();
              await generatePuzzle();
              onPuzzleReady();
            }

            showOnlineGameInfo(initState.roomId);
            deepLinkActive = false;
          },
          onError: () => {
            deepLinkActive = false;
            console.error("[online] Failed to load image from server config");
          },
          onTimeout: () => {
            deepLinkActive = false;
            console.error("[online] Timeout loading image from server config");
          },
        }).catch(() => {});
      },
      onError: (msg) => {
        deepLinkActive = false;
        alert(`Failed to join online game: ${msg}`);
      },
    });
    return; // Skip normal flow
  }

  if (state.onlineMode === "host") {
    // Host mode - just connect to server, puzzle generation happens via deep link flow
    await initOnlineMode({
      onRoomCreated: (roomId) => {
        showOnlineGameInfo(roomId);
      },
      onError: (msg) => {
        console.error("[online] Failed to create room:", msg);
      },
    });
  }

  // Initialize persistence (event-driven architecture)
  initPersistence();

  if (state.deepLinkImageUrl) {
    // Check if resume=y and saved game exists for this image
    if (state.deepLinkResume === "y" && hasSavedGame(state.deepLinkImageUrl)) {
      console.info("[deeplink] Resume=y: Asking user to resume saved game");
      hidePictureGallery();
      showResumeModal({
        onResume: () => {
          // Load the saved game for this image
          setCurrentImageForPersistence(state.deepLinkImageUrl);
          loadGame(state.deepLinkImageUrl);
        },
        onDiscard: () => {
          // Clear saved game and start new game with deeplink parameters
          clearSavedGame(state.deepLinkImageUrl);
          deepLinkActive = true;
          window.dispatchEvent(new CustomEvent(DEEPLINK_ENABLED));

          loadRemoteImageWithTimeout(state.deepLinkImageUrl, {
            timeout: 10000,
            onLoad: async (img) => {
              setCurrentImage(img);
              setCurrentImageSource(state.deepLinkImageUrl);
              setCurrentImageLicense(state.deepLinkLicense);
              const sliderVal = pieceCountToSlider(state.deepLinkPieceCount);
              setSliderValue(sliderVal);
              updatePieceDisplay();
              applyViewportGrayscaleFilter(state.deepLinkRemoveColor);
              await generatePuzzle();
              onPuzzleReady();
              deepLinkActive = false;
            },
            onTimeout: () => {
              deepLinkActive = false;
              window.dispatchEvent(
                new CustomEvent(DEEPLINK_DISABLED, {
                  detail: { reason: "timeout" },
                }),
              );
            },
            onError: () => {
              deepLinkActive = false;
              window.dispatchEvent(
                new CustomEvent(DEEPLINK_DISABLED, {
                  detail: { reason: "error" },
                }),
              );
            },
          }).catch(() => {});
        },
        onCancel: () => {
          // User cancelled - do nothing
        },
        hasResume: true,
      });
      return; // Skip normal deeplink flow
    }

    deepLinkActive = true; // mark so persistence skip resume
    window.dispatchEvent(new CustomEvent(DEEPLINK_ENABLED)); // Notify control bar to hide controls

    // Load remote image with timeout
    loadRemoteImageWithTimeout(state.deepLinkImageUrl, {
      timeout: 10000,
      onLoad: async (img) => {
        setCurrentImage(img);
        setCurrentImageSource(state.deepLinkImageUrl); // Store URL for persistence
        setCurrentImageLicense(state.deepLinkLicense); // Store license if provided
        // Map piece count to slider position
        const sliderVal = pieceCountToSlider(state.deepLinkPieceCount);
        // Use exported setter instead of accessing internal DOM element
        setSliderValue(sliderVal);
        updatePieceDisplay();

        // Apply grayscale filter if removeColor is set
        applyViewportGrayscaleFilter(state.deepLinkRemoveColor);

        await generatePuzzle();
        onPuzzleReady();
        // Reset deep link flag so persistence can start saving changes
        deepLinkActive = false;
        // Hide gallery if it was shown
        hidePictureGallery();
      },
      onTimeout: () => {
        deepLinkActive = false;
        window.dispatchEvent(
          new CustomEvent(DEEPLINK_DISABLED, {
            detail: { reason: "timeout" },
          }),
        );
        document.dispatchEvent(new CustomEvent(PERSISTENCE_RESTORE));
      },
      onError: () => {
        // Reset deep link flag and try normal resume flow
        deepLinkActive = false;
        window.dispatchEvent(
          new CustomEvent(DEEPLINK_DISABLED, {
            detail: { reason: "error" },
          }),
        );
        document.dispatchEvent(new CustomEvent(PERSISTENCE_RESTORE));
      },
    }).catch(() => {
      // Error handling is already done in callbacks
    });
  }

  // Listen for persistence can-resume event
  registerGlobalEvent(PERSISTENCE_CAN_RESUME, (event) => {
    const { savedState } = event.detail;
    showResumeModal({
      onResume: () => loadGame(),
      onDiscard: () => {
        clearSavedGame();
        document.dispatchEvent(
          new CustomEvent(PUZZLE_STATE_CHANGED, {
            detail: { action: "cleared" },
          }),
        );
        // Show picture gallery when user selects "new session" (unless in deep link mode)
        if (!deepLinkActive) {
          showPictureGallery((deepLinkUrl) => {
            // User selected a picture - navigate to deep link
            window.location.href = deepLinkUrl;
          });
        }
      },
      onCancel: () => {},
      hasResume: true,
    });
  });

  // Listen for persistence cannot-resume event
  registerGlobalEvent(PERSISTENCE_CANNOT_RESUME, () => {
    // No saved game - show picture gallery directly (unless in deep link mode)
    if (!deepLinkActive) {
      showPictureGallery((deepLinkUrl) => {
        // User selected a picture - navigate to deep link
        window.location.href = deepLinkUrl;
      });
    }
  });

  if (deepLinkActive) {
    // User requested deep link session: discard any previous save silently
    try {
      clearSavedGame();
      console.info(
        "[deep-link] Previous session discarded due to deep link mode",
      );
    } catch (e) {
      console.warn("[deep-link] Failed to clear previous save", e);
    }
  } else {
    // Request persistence to check for saved game
    document.dispatchEvent(new CustomEvent(PERSISTENCE_RESTORE));
  }
}

// Ensure bootstrap only runs once even if module is imported multiple times
// Use window object to persist flag across module imports
if (!window.__puzzleBootstrapExecuted) {
  window.__puzzleBootstrapExecuted = true;
  bootstrap();
}
