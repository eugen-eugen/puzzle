// resume.js - Resume modal dialog for saved game management
import { t } from "../i18n.js";
import "../../css/resume.css";
import {
  resumeModalTemplate,
  resumeActionsTemplate,
} from "../ui/templates/resume-modal-template.js";

let resumeModalOverlay = null;

/**
 * Create and show a custom modal dialog for resuming a saved game
 * @param {Object} options - Configuration options
 * @param {Function} options.onResume - Callback when user chooses to resume
 * @param {Function} options.onDiscard - Callback when user chooses to discard
 * @param {Function} options.onCancel - Callback when user cancels
 * @param {boolean} options.hasResume - Whether a saved game exists (default: true)
 */
export function showResumeModal({
  onResume,
  onDiscard,
  onCancel,
  hasResume = true,
}) {
  // Avoid duplicate modal
  const existing = document.getElementById("resume-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "resume-modal-overlay";

  const actionsHTML = resumeActionsTemplate(hasResume);
  overlay.innerHTML = resumeModalTemplate({ hasResume, actionsHTML });
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    resumeModalOverlay = null;
  }

  function onKey(e) {
    if (e.key === "Escape") {
      close();
      onCancel && onCancel();
    }
  }
  document.addEventListener("keydown", onKey);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
      onCancel && onCancel();
    }
  });

  overlay.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "resume") {
        close();
        onResume && onResume();
      } else if (action === "discard") {
        close();
        onDiscard && onDiscard();
      } else if (action === "cancel") {
        close();
        onCancel && onCancel();
      }
    });
  });

  // Focus first button for accessibility
  const firstBtn = overlay.querySelector("button[data-action='resume']");
  firstBtn && firstBtn.focus();

  resumeModalOverlay = overlay;
}

/**
 * Check if the resume modal is currently open
 * @returns {boolean} True if modal is open
 */
export function isResumeModalOpen() {
  return (
    resumeModalOverlay !== null && document.body.contains(resumeModalOverlay)
  );
}

/**
 * Close the resume modal if it's open
 */
export function closeResumeModal() {
  const overlay = document.getElementById("resume-modal-overlay");
  if (overlay) {
    overlay.remove();
    resumeModalOverlay = null;
  }
}

/**
 * Refresh translations in the resume modal (called when language changes)
 */
export function refreshResumeModalTranslations() {
  const resumeModal = document.getElementById("resume-modal-overlay");
  if (resumeModal) {
    const title = resumeModal.querySelector("#resume-modal-title");
    if (title) title.textContent = t("resume.title");
    const msg = resumeModal.querySelector(".resume-modal p");
    if (msg) msg.textContent = t("resume.message");
    resumeModal.querySelectorAll("button").forEach((btn) => {
      const act = btn.dataset.action;
      if (act === "resume") btn.textContent = t("resume.resume");
      else if (act === "cancel") btn.textContent = t("resume.cancel");
      else if (act === "discard") btn.textContent = t("resume.discard");
    });
    const meta = resumeModal.querySelector(".resume-meta");
    if (meta) meta.textContent = t("resume.meta");
  }
}
