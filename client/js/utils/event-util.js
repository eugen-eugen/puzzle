// event-util.js - Utility functions for event handling
// Prevents duplicate event listener registrations

/**
 * Map to track registered event listeners per target
 * Structure: WeakMap<target, Map<eventName, Map<key, handler>>>
 */
const registeredListeners = new WeakMap();

/**
 * Generate a unique key from a function's content
 * @param {Function} fn - The function to generate a key for
 * @returns {string} A unique key based on the function's source code
 */
function generateFunctionKey(fn) {
  // Use the function's source code as the key
  // This allows deduplication of anonymous functions with identical implementations
  const fnString = fn.toString();

  // Simple hash function for better performance with large strings
  let hash = 0;
  for (let i = 0; i < fnString.length; i++) {
    const char = fnString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `fn_${hash}_${fnString.length}`;
}

/**
 * Register a global event listener with duplicate prevention.
 *
 * Automatically deduplicates event listeners based on their implementation.
 * Anonymous functions with identical source code will be deduplicated.
 *
 * Examples:
 *   // Anonymous functions with same implementation - only registered once:
 *   registerGlobalEvent('myEvent', (e) => console.log(e), document);
 *   registerGlobalEvent('myEvent', (e) => console.log(e), document); // Skipped (duplicate)
 *   // Array of events with same handler:
 *   registerGlobalEvent(['event1', 'event2'], (e) => console.log(e), document);
 *
 * @param {string|string[]} eventName - The name of the event(s) to listen for
 * @param {Function} handler - The event handler function
 * @param {EventTarget} [target=document] - The target to attach the listener to
 * @returns {boolean} True if listener was registered, false if already registered
 */
export function registerGlobalEvent(eventName, handler, target = document) {
  // Handle array of event names
  if (Array.isArray(eventName)) {
    let allRegistered = true;
    eventName.forEach((name) => {
      const registered = registerGlobalEvent(name, handler, target);
      if (!registered) allRegistered = false;
    });
    return allRegistered;
  }
  const eventNames = Array.isArray(eventName) ? eventName : [eventName];
  eventNames.forEach((eventName) => {
    if (typeof eventName !== "string" || !eventName) {
      console.warn("[event-util] Invalid event name:", eventName);
      return false;
    }

    if (typeof handler !== "function") {
      console.warn("[event-util] Invalid handler:", handler);
      return false;
    }

    if (!target || typeof target.addEventListener !== "function") {
      console.warn("[event-util] Invalid target:", target);
      return false;
    }

    // Generate key from the function's content
    const dedupeKey = generateFunctionKey(handler);

    // Get or create the event map for this target
    let eventMap = registeredListeners.get(target);
    if (!eventMap) {
      eventMap = new Map();
      registeredListeners.set(target, eventMap);
    }

    // Get or create the handler map for this event
    let handlerMap = eventMap.get(eventName);
    if (!handlerMap) {
      handlerMap = new Map();
      eventMap.set(eventName, handlerMap);
    }

    // Check if handler is already registered
    if (handlerMap.has(dedupeKey)) {
      console.debug(
        `[event-util] Handler already registered for event "${eventName}"`
      );
      return false;
    }

    // Register the handler
    target.addEventListener(eventName, handler);
    handlerMap.set(dedupeKey, handler);

    return true;
  });
}

/**
 * Unregister a global event listener.
 *
 * @param {string} eventName - The name of the event
 * @param {Function} handler - The event handler function
 * @param {EventTarget} [target=document] - The target to remove the listener from
 * @returns {boolean} True if listener was removed, false if not found
 */
export function unregisterGlobalEvent(eventName, handler, target = document) {
  const eventMap = registeredListeners.get(target);
  if (!eventMap) return false;

  const handlerMap = eventMap.get(eventName);
  if (!handlerMap) return false;

  const dedupeKey = generateFunctionKey(handler);
  const storedHandler = handlerMap.get(dedupeKey);
  if (!storedHandler) return false;

  // Remove the handler
  target.removeEventListener(eventName, storedHandler);
  handlerMap.delete(dedupeKey);

  // Clean up empty collections
  if (handlerMap.size === 0) {
    eventMap.delete(eventName);
  }
  if (eventMap.size === 0) {
    registeredListeners.delete(target);
  }

  return true;
}

/**
 * Check if a handler is registered for a specific event.
 *
 * @param {string} eventName - The name of the event
 * @param {Function} handler - The event handler function
 * @param {EventTarget} [target=document] - The target to check
 * @returns {boolean} True if handler is registered
 */
export function isEventRegistered(eventName, handler, target = document) {
  const eventMap = registeredListeners.get(target);
  if (!eventMap) return false;

  const handlerMap = eventMap.get(eventName);
  if (!handlerMap) return false;

  const dedupeKey = generateFunctionKey(handler);
  return handlerMap.has(dedupeKey);
}
