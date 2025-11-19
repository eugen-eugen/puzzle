# Development Plan

## Phase 0 – Finalize Outstanding Requirements
- Collect decisions on zoom/pan, piece box arrangement (grid vs scatter), max image dimensions/file size, browser support scope (e.g. last 2 Chrome/Firefox/Safari + Edge), art style (minimalist vs playful), progress indicator (percent, pieces placed, completed groups).
- Lock these into specification before coding critical subsystems.

## Phase 1 – Project Scaffolding (Revised Single-Window)
- Create base HTML file: `index.html` (unified play area)
- Remove legacy `game-table.html` and any multi-window artifacts
- Initialize JS modules:
  - `app.js` (bootstrap + state init)
  - `imageProcessor.js`, `jigsawGenerator.js`, `pieceRenderer.js`, `connectionManager.js` (planned), `gameEngine.js`
- No cross-window drag module; single DOM hierarchy simplifies events
- Offline-friendly: pure ES modules, optional bundling deferred

## Phase 2 – Image Upload & Validation
- Implement file input + drag-and-drop for local images.
- Validate type (JPEG/PNG), dimensions, file size cap.
- Normalize image: scale down if exceeding max dimension (maintain aspect ratio).
- Store original resolution metadata.

## Phase 3 – Jigsaw Piece Generation Algorithm
### Goals
Generate 50–1000 interlocking pieces with knobs/blanks pattern maintaining image continuity.

### Steps
1. Determine rows/cols from requested piece count (choose grid closest to target count; allow slight deviation if necessary for aspect ratio).
2. Compute base cell size (width/height per piece). Maintain floating precision, later snap to integer for canvas drawing.
3. For each interior edge, randomly assign knob or blank (ensure adjacent cell inverse).
4. Corner pieces: mark two flat edges; edge pieces: one flat edge.
5. Build vector path for each piece:
   - Use cubic Bézier curves for knobs (parameters: knob radius r ≈ 0.25 * min(cellW, cellH), stem width ≈ 0.5 * knob diameter).
   - Path caching: reuse horizontal/vertical edge shapes where possible.
6. Generate clipping mask to extract image portion per piece.
7. Produce data objects and serialize minimal geometry (e.g. arrays of points + knob descriptors) rather than full path strings.

### Data Validation
- Ensure adjacency compatibility matrix accessible for connection detection.

## Phase 4 – Rendering Engine
- Offscreen canvas for per-piece bitmap (already implemented)
- Single container layout (no second world canvas)
- Draw cycle: DOM positioning + optional lightweight canvas effects (future glow overlay)
- Spatial indexing (implemented) for proximity & future connection logic

## Phase 5 – (Removed) Multi-Window Communication & Drag
Eliminated. All interactivity resides in one window; no synchronization layer required.

## Phase 6 – Interaction Layer (Piece Manipulation)
- Drag start: pick top-most piece/group under pointer
- Rotation controls: keyboard (R / Shift+R) and double-click; extended shortcuts (Q/E, Alt+Wheel) optional
- Context menu detach (planned)
- Selection outline (implemented basic)

## Phase 7 – Connection Detection & Confirmation (Pending)
- On piece/group move end, check candidate neighbors using spatial index (bounding box proximity first, then edge compatibility test).
- Compute distance between corresponding knob center and blank center; if within thresholds categorize into Far/Near/Ready.
- Display visual effects (glow, dashed edges) for Ready set.
- Click to confirm merges: unify group data structure (disjoint-set / union-find).
- Recalculate group bounding box and anchor position.

## Phase 8 – Group Management (Pending)
- Maintain union-find for connectivity plus explicit group objects containing piece IDs, transform (x,y), collective rotation offsets.
- When moving a group, each piece render offset is original local offset rotated + group translation.
- Detach logic: remove piece from group, possibly split group (if removal breaks connectivity). Perform graph traversal to reassign subgroups.

## Phase 9 – Performance Optimization
- Lazy rendering: Only re-render changed pieces/groups.
- Batch draw operations (sort by z-order, minimize state changes).
- Offscreen caching of glow/edge highlight variants.
- Avoid per-frame proximity checks; run after drag end or at throttled intervals (e.g. 60ms) during drag.
- Memory: release any large intermediate canvases after piece generation.

