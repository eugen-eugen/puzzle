// imageProcessor.js - load and normalize image
// ================================
// Image Processing Constants
// ================================
const MAX_IMAGE_SIDE = 3000; // Max allowed dimension before downscaling
const JPEG_EXPORT_QUALITY = 0.9; // Quality for downscaled export

export async function processImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  // Scale down if longest side exceeds threshold
  let { width, height } = img;
  if (Math.max(width, height) > MAX_IMAGE_SIDE) {
    const scale = MAX_IMAGE_SIDE / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const scaledImg = new Image();
    scaledImg.src = canvas.toDataURL("image/jpeg", JPEG_EXPORT_QUALITY);
    await scaledImg.decode();
    return scaledImg;
  }
  return img;
}

// Load remote image with timeout and callbacks
export function loadRemoteImageWithTimeout(imageUrl, options = {}) {
  const {
    timeout = 10000,
    onLoad = () => {},
    onError = () => {},
    onTimeout = () => {},
  } = options;

  return new Promise((resolve, reject) => {
    // Load remote image with timeout
    const img = new Image();
    img.crossOrigin = "anonymous"; // allow canvas usage when CORS permits
    img.decoding = "async";

    // Set up timeout fallback
    const timeoutId = setTimeout(() => {
      console.warn("[remote-image] Image load timeout for:", imageUrl);
      onTimeout();
      reject(new Error(`Image load timeout: ${imageUrl}`));
    }, timeout);

    img.onload = async () => {
      clearTimeout(timeoutId);
      console.info("[remote-image] Image loaded successfully:", imageUrl);
      onLoad(img);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      console.warn("[remote-image] Failed to load image URL:", imageUrl);
      onError();
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };

    img.src = imageUrl;
  });
}
