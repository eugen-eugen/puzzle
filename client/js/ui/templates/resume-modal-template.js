import { t } from "../../i18n.js";

export function resumeModalTemplate({ hasResume, actionsHTML }) {
  return `
    <div class="resume-modal" role="dialog" aria-modal="true" aria-labelledby="resume-modal-title">
      <div style="text-align: center; font-size: 4rem; margin-bottom: 12px; line-height: 1;">🧩</div>
      <h2 id="resume-modal-title">${
        hasResume ? t("resume.title") : t("welcome.title")
      }</h2>
      <p>${hasResume ? t("resume.message") : t("welcome.message")}</p>
      <div class="resume-actions">
        ${actionsHTML}
      </div>
      ${hasResume ? `<div class="resume-meta">${t("resume.meta")}</div>` : ""}
    </div>`;
}

export function resumeActionsTemplate(hasResume) {
  return hasResume
    ? `
    <button class="resume-primary" data-action="resume">${t(
      "resume.resume",
    )}</button>
    <button class="resume-warn" data-action="cancel">${t(
      "resume.cancel",
    )}</button>
    <button class="resume-danger" data-action="discard">${t(
      "resume.discard",
    )}</button>
  `
    : `
    <button class="resume-primary" data-action="discard">${t(
      "welcome.start",
    )}</button>
    <button class="resume-warn" data-action="cancel">${t(
      "resume.cancel",
    )}</button>
  `;
}
