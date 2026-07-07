import pkg from 'colyseus';
const { Room } = pkg;
import { PuzzleState, Player, Piece } from '../schema/PuzzleState.js';

export class PuzzleRoom extends Room {
  maxClients = 10;

  onCreate(options) {
    console.log('🎮 PuzzleRoom created with options:', options);
    
    this.setState(new PuzzleState());

    // Handle piece move messages
    this.onMessage('move', (client, message) => {
      const { pieceId, x, y, rotation } = message;
      const piece = this.state.pieces.get(pieceId);
      
      if (piece) {
        piece.x = x;
        piece.y = y;
        if (rotation !== undefined) {
          piece.rotation = rotation;
        }
        
        console.log(`📨 Player ${client.sessionId} moved piece ${pieceId} to (${x}, ${y}), rotation: ${rotation}°`);
      }
    });

    // Handle piece grab
    this.onMessage('grab', (client, message) => {
      const { pieceId } = message;
      const piece = this.state.pieces.get(pieceId);
      
      if (piece && !piece.grabbedBy) {
        piece.grabbedBy = client.sessionId;
        console.log(`✋ Player ${client.sessionId} grabbed piece ${pieceId}`);
      } else if (piece && piece.grabbedBy) {
        console.log(`⚠️  Piece ${pieceId} already grabbed by ${piece.grabbedBy}`);
        // Send back rejection
        client.send('grab_rejected', { pieceId, grabbedBy: piece.grabbedBy });
      }
    });

    // Handle piece release
    this.onMessage('release', (client, message) => {
      const { pieceId } = message;
      const piece = this.state.pieces.get(pieceId);
      
      if (piece && piece.grabbedBy === client.sessionId) {
        piece.grabbedBy = null;
        console.log(`🤲 Player ${client.sessionId} released piece ${pieceId}`);
      }
    });

    // Handle piece connection
    this.onMessage('connect', (client, message) => {
      const { pieceIds } = message;
      const player = this.state.players.get(client.sessionId);
      
      if (player) {
        player.score += 10; // Award points for connection
        console.log(`🔗 Player ${client.sessionId} connected pieces: ${pieceIds.join(', ')}`);
        console.log(`   Score: ${player.score}`);
      }
    });

    // Handle start game
    this.onMessage('start', (client, message) => {
      if (!this.state.gameStarted) {
        this.state.gameStarted = true;
        console.log('🎯 Game started!');
        
        // Create some demo pieces (in real app, client would send puzzle config)
        for (let i = 0; i < 5; i++) {
          const piece = new Piece(
            `piece-${i}`,
            Math.random() * 500,
            Math.random() * 500,
            0
          );
          this.state.pieces.set(piece.id, piece);
        }
        
        this.broadcast('game_started', { pieceCount: 5 });
      }
    });
  }

  onJoin(client, options) {
    console.log(`✅ Player ${client.sessionId} joined from ${options.name || 'Anonymous'}`);
    
    const player = new Player(
      client.sessionId,
      options.name || `Player ${this.clients.length}`
    );
    
    this.state.players.set(client.sessionId, player);
    console.log(`👥 Total players: ${this.state.players.size}`);
  }

  onLeave(client, consented) {
    console.log(`❌ Player ${client.sessionId} left`);
    
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = false;
      
      // Release any pieces this player was holding
      this.state.pieces.forEach((piece) => {
        if (piece.grabbedBy === client.sessionId) {
          piece.grabbedBy = null;
          console.log(`   Released piece ${piece.id}`);
        }
      });
    }
    
    // Optional: remove player after some time
    this.clock.setTimeout(() => {
      this.state.players.delete(client.sessionId);
    }, 10000); // 10 seconds grace period for reconnection
    
    console.log(`👥 Total players: ${this.state.players.size}`);
  }

  onDispose() {
    console.log('🛑 PuzzleRoom disposed');
  }
}
