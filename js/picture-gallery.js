// picture-gallery.js - Picture selection gallery for game start
import { t } from "./i18n.js";

const BASE_URL = "https://eugen-eugen.github.io/puzzle/";
const PICTURES_PATH = "pictures/";
const DEFAULT_PIECES = 20;

// List of available pictures (add more filenames here as needed)
const AVAILABLE_PICTURES = ["kleidung.png"];

/**
 * Show the picture gallery overlay
 * @param {Function} onSelect - Callback when user selects a picture (receives deep link URL)
 * @param {Function} onClose - Callback when user closes the gallery
 */
export function showPictureGallery(onSelect, onClose) {
  // Remove any existing gallery
  const existing = document.getElementById("picture-gallery-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "picture-gallery-overlay";
  overlay.className = "picture-gallery-overlay";

  const gallery = document.createElement("div");
  gallery.className = "picture-gallery";

  const title = document.createElement("h2");
  title.textContent = "🧩 Choose a Puzzle";
  gallery.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "picture-gallery-grid";

  AVAILABLE_PICTURES.forEach((filename) => {
    const item = document.createElement("a");
    item.className = "picture-gallery-item";
    
    const imageUrl = `${BASE_URL}${PICTURES_PATH}${filename}`;
    const deepLinkUrl = `${BASE_URL}?image=${encodeURIComponent(
      imageUrl
    )}&pieces=${DEFAULT_PIECES}`;
    
    item.href = deepLinkUrl;
    item.title = `Start puzzle with ${DEFAULT_PIECES} pieces`;

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
    img.loading = "lazy";

    item.appendChild(img);

    item.addEventListener("click", (e) => {
      e.preventDefault();
      hidePictureGallery();
      if (onSelect) onSelect(deepLinkUrl);
    });

    grid.appendChild(item);
  });

  gallery.appendChild(grid);

  const closeContainer = document.createElement("div");
  closeContainer.className = "picture-gallery-close";

  const closeButton = document.createElement("button");
  closeButton.textContent = "Upload Your Own Image";
  closeButton.addEventListener("click", () => {
    hidePictureGallery();
    if (onClose) onClose();
  });

  closeContainer.appendChild(closeButton);
  gallery.appendChild(closeContainer);

  overlay.appendChild(gallery);
  document.body.appendChild(overlay);

  // Close on overlay click (not on gallery itself)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      hidePictureGallery();
      if (onClose) onClose();
    }
  });

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      hidePictureGallery();
      if (onClose) onClose();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);
}

/**
 * Hide and remove the picture gallery
 */
export function hidePictureGallery() {
  const overlay = document.getElementById("picture-gallery-overlay");
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Check if the gallery is currently shown
 */
export function isPictureGalleryVisible() {
  return document.getElementById("picture-gallery-overlay") !== null;
}
