export function createPuzzleSession(options = {}) {
  return {
    config: {
      imageUrl: options.imageUrl || null,
      pieceCount: options.pieceCount || 20,
      noRotate: options.noRotate || false,
      removeColor: options.removeColor || false,
      license: options.license || null,
    },
    pieces: {},
    fullState: null,
  };
}

export function applyMove(session, pieces) {
  if (!Array.isArray(pieces)) return;

  for (const piece of pieces) {
    if (piece.id == null) continue;
    session.pieces[piece.id] = {
      x: piece.x,
      y: piece.y,
      rotation: piece.rotation ?? 0,
      groupId: piece.groupId ?? null,
      zIndex: piece.zIndex ?? 0,
    };
  }
}

export function applyFullState(session, pieces) {
  if (!Array.isArray(pieces)) return;

  session.fullState = pieces;
  for (const piece of pieces) {
    if (piece.id == null) continue;
    const position = piece.position || {};
    session.pieces[piece.id] = {
      x: position.x ?? piece.displayX ?? 0,
      y: position.y ?? piece.displayY ?? 0,
      rotation: piece.rotation ?? 0,
      groupId: piece.groupId ?? null,
      zIndex: piece.zIndex ?? 0,
    };
  }
}

export function applyConfig(session, data = {}) {
  if (data.imageUrl !== undefined) session.config.imageUrl = data.imageUrl;
  if (data.pieceCount !== undefined)
    session.config.pieceCount = data.pieceCount;
  if (data.noRotate !== undefined) session.config.noRotate = data.noRotate;
  if (data.removeColor !== undefined)
    session.config.removeColor = data.removeColor;
  if (data.license !== undefined) session.config.license = data.license;
}

export function createInitState(session, roomId, playerCount) {
  return {
    config: session.config,
    pieces: session.fullState,
    piecePositions: session.pieces,
    roomId,
    playerCount,
  };
}

export function countPlayers(clients) {
  if (!clients) return 0;
  if (typeof clients.size === "number") return clients.size;
  if (typeof clients.length === "number") return clients.length;
  return 0;
}
