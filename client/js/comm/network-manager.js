/**
 * network-manager.js - Manages multiplayer connection and synchronization
 * 
 * Handles Colyseus room connection and coordinates event synchronization
 */

import { Client } from 'colyseus.js';
import { EventSync } from './event-sync.js';

/**
 * Network manager for multiplayer functionality
 */
export class NetworkManager {
  constructor() {
    this.client = null;
    this.room = null;
    this.eventSync = null;
    this.connected = false;
    this.serverUrl = 'ws://localhost:2567';
  }

  /**
   * Connect to the multiplayer server
   * @param {Object} options - Connection options
   * @param {string} options.playerName - Player's display name
   * @returns {Promise<void>}
   */
  async connect(options = {}) {
    if (this.connected) {
      console.warn('Already connected to server');
      return;
    }

    try {
      console.log('🔌 Connecting to server:', this.serverUrl);
      
      this.client = new Client(this.serverUrl);
      
      // Join or create a puzzle room
      this.room = await this.client.joinOrCreate('puzzle', {
        name: options.playerName || 'Player'
      });

      this.connected = true;
      console.log('✅ Connected to room:', this.room.id);

      // Setup room listeners
      this._setupRoomListeners();

      // Initialize and start event synchronization
      this.eventSync = new EventSync(this.room);
      this.eventSync.start();

    } catch (error) {
      console.error('❌ Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    console.log('🔌 Disconnecting from server...');

    // Stop event sync
    if (this.eventSync) {
      this.eventSync.stop();
      this.eventSync = null;
    }

    // Leave room
    if (this.room) {
      await this.room.leave();
      this.room = null;
    }

    this.connected = false;
    console.log('✅ Disconnected');
  }

  /**
   * Setup listeners for room events
   * @private
   */
  _setupRoomListeners() {
    // Listen for state changes
    this.room.onStateChange((state) => {
      console.log('📊 State updated:', state);
    });

    // Listen for player joins
    this.room.state.players.onAdd((player, sessionId) => {
      console.log(`👤 Player joined: ${player.name} (${sessionId})`);
    });

    // Listen for player leaves
    this.room.state.players.onRemove((player, sessionId) => {
      console.log(`👋 Player left: ${player.name} (${sessionId})`);
    });

    // Listen for piece changes
    this.room.state.pieces.onChange((piece, pieceId) => {
      console.log(`🧩 Piece ${pieceId} updated:`, piece);
    });

    // Listen for server messages
    this.room.onMessage('grab_rejected', (message) => {
      console.warn(`⚠️ Grab rejected: piece ${message.pieceId} held by another player`);
      // TODO: Show visual feedback to user
    });

    this.room.onMessage('game_started', (message) => {
      console.log(`🎮 Game started with ${message.pieceCount} pieces`);
    });

    // Handle errors
    this.room.onError((code, message) => {
      console.error('❌ Room error:', code, message);
    });

    // Handle disconnection
    this.room.onLeave((code) => {
      console.log('🚪 Left room with code:', code);
      this.connected = false;
    });
  }

  /**
   * Check if connected to server
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get current room
   */
  getRoom() {
    return this.room;
  }
}

// Export singleton instance
export const networkManager = new NetworkManager();
