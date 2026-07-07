import { Schema, type, MapSchema } from '@colyseus/schema';

// Represents a piece position and state
export class Piece extends Schema {
  constructor(id, x, y, rotation = 0) {
    super();
    this.id = id;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.grabbedBy = null;
  }
}

type('string')(Piece.prototype, 'id');
type('number')(Piece.prototype, 'x');
type('number')(Piece.prototype, 'y');
type('number')(Piece.prototype, 'rotation');
type('string')(Piece.prototype, 'grabbedBy'); // playerId who grabbed it, null if not grabbed

// Represents a player
export class Player extends Schema {
  constructor(id, name) {
    super();
    this.id = id;
    this.name = name;
    this.score = 0;
    this.connected = true;
  }
}

type('string')(Player.prototype, 'id');
type('string')(Player.prototype, 'name');
type('number')(Player.prototype, 'score');
type('boolean')(Player.prototype, 'connected');

// Main game state
export class PuzzleState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.pieces = new MapSchema();
    this.gameStarted = false;
  }
}

type({ map: Player })(PuzzleState.prototype, 'players');
type({ map: Piece })(PuzzleState.prototype, 'pieces');
type('boolean')(PuzzleState.prototype, 'gameStarted');
