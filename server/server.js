import colyseuspkg from 'colyseus';
const { Server } = colyseuspkg;
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { PuzzleRoom } from './rooms/PuzzleRoom.js';

const PORT = process.env.PORT || 2567;
const app = express();

// Enable CORS for client connections
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Create HTTP server
const httpServer = createServer(app);

// Create Colyseus server
const gameServer = new Server({
  server: httpServer,
});

// Register room handlers
gameServer.define('puzzle', PuzzleRoom);

console.log('🎮 Puzzle Game Server (Colyseus)');
console.log('================================');

gameServer.listen(PORT);
console.log(`✅ Server listening on http://localhost:${PORT}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
console.log(`🏥 Health check: http://localhost:${PORT}/health`);
console.log('');
console.log('Available rooms:');
console.log('  - puzzle (multiplayer puzzle game)');
console.log('');
console.log('Waiting for connections...\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  gameServer.gracefullyShutdown(true).then(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

