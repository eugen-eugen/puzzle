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
