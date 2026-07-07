# Puzzle Game Server (Colyseus)

Multiplayer game server using Colyseus framework. Handles real-time state synchronization, player management, and piece movements for the puzzle game.

## Features

- **Automatic State Synchronization** - Colyseus handles delta-based state updates
- **Room Management** - Automatic matchmaking and room creation
- **Player Tracking** - Player join/leave with scoring system
- **Piece Locking** - Prevents multiple players from grabbing the same piece
- **Reconnection Support** - 10-second grace period for disconnected players
- **Score System** - Players earn points for connecting pieces

## Installation

```bash
npm install
```

## Running the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

**Custom port**:
```bash
PORT=3000 npm start
```

Default port: **2567** (Colyseus standard)

## Server Endpoints

- **WebSocket**: `ws://localhost:2567`
- **Health Check**: `http://localhost:2567/health`

## Room: `puzzle`

### Client Connection

```javascript
import { Client } from 'colyseus.js';

const client = new Client('ws://localhost:2567');
const room = await client.joinOrCreate('puzzle', { name: 'PlayerName' });

console.log('Joined room:', room.id);
```

### State Schema

```javascript
// PuzzleState
{
  players: Map<string, Player>,  // sessionId -> Player
  pieces: Map<string, Piece>,    // pieceId -> Piece
  gameStarted: boolean
}

// Player
{
  id: string,       // session ID
  name: string,     // player name
  score: number,    // current score
  connected: boolean
}

// Piece
{
  id: string,       // piece identifier
  x: number,        // position x
  y: number,        // position y
  rotation: number, // rotation in degrees
  grabbedBy: string // player sessionId or null
}
```

### Client Messages

**Start Game**
```javascript
room.send('start', {});
```

**Grab Piece**
```javascript
room.send('grab', { pieceId: 'piece-1' });
```

**Move Piece**
```javascript
room.send('move', {
  pieceId: 'piece-1',
  x: 150,
  y: 200,
  rotation: 90
});
```

**Release Piece**
```javascript
room.send('release', { pieceId: 'piece-1' });
```

**Connect Pieces** (snap together, awards points)
```javascript
room.send('connect', {
  pieceIds: ['piece-1', 'piece-2']
});
```

### Server Messages

**Grab Rejected** (piece already grabbed by another player)
```javascript
room.onMessage('grab_rejected', (message) => {
  console.log(`Piece ${message.pieceId} grabbed by ${message.grabbedBy}`);
});
```

**Game Started**
```javascript
room.onMessage('game_started', (message) => {
  console.log(`Game started with ${message.pieceCount} pieces`);
});
```

### State Listeners

**Listen to state changes** (automatic synchronization):
```javascript
// Listen to all state changes
room.onStateChange((state) => {
  console.log('State updated:', state);
});

// Listen to player additions
room.state.players.onAdd((player, sessionId) => {
  console.log(`Player joined: ${player.name}`);
});

// Listen to player removals
room.state.players.onRemove((player, sessionId) => {
  console.log(`Player left: ${player.name}`);
});

// Listen to piece changes
room.state.pieces.onChange((piece, pieceId) => {
  console.log(`Piece ${pieceId} moved to (${piece.x}, ${piece.y})`);
});

// Listen to specific player score changes
room.state.players.get('sessionId').listen('score', (value) => {
  console.log('Score changed:', value);
});
```

## Client Integration Example

```javascript
import { Client } from 'colyseus.js';

const client = new Client('ws://localhost:2567');
const room = await client.joinOrCreate('puzzle', { name: 'Alice' });

// Listen for piece updates
room.state.pieces.onChange((piece, pieceId) => {
  // Update piece position in your game UI
  updatePieceDOM(pieceId, piece.x, piece.y, piece.rotation);
});

// Send piece movement
function movePiece(pieceId, x, y, rotation) {
  room.send('move', { pieceId, x, y, rotation });
}

// Grab a piece
function grabPiece(pieceId) {
  room.send('grab', { pieceId });
}

// Handle grab rejection
room.onMessage('grab_rejected', (message) => {
  alert(`Piece already grabbed by another player!`);
});
```

## Development Notes

### State Synchronization

Colyseus automatically synchronizes state changes using **delta encoding**:
- Only changed properties are sent
- Extremely efficient bandwidth usage
- Client receives updates in real-time

### Piece Locking

When a player grabs a piece:
1. Server checks if `piece.grabbedBy === null`
2. If available, sets `piece.grabbedBy = sessionId`
3. If already grabbed, sends `grab_rejected` message
4. On release or disconnect, sets `piece.grabbedBy = null`

### Reconnection

Players who disconnect have a **10-second grace period**:
- Their player record is marked as `connected: false`
- Pieces they held are released
- After 10 seconds, player is removed from state
- Can be extended or modified in `PuzzleRoom.onLeave()`

## Console Output

```
🎮 Puzzle Game Server (Colyseus)
================================
✅ Server listening on http://localhost:2567
📡 WebSocket endpoint: ws://localhost:2567
🏥 Health check: http://localhost:2567/health

Available rooms:
  - puzzle (multiplayer puzzle game)

Waiting for connections...

✅ Player abc123 joined from Alice
👥 Total players: 1
🎯 Game started!
✋ Player abc123 grabbed piece piece-0
📨 Player abc123 moved piece piece-0 to (123, 456), rotation: 0°
🤲 Player abc123 released piece piece-0
🔗 Player abc123 connected pieces: piece-0, piece-1
   Score: 10
```

## Next Steps

1. **Install Colyseus client** in your puzzle game:
   ```bash
   cd client
   npm install colyseus.js
   ```

2. **Create network manager** (`client/js/network-manager.js`)

3. **Integrate with game engine** - send moves, listen to updates

4. **Add visual feedback** - show other players' cursors, locked pieces

## Resources

- [Colyseus Documentation](https://docs.colyseus.io/)
- [Colyseus State Management](https://docs.colyseus.io/state/schema/)
- [Client SDK](https://docs.colyseus.io/client/)
