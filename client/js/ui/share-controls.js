// share-controls.js - UI controls for online sharing and room info dialog

import { state } from "../game-engine.js";
import { t } from "../i18n.js";
import { buildJoinUrl } from "../comm/online-game.js";
import {
  isOnlineMode,
  startOnlineGame,
  sendFullState,
  sendConfig,
} from "../comm/network-manager.js";
import { onlineDialogTemplate } from "./templates/online-dialog-template.js";

/**
 * Show the share button in the top-right area. In offline mode it creates a new online room.
 */
export function showShareButton() {
  if (document.getElementById("share-btn")) return;

  const btn = document.createElement("button");
  btn.id = "share-btn";
  btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
  btn.title = t("online.share");
  btn.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:9999;font-size:24px;background:none;border:none;cursor:pointer;line-height:1;padding:4px;";
  document.body.appendChild(btn);

  btn.addEventListener("click", async () => {
    if (isOnlineMode()) {
      openShareMenu();
      return;
    }
    if (!state.image) return;

    btn.disabled = true;
    try {
      const config = {
        imageUrl: state.deepLinkImageUrl || state.image?.source,
        pieceCount: state.totalPieces,
        noRotate: state.noRotate,
        removeColor: state.puzzleSettings?.removeColor || false,
        license: state.image?.license || null,
      };
      const roomId = await startOnlineGame(config);
      state.onlineMode = "host";
      state.onlineRoomId = roomId;
      sendFullState();
      sendConfig(config);
      btn.style.right = "40px";
      showOnlineGameInfo(roomId);
    } catch (err) {
      console.error("[share] Failed to create room:", err);
    } finally {
      btn.disabled = false;
    }
  });
}

function openShareMenu() {
  const existing = document.getElementById("share-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const roomId = state.onlineRoomId;
  if (!roomId) return;
  const joinUrl = buildJoinUrl(roomId);

  const menu = document.createElement("div");
  menu.id = "share-menu";
  menu.className = "share-menu";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = `📋 ${t("online.copyLink")}`;
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(joinUrl);
    copyBtn.textContent = `✓ ${t("online.copied")}`;
    setTimeout(() => menu.remove(), 1000);
  });

  const waBtn = document.createElement("button");
  waBtn.textContent = `💬 ${t("online.shareWhatsApp")}`;
  waBtn.addEventListener("click", () => {
    const text = encodeURIComponent(
      `${t("online.whatsAppMessage")} ${joinUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
    menu.remove();
  });

  menu.appendChild(copyBtn);
  menu.appendChild(waBtn);
  document.body.appendChild(menu);

  // Close on outside click
  const closeHandler = (e) => {
    if (!menu.contains(e.target) && e.target.id !== "share-btn") {
      menu.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

/**
 * Show online mode indicator as a globe button; clicking opens a dialog with online info.
 */
export function showOnlineGameInfo(roomId) {
  const joinUrl = buildJoinUrl(roomId);

  // Move share button left to make room
  const shareBtn = document.getElementById("share-btn");
  if (shareBtn) shareBtn.style.right = "40px";

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
  overlay.className = "dialog-overlay";

  const dialog = document.createElement("div");
  dialog.className = "dialog-panel";

  const badge = document.getElementById("online-player-badge");
  const playerCount = badge ? badge.textContent : "1";

  dialog.innerHTML = onlineDialogTemplate({ roomId, playerCount, joinUrl });

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  dialog
    .querySelector("#online-dialog-share-btn")
    .addEventListener("click", (e) => {
      const existing = dialog.querySelector(".share-menu");
      if (existing) {
        existing.remove();
        return;
      }

      const menu = document.createElement("div");
      menu.className = "share-menu";
      menu.style.position = "absolute";

      const copyBtn = document.createElement("button");
      copyBtn.textContent = `📋 ${t("online.copyLink")}`;
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(joinUrl);
        copyBtn.textContent = `✓ ${t("online.copied")}`;
        setTimeout(() => menu.remove(), 1000);
      });

      const waBtn = document.createElement("button");
      waBtn.textContent = `💬 ${t("online.shareWhatsApp")}`;
      waBtn.addEventListener("click", () => {
        const text = encodeURIComponent(
          `${t("online.whatsAppMessage")} ${joinUrl}`,
        );
        window.open(`https://wa.me/?text=${text}`, "_blank");
        menu.remove();
      });

      menu.appendChild(copyBtn);
      menu.appendChild(waBtn);
      e.target.parentElement.appendChild(menu);
    });

  dialog
    .querySelector("#online-close-btn")
    .addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
