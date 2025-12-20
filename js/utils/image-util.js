// image-util.js - Image manipulation utilities

/**
 * Convert an image to grayscale
 * @param {HTMLImageElement|string} imageSource - Image element or URL
 * @param {Object} options - Configuration options
 * @param {boolean} options.returnDataUrl - Return data URL instead of Image element (default: false)
 * @returns {Promise<HTMLImageElement|string>} Grayscale image or data URL
 */
export async function toGrayscale(imageSource, options = {}) {
  const { returnDataUrl = false } = options;

  // Load image if URL provided
  const img =
    typeof imageSource === "string"
      ? await loadImage(imageSource)
      : imageSource;

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");

  // Apply grayscale filter
  ctx.filter = "grayscale(100%)";
  ctx.drawImage(img, 0, 0);
  ctx.filter = "none";

  // Return data URL or new Image element
  const dataUrl = canvas.toDataURL();

  if (returnDataUrl) {
    return dataUrl;
  }

  const newImg = new Image();
  newImg.src = dataUrl;
  await newImg.decode();
  return newImg;
}

/**
 * Apply license text to an image if license is provided, otherwise return original image
 * @param {HTMLImageElement|string} imageSource - Image element or URL
 * @param {string|null|undefined} licenseText - License text to add (if null/undefined, returns original)
 * @param {Object} options - Configuration options
 * @param {boolean} options.removeColor - Apply grayscale filter
 * @param {boolean} options.centered - Center text at bottom (default: false, left-aligned)
 * @param {number} options.fontSizePercent - Font size as percentage of image height (default: 2)
 * @param {number} options.minFontSize - Minimum font size in pixels (default: 12)
 * @param {boolean} options.returnDataUrl - Return data URL instead of Image element (default: false)
 * @returns {Promise<HTMLImageElement|string>} Image with license text or original image
 */
export async function applyLicenseIfPresent(
  imageSource,
  licenseText,
  options = {}
) {
  // Load image if URL provided
  const img =
    typeof imageSource === "string"
      ? await loadImage(imageSource)
      : imageSource;

  // Return original image if no license text
  if (!licenseText) {
    return img;
  }

  // Add license text to image
  const {
    removeColor = false,
    centered = false,
    fontSizePercent = 2,
    minFontSize = 12,
    returnDataUrl = false,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");

  // Apply grayscale filter if needed
  if (removeColor) {
    ctx.filter = "grayscale(100%)";
  }

  // Draw original image (with filter applied if removeColor is true)
  ctx.drawImage(img, 0, 0);

  // Reset filter for text rendering
  ctx.filter = "none";

  // Calculate font size based on image height
  const fontSize = Math.max(
    minFontSize,
    Math.floor(img.height * (fontSizePercent / 100))
  );
  const padding = Math.floor(fontSize * 0.5);

  // Set up text style
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.textBaseline = "bottom";

  if (centered) {
    ctx.textAlign = "center";
  } else {
    ctx.textAlign = "left";
  }

  // Measure text
  const textMetrics = ctx.measureText(licenseText);
  const textWidth = textMetrics.width;
  const textHeight = fontSize;

  // Calculate background position
  let bgX, textX;
  if (centered) {
    bgX = (img.width - textWidth) / 2 - padding;
    textX = img.width / 2;
  } else {
    bgX = padding;
    textX = padding * 2;
  }

  const bgY = img.height - textHeight - padding * 2;
  const bgWidth = textWidth + padding * 2;
  const bgHeight = textHeight + padding * 2;

  // Draw semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

  // Draw text in white
  ctx.fillStyle = "white";
  ctx.fillText(licenseText, textX, img.height - padding * 1.5);

  // Return data URL or new Image element
  const dataUrl = canvas.toDataURL();

  if (returnDataUrl) {
    return dataUrl;
  }

  const newImg = new Image();
  newImg.src = dataUrl;
  await newImg.decode();
  return newImg;
}

/**
 * Load an image from URL
 * @param {string} url - Image URL
 * @param {boolean} crossOrigin - Enable CORS (default: true)
 * @returns {Promise<HTMLImageElement>} Loaded image
 */
export function loadImage(url, crossOrigin = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
