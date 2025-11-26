// picture-gallery.js - Picture selection gallery for game start
import { t } from "./i18n.js";

const PICTURES_PATH = "pictures/";
const DEFAULT_PIECES = 20;

let availablePictures = null;

/**
 * Load the list of available local and remote pictures
 */
async function loadAvailablePictures() {
  if (availablePictures !== null) {
    return availablePictures;
  }

  const allPictures = [];

  // Load local pictures
  try {
    const response = await fetch(`${PICTURES_PATH}pictures.json`);
    if (response.ok) {
      const data = await response.json();
      const localPictures = (data.pictures || []).map((filename) => ({
        type: "local",
        filename,
        url: `${PICTURES_PATH}${filename}`,
        title: filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, ""),
      }));
      allPictures.push(...localPictures);
      console.log(
        `[picture-gallery] Loaded ${localPictures.length} local pictures`
      );
    }
  } catch (error) {
    console.error("[picture-gallery] Error loading local pictures:", error);
  }

  // Load remote pictures
  try {
    const response = await fetch(`${PICTURES_PATH}remote-pictures.json`);
    if (response.ok) {
      const data = await response.json();
      const remotePictures = (data.pictures || []).map((item) => ({
        type: "remote",
        url: item.url,
        title: item.title || "Remote Image",
      }));
      allPictures.push(...remotePictures);
      console.log(
        `[picture-gallery] Loaded ${remotePictures.length} remote pictures`
      );
    }
  } catch (error) {
    console.error("[picture-gallery] Error loading remote pictures:", error);
  }

  availablePictures = allPictures;
  console.log(
    `[picture-gallery] Total ${availablePictures.length} pictures available`
  );
  return availablePictures;
}

/**
 * Show the picture gallery overlay
 * @param {Function} onSelect - Callback when user selects a picture (receives deep link URL)
 * @param {Function} onClose - Callback when user closes the gallery
 */
export async function showPictureGallery(onSelect, onClose) {
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

  // Load available pictures
  const pictures = await loadAvailablePictures();

  if (pictures.length === 0) {
    const noPicturesMsg = document.createElement("p");
    noPicturesMsg.textContent =
      "No pictures available. Please add images to the pictures folder.";
    noPicturesMsg.style.textAlign = "center";
    noPicturesMsg.style.padding = "20px";
    gallery.appendChild(noPicturesMsg);
  } else {
    pictures.forEach((picture) => {
      const item = document.createElement("a");
      item.className = "picture-gallery-item";

      const deepLinkUrl = `?image=${encodeURIComponent(
        picture.url
      )}&pieces=${DEFAULT_PIECES}&norotate=y`;

      item.href = deepLinkUrl;
      item.title = `${picture.title} - Start puzzle with ${DEFAULT_PIECES} pieces`;

      const img = document.createElement("img");
      img.src = picture.url;
      img.alt = picture.title;
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
  }

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
