// i18n.js - lightweight translation loader
export let currentLanguage = "en";
let messages = {};

function interpolate(str, params) {
  if (!params) return str;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp("{" + k + "}", "g"), v),
    str
  );
}

export function t(key, params) {
  const raw = messages[key] || key;
  return interpolate(raw, params);
}

export async function loadLanguage(lang) {
  try {
    const resp = await fetch(`i18n/${lang}.json`, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    messages = await resp.json();
    currentLanguage = lang;
    localStorage.setItem("lang", lang);
    applyTranslations();
  } catch (e) {
    console.warn("[i18n] Failed to load language", lang, e);
    if (lang !== "en") {
      // fallback to en once
      await loadLanguage("en");
    }
  }
}

export function applyTranslations() {
  // Elements with inner HTML text
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (messages[key]) {
      el.innerHTML = t(key);
    }
  });
  // Title attributes
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (messages[key]) el.title = t(key);
  });
  // aria-label attributes
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.dataset.i18nAriaLabel;
    if (messages[key]) el.setAttribute("aria-label", t(key));
  });
  // Help modal body special case
  const helpBody = document.querySelector("#helpModal .modal-body");
  if (helpBody && messages["help.bodyHtml"]) {
    helpBody.innerHTML = messages["help.bodyHtml"];
  }
  // Resume modal (if open) dynamic refresh
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

export async function initI18n() {
  const saved = localStorage.getItem("lang");

  // Detect browser language
  const browserLang = navigator.language?.toLowerCase() || "en";
  let guess = "en";

  if (browserLang.startsWith("de")) {
    guess = "de";
  } else if (browserLang.startsWith("ru")) {
    guess = "ru";
  } else if (browserLang.startsWith("ua")) {
    guess = "ua";
  }

  await loadLanguage(saved || guess || "en");
  const select = document.getElementById("langSelect");
  if (select) {
    select.value = currentLanguage;
    select.addEventListener("change", (e) => {
      const lang = e.target.value;
      loadLanguage(lang);
    });
  }
}
