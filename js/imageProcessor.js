// imageProcessor.js - load and normalize image
export async function processImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  // Scale down if longest side > 3000px
  const maxSide = 3000;
  let { width, height } = img;
  if (Math.max(width, height) > maxSide) {
    const scale = maxSide / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const scaledImg = new Image();
    scaledImg.src = canvas.toDataURL("image/jpeg", 0.9);
    await scaledImg.decode();
    return scaledImg;
  }
  return img;
}
