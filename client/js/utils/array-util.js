/**
 * Array utility functions
 */

/**
 * Checks if an array is empty or nullish (null or undefined).
 *
 * @param {Array|null|undefined} arr - The array to check
 * @returns {boolean} True if the array is null, undefined, or has length 0
 */
export function isEmptyOrNullish(arr) {
  return !arr || arr.length === 0;
}

/**
 * Returns a new array with elements in reversed order.
 * Does not mutate the original array.
 *
 * @param {Array} arr - The array to reverse
 * @returns {Array} A new array with elements in reversed order
 */
export function reversed(arr) {
  return [...arr].reverse();
}
