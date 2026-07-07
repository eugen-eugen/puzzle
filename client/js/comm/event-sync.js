/**
 * event-sync.js - Synchronizes local custom events to the multiplayer server
 * 
 * This module listens to all relevant custom events from the puzzle game
 * and forwards them to the Colyseus server for synchronization with other players.
 */

import { registerGlobalEvent } from '../utils/event-util.js';
import {
  PIECE_ROTATE,
  DRAG_MOVE,
  DRAG_END,
  DRAG_HIGH_CURVATURE,
  PIECES_CONNECTED,
  PIECES_DISCONNECTED,
  GROUPS_CHANGED,
  PIECE_SELECT,
  PIECE_DESELECT,
  PIECE_LONG_PRESS_START,
  PIECE_LONG_PRESS_END
} from '../constants/custom-events.js';

// Events to sync to server
const SYNC_EVENTS = [
  PIECE_ROTATE,
  DRAG_MOVE,
  DRAG_END,
  DRAG_HIGH_CURVATURE,
  PIECES_CONNECTED,
  PIECES_DISCONNECTED,
  GROUPS_CHANGED,
  PIECE_SELECT,
  PIECE_DESELECT,
  PIECE_LONG_PRESS_START,
  PIECE_LONG_PRESS_END
];

/**
 * Event synchronization manager
 * Bridges local game events to network layer
 */
export class EventSync {
  /**
   * @param {Object} room - Colyseus room instance
   */
  constructor(room) {
    this.room = room;
    this.enabled = false;
  }

  /**
   * Start listening to game events and syncing to server
   */
  start() {
    if (this.enabled) {
      console.warn('EventSync already started');
      return;
    }

    this.enabled = true;
    console.log('🔄 EventSync started - forwarding events to server');

    // Register handler for all sync events
    registerGlobalEvent(SYNC_EVENTS, (event) => {
      if (this.enabled) {
        this.room.send('event', {
          type: event.type,
          detail: event.detail
        });
        console.log(`📤 Sent event: ${event.type}`, event.detail);
      }
    });
  }

  /**
   * Stop syncing events (note: cannot unregister with current event-util)
   */
  stop() {
    this.enabled = false;
    console.log('🛑 EventSync stopped');
  }

  /**
   * Check if sync is enabled
   */
  isEnabled() {
    return this.enabled;
  }
}