## Phase 10 – Completion Detection & UX Polish
- Verify all pieces belong to single group and group transform aligns with solved origin grid (allow tolerance).
- Show completion modal with stats (time elapsed, rotation corrections, number of manual connections).
- Offer export: composite final image (reconstructed) saved via `canvas.toDataURL()`.

## Architecture Overview
### Core Modules (Updated)
- `jigsawGenerator`: Waypoint-based piece geometry generation + bitmap clipping
- `pieceRenderer`: DOM canvas rendering, drag, rotation
- `connectionManager`: (Upcoming) proximity and edge compatibility evaluation
- `gameEngine`: Central state (pieces, groups, progress)

### State Model (Sketch)
```js
state = {
  pieces: Map<pieceId, Piece>,
  groups: Map<groupId, {id, pieceIds: Set, position: {x,y}, rotation: deg, bbox}>,
  unionFind: UnionFindStructure, // for fast connectivity queries
  activeDrag: { type: 'piece'|'group', id, offsetX, offsetY } | null,
  hoverCandidates: Set<pieceId>,
  connectionSuggestions: [ {pieceA, pieceB, score, distance} ],
  settings: { snapNearPx: 50, snapReadyPx: 25 }
};
```

## Algorithms
### 1. Piece Shape Generation
- Grid cell sizing -> edge pattern assignment -> path synthesis -> clipping.
### 2. Proximity Filtering
- Quadtree returns potential neighbors; fine test on knob-center distance & rotational alignment.
### 3. Union-Find Merging
- `find(p)` and `union(a,b)` manage connectivity; rebuild group objects only when necessary.
### 4. Group Split (Detachment)
- BFS on piece adjacency excluding removed piece to identify connected components; create new groups.

## Risk & Mitigation
| Risk | Impact | Mitigation |
|------|--------|------------|
| 1000 pieces performance | High | Offscreen caching, quadtree spatial index, throttle checks |
| Cross-window drag complexity | Eliminated | Architecture simplified to single window |
| Complex jigsaw path math | Medium | Start with deterministic knob shapes; add variety later |
| Rotation alignment issues | Low | Limit to 90° increments for MVP |
| Safari/Firefox compatibility | Medium | Early test; feature-detect BroadcastChannel |

## Acceptance Criteria (MVP)
- User can load an image and select piece count.
- Pieces generate with correct edge/corner/side flatness and randomized knob/blank distribution.
- Single window contains all pieces; drag & rotate functions operate smoothly.
- Pieces/groups can be rotated and dragged smoothly with < 16ms render frame average (target 60fps) on 1000-piece puzzle initial scatter.
- Connection suggestions appear with color-coded states; click merges pieces.
- Connected pieces move together; detachment possible via context menu.
- Completion recognized when single merged group matches original layout (within tolerance).

## Test Plan (Incremental)
### Unit Tests (Later if test harness added)
- Piece generation: correct counts, edge classification.
- Adjacency mapping: knob/blank inversion correctness.
- Union-find: merging and splitting integrity.

### Manual Functional Tests
1. Load small (50-piece) puzzle: verify shapes, drag, connect.
2. Increase to 500 pieces: observe performance, connection detection reliability.
3. Rotation interactions: ensure piece edges still connect when rotated.
4. Detach piece from mid-size group; verify subgroup split.
5. Completion scenario: manually assemble a small puzzle; verify end state modal.

## Open Questions To Resolve Before Coding Certain Parts
- Zoom/Pan approach: wheel zoom + click-drag pan vs dedicated controls?
- Piece box arrangement final decision (grid aiding search vs scatter for realism)?
- Max image dimension (e.g. cap width/height at 4096px?).
- Supported browsers list (define polyfill boundaries).
- Art style direction (informs color palette & UI chrome).
- Progress indicator style (percentage vs piece counter vs group count).

## Suggested Defaults (If Not Specified Soon)
- Enable zoom + pan (wheel zoom centered on cursor, right-click drag for pan).
- Scatter layout in piece box for natural feel; optional toggle to grid.
- Image max dimension: scale longest side down to 3000px.
- Browser: Latest Chrome, Firefox, Safari, Edge (no IE).
- Art style: Minimalist neutral dark theme with subtle accent colors for states.
- Progress: Percentage = connectedPieces / totalPieces * 100.

---
Once outstanding decisions are confirmed, proceed sequentially Phase 1 → Phase 10, validating performance at Phase 7 before moving to advanced polish.
