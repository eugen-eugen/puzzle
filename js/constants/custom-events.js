// custom-events.js - Custom event name constants
// Centralizes all custom event names used for inter-module communication

/**
 * Dispatched when puzzle pieces are generated.
 * @type {string}
 * @event piecesGenerated
 * @property {Object} detail - Event detail
 * @property {Array} detail.pieces - Array of generated puzzle pieces
 */
export const PIECES_GENERATED = "piecesGenerated";

/**
 * Dispatched when a piece is rotated.
 * @type {string}
 * @event piece:rotate
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the rotated piece
 * @property {number} detail.rotation - New rotation angle in degrees
 */
export const PIECE_ROTATE = "piece:rotate";

/**
 * Dispatched when a piece is selected (UI-level event).
 * @type {string}
 * @event piece:select
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the selected piece
 */
export const PIECE_SELECT = "piece:select";

/**
 * Dispatched when a piece is deselected (UI-level event).
 * @type {string}
 * @event piece:deselect
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the deselected piece
 */
export const PIECE_DESELECT = "piece:deselect";

/**
 * Dispatched when a piece detach animation should be triggered.
 * @type {string}
 * @event piece:detach-animation
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece to animate
 */
export const PIECE_DETACH_ANIMATION = "piece:detach-animation";

/**
 * Dispatched when a long press gesture starts on a piece.
 * @type {string}
 * @event piece:long-press-start
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece being long-pressed
 */
export const PIECE_LONG_PRESS_START = "piece:long-press-start";

/**
 * Dispatched when a long press gesture ends on a piece.
 * @type {string}
 * @event piece:long-press-end
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece that was long-pressed
 */
export const PIECE_LONG_PRESS_END = "piece:long-press-end";

/**
 * Dispatched when the orientation tip button is clicked to align selected piece to north (0°).
 * @type {string}
 * @event piece:north
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece to align to north
 */
export const PIECE_NORTH = "piece:north";

/**
 * Dispatched during piece dragging (pointer movement).
 * @type {string}
 * @event drag:move
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece being dragged
 * @property {Point} detail.delta - Movement delta since last event
 * @property {Point} detail.screenPosition - Current screen position of pointer
 */
export const DRAG_MOVE = "drag:move";

/**
 * Dispatched when a drag operation ends.
 * @type {string}
 * @event drag:end
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece that was dragged
 * @property {boolean} detail.wentOutside - Whether the piece went outside viewport during drag
 */
export const DRAG_END = "drag:end";

/**
 * Dispatched when high curvature (shuffle/shake gesture) is detected during drag.
 * @type {string}
 * @event drag:high-curvature
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the piece being dragged with high curvature
 * @property {number} detail.curvature - Curvature value (ratio of path length to displacement)
 */
export const DRAG_HIGH_CURVATURE = "drag:high-curvature";
