// windowManager.js - simplified (single-window mode)
// Game table removed: this module now only exposes a minimal progress event dispatcher.

let listeners = [];

export function initCommChannel(onProgressUpdate) {
  if (onProgressUpdate) listeners.push(onProgressUpdate);
  return {
    postProgress(payload) {
      listeners.forEach((fn) => fn(payload));
    },
  };
}

export function postMessage(type, payload) {
  // Only support local progress-update messages now.
  if (type === "progress-update") {
    listeners.forEach((fn) => fn(payload));
  } else {
    // Silently ignore other legacy message types.
    console.debug(
      "[windowManager] ignoring message type in single-window mode",
      type
    );
  }
}

export function getTableViewport() {
  // No table viewport in single-window mode.
  return null;
}
