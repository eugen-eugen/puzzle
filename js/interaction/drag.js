// drag.js - Drag motion analysis for gesture-based piece detachment

/**
 * DragMonitor analyzes pointer motion during puzzle piece dragging to detect shuffle/shake gestures.
 *
 * Purpose in the game:
 * Enables intuitive piece detachment from groups through a natural shuffle gesture (rapid back-and-forth
 * motion). This provides a device-independent alternative to keyboard modifiers (Shift) or touch-specific
 * gestures (two-finger drag, long press).
 *
 * How it works:
 * - Tracks the last 10 pointer positions during a drag operation
 * - Calculates path curvature: ratio of total path length to direct displacement
 * - Straight drag: curvature ≈ 1.0
 * - Shuffle/shake motion: curvature > 3.5 (indicates back-and-forth movement)
 * - Triggers registered callbacks when curvature threshold is exceeded
 *
 * The curvature metric is device-independent and works consistently across different screen
 * resolutions, pixel densities, and input devices (mouse, trackpad, touchscreen).
 *
 * @example
 * // Register callback for piece detachment
 * dragMonitor.registerCurvatureCallback(3.5, (data) => {
 *   console.log(`Shuffle detected! Curvature: ${data.curvature}`);
 *   detachPieceFromGroup(piece);
 * });
 */
export class DragMonitor {
  constructor() {
    // Position tracking state
    this.lastPosition = null;
    this.lastTimestamp = null;

    // Curvature tracking (shuffle detection)
    this.currentCurvature = 1.0;
    this.positionWindow = []; // Sliding window of recent positions
    this.maxPositionSamples = 10; // Keep last 10 positions for curvature calculation

    // Curvature threshold for high curvature detection
    this.curvatureThreshold = 8;

    // Threshold callbacks: { threshold: N, callback: fn }
    this.curvatureCallbacks = []; // Path curvature thresholds for shuffle detection

    // Active drag state
    this.isDragging = false;

    // Set up event listeners
    this._setupEventListeners();
  }

  /**
   * Set up event listeners for drag events from UIInteractionManager
   * @private
   */
  _setupEventListeners() {
    document.addEventListener("drag:move", (event) => {
      this.dragEvent(event.detail);
    });

    document.addEventListener("drag:end", () => {
      this.endDrag();
    });
  }

  /**
   * Process a drag event and update curvature metrics
   *
   * Call this method for each pointer move event during a drag operation. It maintains
   * a sliding window of recent positions and calculates path curvature to detect shuffle gestures.
   *
   * @param {Object} event - Pointer/drag event with coordinates and timestamp
   * @param {number} event.x - Current x coordinate (screen coordinates)
   * @param {number} event.y - Current y coordinate (screen coordinates)
   * @param {number} [event.timestamp] - Event timestamp in milliseconds (optional, uses performance.now())
   */
  dragEvent(event) {
    const timestamp = event.timestamp || performance.now();
    const position = { x: event.x, y: event.y };

    // Initialize on first event
    if (this.lastPosition === null || this.lastTimestamp === null) {
      this.lastPosition = position;
      this.lastTimestamp = timestamp;
      this.isDragging = true;
      return;
    }

    // Update position window for curvature calculation
    this.positionWindow.push({ x: position.x, y: position.y, timestamp });
    if (this.positionWindow.length > this.maxPositionSamples) {
      this.positionWindow.shift(); // Remove oldest position
    }

    // Calculate curvature (path length / direct displacement)
    this.calculateCurvature();

    // Check threshold callbacks
    this.checkCurvatureCallbacks();

    // Update state for next event
    this.lastPosition = position;
    this.lastTimestamp = timestamp;
    this.isDragging = true;
  }

