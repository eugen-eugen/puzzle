// i18n.js - lightweight translation loader
import { refreshResumeModalTranslations } from "./components/resume.js";

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
    const basePath = import.meta.env.BASE_URL || "/";
    const resp = await fetch(`${basePath}i18n/${lang}.json`, {
      cache: "no-cache",
    });
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
  refreshResumeModalTranslations();
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
