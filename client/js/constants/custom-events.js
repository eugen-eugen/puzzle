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

/**
 * Dispatched when groups are modified (merged or detached).
 * @type {string}
 * @event groups:changed
 * @property {Object} detail - Event detail
 * @property {string} detail.type - Type of change: "merged" or "detached"
 * @property {string} [detail.fromGroupId] - Source group ID (for merge)
 * @property {string} [detail.toGroupId] - Target group ID (for merge)
 * @property {number} [detail.pieceId] - Piece ID (for detach)
 * @property {string} [detail.newGroupId] - New group ID (for detach)
 */
export const GROUPS_CHANGED = "groups:changed";

/**
 * Dispatched when puzzle state changes (pieces generated, loaded, or cleared).
 * @type {string}
 * @event puzzle:state-changed
 * @property {Object} detail - Event detail
 * @property {string} detail.action - Action type: "generated", "loaded", "cleared", "restored"
 */
export const PUZZLE_STATE_CHANGED = "puzzle:state-changed";

/**
 * Dispatched when deep link mode is enabled (e.g., when URL contains deep link parameters).
 * @type {string}
 * @event deeplink:enabled
 */
export const DEEPLINK_ENABLED = "deeplink:enabled";

/**
 * Dispatched when deep link mode is disabled (e.g., after file upload in gallery).
 * @type {string}
 * @event deeplink:disabled
 * @property {Object} detail - Event detail
 * @property {string} detail.reason - Reason for disabling: "file-upload", "puzzle-generated", "timeout", or "error"
 */
export const DEEPLINK_DISABLED = "deeplink:disabled";

/**
 * Dispatched when user selects an image file to upload.
 * @type {string}
 * @event image:upload-request
 * @property {Object} detail - Event detail
 * @property {File} detail.file - The image file to upload
 */
export const IMAGE_UPLOAD_REQUEST = "image:upload-request";

/**
 * Dispatched when the application requests persistence to save current state.
 * Core -> Persistence communication.
 * @type {string}
 * @event persistence:save
 * @property {Object} detail - Event detail (optional)
 * @property {string} detail.reason - Reason for save: "connection", "drag", "manual", etc.
 */
export const PERSISTENCE_SAVE = "persistence:save";

/**
 * Dispatched when the application requests persistence to attempt restore.
 * Core -> Persistence communication.
 * @type {string}
 * @event persistence:restore
 */
export const PERSISTENCE_RESTORE = "persistence:restore";

/**
 * Dispatched when persistence successfully loaded saved state and can resume.
 * Persistence -> Core communication.
 * @type {string}
 * @event persistence:can-resume
 * @property {Object} detail - Event detail
 * @property {Object} detail.savedState - The saved state data
 */
export const PERSISTENCE_CAN_RESUME = "persistence:can-resume";

/**
 * Dispatched when persistence has no saved state to restore (empty state).
 * Persistence -> Core communication.
 * @type {string}
 * @event persistence:cannot-resume
 */
export const PERSISTENCE_CANNOT_RESUME = "persistence:cannot-resume";

/**
 * Dispatched when pieces are connected/merged into a group.
 * @type {string}
 * @event pieces:connected
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceAId - ID of first piece (legacy)
 * @property {number} detail.pieceBId - ID of second piece (legacy)
 * @property {number} detail.groupId - Resulting group ID
 * @property {Object} detail.neighborsA - Neighbors of first piece (legacy)
 * @property {Object} detail.neighborsB - Neighbors of second piece (legacy)
 * @property {number} detail.pieceId - ID of the attached piece (conforming, same as pieceBId)
 * @property {Object} detail.neighbors - Neighbors of the attached piece (conforming, same as neighborsB)
 */
export const PIECES_CONNECTED = "pieces:connected";

/**
 * Event dispatched when a piece is disconnected from a group
 * @event pieces:disconnected
 * @property {Object} detail - Event detail
 * @property {number} detail.pieceId - ID of the disconnected piece
 * @property {Object} detail.neighbors - Neighbors of the disconnected piece {NORTH: piece, EAST: piece, ...}
 */
export const PIECES_DISCONNECTED = "pieces:disconnected";