  /**
   * Calculate path curvature from position window
   *
   * Curvature measures how "wiggly" the pointer path is:
   * - Formula: totalPathLength / directDisplacement
   * - Straight line: curvature = 1.0
   * - Slight curve: curvature = 1.5-2.5
   * - Shuffle/shake: curvature > 3.5
   *
   * The curvature metric is dimensionless and device-independent, making it suitable
   * for detecting shuffle gestures across different screen resolutions and input devices.
   *
   * @private
   */
  calculateCurvature() {
    if (this.positionWindow.length < 3) {
      this.currentCurvature = 1.0;
      return;
    }

    // Calculate total path length (sum of distances between consecutive points)
    let totalPathLength = 0;
    for (let i = 1; i < this.positionWindow.length; i++) {
      const prev = this.positionWindow[i - 1];
      const curr = this.positionWindow[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      totalPathLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Calculate direct displacement (straight line from first to last)
    const firstPos = this.positionWindow[0];
    const lastPos = this.positionWindow[this.positionWindow.length - 1];
    const dx = lastPos.x - firstPos.x;
    const dy = lastPos.y - firstPos.y;
    const directDisplacement = Math.sqrt(dx * dx + dy * dy);

    // Calculate curvature ratio
    // Add small epsilon to avoid division by zero
    if (directDisplacement < 1) {
      // Very small displacement - likely stopped or minimal movement
      this.currentCurvature = 1.0;
    } else {
      this.currentCurvature = totalPathLength / directDisplacement;
    }
  }

  /**
   * Get current curvature metric
   *
   * @returns {number} Current path curvature ratio
   *   - 1.0 = perfectly straight line
   *   - 1.5-2.5 = gentle curve or corner
   *   - >3.5 = shuffle/shake motion (suitable for piece detachment)
   */
  getCurvature() {
    return this.currentCurvature;
  }

  /**
   * Register a callback to be called when curvature exceeds threshold
   *
   * Use this to detect shuffle/shake gestures for piece detachment or other game mechanics.
   * The callback is debounced to 100ms to prevent multiple rapid triggers.
   *
   * @param {number} threshold - Curvature threshold (recommended: 3.5 for shuffle detection)
   *   - Lower values (2-3) = more sensitive, may trigger on tight curves
   *   - Higher values (4-5) = less sensitive, requires more pronounced shuffling
   * @param {Function} callback - Function to call when threshold is exceeded
   *   Receives object: {curvature, threshold, positionCount}
   * @returns {Function} Unregister function to remove this callback
   *
   * @example
   * const unregister = dragMonitor.registerCurvatureCallback(3.5, (data) => {
   *   console.log(`Shuffle detected! Curvature: ${data.curvature.toFixed(2)}`);
   *   detachPieceFromGroup(currentPiece);
   * });
   * // Later: unregister() to remove the callback
   */
  registerCurvatureCallback(threshold, callback) {
    if (typeof threshold !== "number" || threshold <= 0) {
      console.warn("[DragMonitor] Invalid curvature threshold:", threshold);
      return () => {};
    }

    if (typeof callback !== "function") {
      console.warn("[DragMonitor] Invalid callback:", callback);
      return () => {};
    }

    const registration = {
      threshold,
      callback,
      lastTriggered: 0,
    };

    this.curvatureCallbacks.push(registration);

    // Return unregister function
    return () => {
      const index = this.curvatureCallbacks.indexOf(registration);
      if (index !== -1) {
        this.curvatureCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Check all registered curvature callbacks and trigger if thresholds are exceeded
   *
   * Called automatically by dragEvent() after each curvature calculation.
   * Implements 100ms debouncing per callback to prevent rapid repeated triggers.
   *
   * @private
   */
  checkCurvatureCallbacks() {
    // Check if curvature exceeds the threshold and dispatch event
    if (this.currentCurvature >= this.curvatureThreshold) {
      document.dispatchEvent(
        new CustomEvent("drag:high-curvature", {
          detail: {
            curvature: this.currentCurvature,
            threshold: this.curvatureThreshold,
            positionCount: this.positionWindow.length,
          },
        })
      );
    }

    // Also support legacy callbacks for backward compatibility
    const now = performance.now();
    for (const registration of this.curvatureCallbacks) {
      // Check if curvature exceeds threshold
      if (this.currentCurvature >= registration.threshold) {
        // Debounce: only trigger once per 100ms to avoid spam
        if (now - registration.lastTriggered > 100) {
          registration.lastTriggered = now;

          try {
            registration.callback({
              curvature: this.currentCurvature,
              threshold: registration.threshold,
              positionCount: this.positionWindow.length,
            });
          } catch (error) {
            console.error("[DragMonitor] Curvature callback error:", error);
          }
        }
      }
    }
  }

  /**
   * Reset drag state (call when drag ends)
   *
   * Clears position window and resets curvature to 1.0. Call this in the drag end handler
   * to prepare for the next drag operation.
   */
  endDrag() {
    this.isDragging = false;
    this.currentCurvature = 1.0;
    this.lastPosition = null;
    this.lastTimestamp = null;
    this.positionWindow = [];
  }

  /**
   * Reset all statistics (useful for testing or game restart)
   *
   * Similar to endDrag() but also clears the drag state flag. Use this for
   * complete reset scenarios like game restart or testing.
   */
  reset() {
    this.currentCurvature = 1.0;
    this.positionWindow = [];
    this.lastPosition = null;
    this.lastTimestamp = null;
    this.isDragging = false;
  }

  /**
   * Get detailed statistics about current drag state
   *
   * Useful for debugging, telemetry, or displaying drag analytics.
   *
   * @returns {Object} Detailed drag statistics
   * @returns {number} return.currentCurvature - Current path curvature ratio
   * @returns {number} return.positionWindowCount - Number of positions in sliding window (0-10)
   * @returns {boolean} return.isDragging - Whether a drag operation is currently active
   * @returns {number} return.curvatureCallbackCount - Number of registered callbacks
   */
  getStatistics() {
    return {
      currentCurvature: this.currentCurvature,
      positionWindowCount: this.positionWindow.length,
      isDragging: this.isDragging,
      curvatureCallbackCount: this.curvatureCallbacks.length,
    };
  }
}

/**
 * Singleton instance for convenient access throughout the game
 *
 * Used by interaction-manager.js to monitor piece dragging and detect shuffle gestures
 * for piece detachment from groups.
 */
export const dragMonitor = new DragMonitor();
