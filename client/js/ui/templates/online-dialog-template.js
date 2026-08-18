import { t } from "../../i18n.js";

export function onlineDialogTemplate({ roomId, playerCount, joinUrl }) {
  return `
    <h3>🌐 ${t("online.title")}</h3>
    <div class="dialog-field">
      <label>${t("online.roomId")}</label>
      <div class="dialog-value">${roomId}</div>
    </div>
    <div class="dialog-field">
      <label>${t("online.players")}</label>
      <div id="online-dialog-players" class="dialog-value">${playerCount}</div>
    </div>
    <div class="dialog-field">
      <label>${t("online.shareLink")}</label>
      <div style="display:flex;gap:8px;margin-top:4px;position:relative;align-items:center;">
        <input type="text" value="${joinUrl}" readonly onclick="this.select()"/>
        <button id="online-dialog-share-btn" style="background:none;border:none;cursor:pointer;padding:4px;line-height:1;" title="${t("online.share")}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
      </div>
    </div>
    <button id="online-close-btn" class="btn-close">${t("online.close")}</button>
  `;
}
