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
        // If pic is an object, allow pieces property
        return {
          type: "local",
          filename: pic.filename,
          url: `${PICTURES_PATH}${pic.filename}`,
          title:
            pic.title ||
            pic.filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, ""),
          pieces: pic.pieces || DEFAULT_PIECES,
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
        title: item.title || "Remote Image",
        pieces: item.pieces || DEFAULT_PIECES,
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

  // --- Filter Buttons (icons only) ---
  const filterBar = document.createElement("div");
  filterBar.className = "picture-gallery-filter-bar";

  const babyBtn = document.createElement("button");
  babyBtn.className = "picture-gallery-filter-btn";
  babyBtn.innerHTML = "🍼";
  babyBtn.title = "Baby (4-8 pieces)";

  const studentBtn = document.createElement("button");
  studentBtn.className = "picture-gallery-filter-btn";
  studentBtn.innerHTML = "🎓";
  studentBtn.title = "Student (10-100 pieces)";

  const masterBtn = document.createElement("button");
  masterBtn.className = "picture-gallery-filter-btn";
  masterBtn.innerHTML = "🧙‍♂️";
  masterBtn.title = "Master (>100 pieces)";

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
    if (filtered.length === 0) {
      const noPicturesMsg = document.createElement("p");
      noPicturesMsg.textContent = "No pictures available for this filter.";
      noPicturesMsg.style.textAlign = "center";
      noPicturesMsg.style.padding = "20px";
      grid.appendChild(noPicturesMsg);
      return;
    }
    filtered.forEach((picture) => {
      const item = document.createElement("a");
      item.className = "picture-gallery-item";
      const numPieces = picture.pieces || DEFAULT_PIECES;
      const deepLinkUrl = `?image=${encodeURIComponent(
        picture.url
      )}&pieces=${numPieces}&norotate=y`;
      item.href = deepLinkUrl;
      item.title = `${picture.title} - Start puzzle with ${numPieces} pieces`;
      const img = document.createElement("img");
      img.src = picture.url;
      img.alt = picture.title;
      img.loading = "lazy";
      
      // Hide item if image fails to load
      img.addEventListener("error", () => {
        item.style.display = "none";
        console.warn(`[picture-gallery] Failed to load image: ${picture.url}`);
      });
      
      item.appendChild(img);
      item.addEventListener("click", (e) => {
        e.preventDefault();
        hidePictureGallery();
        if (onSelect) onSelect(deepLinkUrl);
      });
      grid.appendChild(item);
    });
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

  const closeContainer = document.createElement("div");
  closeContainer.className = "picture-gallery-close";

  const closeButton = document.createElement("button");
  closeButton.textContent = t("gallery.uploadOwn");
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
