// color-util.js - Color manipulation utilities

/**
 * Darken a hex color by a given amount
 * @param {string} color - Hex color string (e.g., "#D2691E")
 * @param {number} amount - Amount to darken (0-1)
 * @returns {string} RGB color string
 */
export function darkenColor(color, amount) {
  const hex = color.replace("#", "");
  const r = Math.max(0, parseInt(hex.substring(0, 2), 16) * (1 - amount));
  const g = Math.max(0, parseInt(hex.substring(2, 4), 16) * (1 - amount));
  const b = Math.max(0, parseInt(hex.substring(4, 6), 16) * (1 - amount));
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * Lighten a hex color by a given amount
 * @param {string} color - Hex color string (e.g., "#D2691E")
 * @param {number} amount - Amount to lighten (0-1)
 * @returns {string} RGB color string
 */
export function lightenColor(color, amount) {
  const hex = color.replace("#", "");
  const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + 255 * amount);
  const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + 255 * amount);
  const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + 255 * amount);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
