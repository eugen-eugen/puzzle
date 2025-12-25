// picture-gallery.js - Picture selection gallery for game start
import { t } from "../i18n.js";
import { applyLicenseIfPresent, toGrayscale } from "../utils/image-util.js";
import { handleImageUpload } from "./control-bar.js";
import { state } from "../game-engine.js";

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
      const localPictures = (data.pictures || []).map((pic) => {
        // If pic is a string, treat as filename only
        if (typeof pic === "string") {
          return {
            type: "local",
            filename: pic,
            url: `${PICTURES_PATH}${pic}`,
            title: pic.replace(/\.(png|jpg|jpeg|gif|webp)$/i, ""),
            pieces: DEFAULT_PIECES,
          };
        }
        // If pic is an object, spread all properties and set defaults
        return {
          type: "local",
          filename: pic.filename,
          url: `${PICTURES_PATH}${pic.filename}`,
          title:
            pic.title ||
            pic.filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, ""),
          pieces: pic.pieces ?? DEFAULT_PIECES,
          removeColor: pic.removeColor ?? "n",
          ...pic, // Spread all other fields as-is
        };
      });
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
        title: item.title ?? "Remote Image",
        pieces: item.pieces ?? DEFAULT_PIECES,
        removeColor: item.removeColor ?? "n",
        ...item, // Spread all other fields as-is
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
  title.textContent = t("gallery.title");
  gallery.appendChild(title);

  // --- Filter Buttons (icons only) ---
  const filterBar = document.createElement("div");
  filterBar.className = "picture-gallery-filter-bar";

  const babyBtn = document.createElement("button");
  babyBtn.className = "picture-gallery-filter-btn";
  babyBtn.innerHTML = "🍼";
  babyBtn.title = t("gallery.filterBaby");

  const studentBtn = document.createElement("button");
  studentBtn.className = "picture-gallery-filter-btn";
  studentBtn.innerHTML = "🎓";
  studentBtn.title = t("gallery.filterStudent");

  const masterBtn = document.createElement("button");
  masterBtn.className = "picture-gallery-filter-btn";
  masterBtn.innerHTML = "🧙‍♂️";
  masterBtn.title = t("gallery.filterMaster");

  filterBar.appendChild(babyBtn);
  filterBar.appendChild(studentBtn);
  filterBar.appendChild(masterBtn);
  gallery.appendChild(filterBar);

  // --- Selected filter state ---
  let selectedFilter = null;

  // --- Gallery Grid ---
  const grid = document.createElement("div");
  grid.className = "picture-gallery-grid";
  gallery.appendChild(grid);

  // Load available pictures
  const pictures = await loadAvailablePictures();

  function renderGallery(filter) {
    grid.innerHTML = "";
    let filtered = pictures;
    // Highlight selected filter
    [babyBtn, studentBtn, masterBtn].forEach((btn) =>
      btn.classList.remove("selected")
    );
    if (filter === "baby") {
      filtered = pictures.filter(
        (p) =>
          (p.pieces || DEFAULT_PIECES) >= 4 && (p.pieces || DEFAULT_PIECES) <= 8
      );
      babyBtn.classList.add("selected");
    } else if (filter === "student") {
      filtered = pictures.filter(
        (p) =>
          (p.pieces || DEFAULT_PIECES) >= 10 &&
          (p.pieces || DEFAULT_PIECES) <= 100
      );
      studentBtn.classList.add("selected");
    } else if (filter === "master") {
      filtered = pictures.filter((p) => (p.pieces || DEFAULT_PIECES) > 100);
      masterBtn.classList.add("selected");
    }
    if (!filter) {
      // Show all, no highlight
      filtered = pictures;
    }
    filtered.forEach((picture) => {
      const item = document.createElement("a");
      item.className = "picture-gallery-item";
      const numPieces = picture.pieces || DEFAULT_PIECES;
      const removeColor = picture.removeColor || "n";
      const license = picture.license
        ? `&license=${encodeURIComponent(picture.license)}`
        : "";
      const removeColorParam = removeColor ? `&removeColor=${removeColor}` : "";
      const deepLinkUrl = `?image=${encodeURIComponent(
        picture.url
      )}&pieces=${numPieces}&norotate=y${removeColorParam}${license}`;
      item.href = deepLinkUrl;
      item.title = t("gallery.itemTooltip", {
        title: picture.title,
        pieces: numPieces,
      });

      // Container for image and title
      const imageContainer = document.createElement("div");
      imageContainer.className = "picture-gallery-item-container";

      const img = document.createElement("img");
      img.alt = picture.title;
      img.loading = "lazy";

      // Load image and add license if present
      applyLicenseIfPresent(picture.url, {
        centered: true,
        fontSizePercent: 4,
        minFontSize: 20,
        returnDataUrl: true,
        removeColor: picture.removeColor,
        license: picture.license,
      })
        .then((dataUrl) => {
          img.src = dataUrl;
        })
        .catch((error) => {
          console.warn(
            `[picture-gallery] Failed to add license to preview: ${error.message}`
          );
          // Fallback: try grayscale conversion or plain image
          if (picture.removeColor === "y") {
            toGrayscale(picture.url, { returnDataUrl: true })
              .then((dataUrl) => {
                img.src = dataUrl;
              })
              .catch(() => {
                img.src = picture.url;
              });
          } else {
            img.src = picture.url;
          }
        });

      // Hide item if image fails to load
      img.addEventListener("error", () => {
        item.style.display = "none";
        console.warn(`[picture-gallery] Failed to load image: ${picture.url}`);
      });

      // Add image title below the preview
      const titleDiv = document.createElement("div");
      titleDiv.className = "picture-gallery-item-title";
      titleDiv.textContent = picture.title;

      imageContainer.appendChild(img);
      imageContainer.appendChild(titleDiv);
      item.appendChild(imageContainer);

      item.addEventListener("click", (e) => {
        e.preventDefault();
        hidePictureGallery();
        if (onSelect) onSelect(deepLinkUrl);
      });
      grid.appendChild(item);
    });
    // Always show the upload button at the end
    addUploadButton();
  }

  // Helper function to add the upload button as a gallery item
  function addUploadButton() {
    const uploadItem = document.createElement("button");
    uploadItem.className = "picture-gallery-item picture-gallery-upload";
    uploadItem.title = t("gallery.uploadOwn");

    // Container for plus sign and label
    const container = document.createElement("div");
    container.className = "picture-gallery-item-container";

    // Plus sign
    const plusSign = document.createElement("div");
    plusSign.innerHTML = "➕";
    plusSign.style.flex = "0 0 80%";
    plusSign.style.fontSize = "6em";
    plusSign.style.display = "flex";
    plusSign.style.alignItems = "center";
    plusSign.style.justifyContent = "center";
    plusSign.style.width = "100%";
    container.appendChild(plusSign);

    // Label below plus
    const label = document.createElement("div");
    label.className = "picture-gallery-item-title";
    label.textContent = t("gallery.selectOwn");
    container.appendChild(label);

    uploadItem.appendChild(container);
    uploadItem.style.border = "none";
    uploadItem.style.background = "transparent";
    uploadItem.style.cursor = "pointer";
    uploadItem.style.padding = "0";
    uploadItem.addEventListener("click", () => {
      // Create and trigger file input
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/jpg,image/gif,image/webp";
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          hidePictureGallery();
          await handleImageUpload(file);
        }
      });
      fileInput.click();
    });
    grid.appendChild(uploadItem);
  }

  // Initial render: show all
  renderGallery();

  // Filter button handlers (toggle)
  babyBtn.addEventListener("click", () => {
    if (selectedFilter === "baby") {
      selectedFilter = null;
      renderGallery();
    } else {
      selectedFilter = "baby";
      renderGallery("baby");
    }
  });
  studentBtn.addEventListener("click", () => {
    if (selectedFilter === "student") {
      selectedFilter = null;
      renderGallery();
    } else {
      selectedFilter = "student";
      renderGallery("student");
    }
  });
  masterBtn.addEventListener("click", () => {
    if (selectedFilter === "master") {
      selectedFilter = null;
      renderGallery();
    } else {
      selectedFilter = "master";
      renderGallery("master");
    }
  });

  // --- Logo click opens gallery ---
  const logo = document.getElementById("logo");
  if (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", () => {
      showPictureGallery(onSelect, onClose);
    });
  }

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
