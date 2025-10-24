# Puzzle (Browser Jigsaw)

> A lightweight, offline‑capable, single–page jigsaw puzzle app that turns any uploaded image into an interactive puzzle with drag, rotate, group merge, detach, zoom & persistent resume.

---
## ✨ Key Features (MVP)
- Local image upload (JPEG / PNG) with automatic downscale (max side 3000px)
- Procedural waypoint‑based jigsaw piece generation (traditional interlocks)
- Up to 1000 pieces (logarithmic slider selection)
- Random scatter + random orientation (0°, 90°, 180°, 270°)
- Grouping through geometric connection detection (corner + side waypoint matching)
- Shift + Drag single‑piece detachment from a group
- Zoom & pan (wheel zoom at cursor, button controls) with transform‑aware logic
- Spatial indexing for fast neighbor queries
- Auto‑save & resume (debounced light-weight persistence)
- Clean resume modal (Resume / Start New / Cancel)
- Progress scoring based on connected group consolidation


---
##  Architecture Overview
| Module | Purpose |
|--------|---------|
| `js/app.js` | UI bootstrap, zoom/pan, progress, resume modal, orchestrates modules |
| `js/jigsawGenerator.js` | Generates pieces via lattice + side waypoints, assigns polarity & geometry |
| `js/pieceRenderer.js` | Renders canvases inside absolutely positioned DIV wrappers and handles drag / rotate |
| `js/connectionManager.js` | Geometric side matching (corner + sPoint waypoint checks) + group merging |
| `js/spatialIndex.js` | Uniform grid spatial index (currently) for coarse candidate lookup |
| `js/gameEngine.js` | Central mutable state container (pieces, totals, snap settings) |
| `js/persistence.js` | Serialize / deserialize puzzle state into `localStorage` (light mode by default) |
| `js/imageProcessor.js` | Image normalization & downscaling pipeline |
| `js/windowManager.js` | Minimal event channel (legacy simplification – single window now) |

> The design favors small focused modules over a monolithic engine to keep iteration fast.

---
##  Piece Generation (Waypoint Model)
Pieces are cut from the source image using:
- A grid approximated to target count with aspect preservation
- Corner lattice `(rows+1) x (cols+1)`
- Internal edge waypoints (one per interior side) displaced perpendicular to the edge
- Polarity (+1 bump / -1 dent / 0 border) balanced to ~50/50 distribution
- Each interior side defined by three local points: `cornerA → sPoint → cornerB`

This avoids Bezier curves (straight segment geometry) while retaining traditional puzzle silhouette.

---
##  Connection Detection Summary
A dragged piece (or group) is tested against nearby candidates:
1. Spatial index fetches coarse candidate IDs
2. For each side pair: ensure both are interior & polarity complementary
3. Compare (in world space, rotation & translation applied):
   - Both corner ↔ corner squared distances within tolerance
   - Side length difference within tolerance
   - Corner→sPoint structural distances (two comparisons) within tolerance
4. Best (lowest aggregate corner distance) candidate highlighted
5. On release: fine translation so matched corner aligns exactly, groups merge

No multi‑tier “near/ready” states—only definitive highlight.

---
##  Progress Scoring
Simplified implementation currently in UI (concept derived from documented formula):
```
score = totalPieces - (numberOfGroups - 1)
percent = score / totalPieces
```
- Starts at 0% with every piece independent
- Reaches 100% when a single group contains all pieces

*(A more advanced Heaviside version is documented in `GAME_SPECIFICATION.md` and can be re‑introduced when fragmentation nuances matter.)*

---
##  Persistence
- Stored under `localStorage` key: `puzzle.save.v1`
- Light mode by default (piece bitmaps regenerated from original image to avoid quota issues)
- Debounced (1200ms) auto‑save on piece movement & progress changes
- Fallback: attempts full (with bitmaps) → retries light if quota exceeded or soft size threshold surpassed (~2.5MB)
- Resume flow uses a custom modal, not intrusive `confirm()` dialogs
- Includes: geometry, groups, displayX/Y, rotation, viewport (zoom/pan), slider setting

### Regeneration Path
On load, each piece canvas is reconstructed by clipping the path region from the master image. Stored structural waypoints make this deterministic.

---
##  Constants & Tunables
Each module now defines named constants (no stray magic numbers):
- Zoom: `MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_STEP_FACTOR`, wheel factors
- Generation: depth factors, waypoint offset range, padding multipliers, rotations
- Connection: `DEFAULT_CONNECTION_DISTANCE_PX`, `COARSE_RADIUS_MULTIPLIER`, fine placement thresholds
- Rendering: `DEFAULT_RENDER_SCALE`, `MIN_RENDERED_DIMENSION`, `OUTSIDE_THRESHOLD_PX`
- Spatial index heuristics: `DEFAULT_CELL_SIZE`, `CELL_SIZE_MULTIPLIER`
- Persistence: debounce, soft size limit, retry counts
- Image processing: `MAX_IMAGE_SIDE`, `JPEG_EXPORT_QUALITY`
- Game engine: `SNAP_NEAR_PX`, `SNAP_READY_PX` (future snapping refinement hooks)

See individual modules for inline documentation.

---
##  Getting Started
### Prerequisites
A modern browser. No build step required.

### Run a Local Dev Server (Recommended for file:// image security policies)
```
# From repo root
npx serve . --cors
# or any static server (e.g. python3 -m http.server)
```
Then open: http://localhost:3000 (or the port shown in terminal).

### Basic Use
1. Open the page
2. Upload an image
3. Adjust piece count slider (log scale) → pieces generate automatically
4. Drag & rotate pieces (double‑click rotates 90°; R / Shift+R also rotate)
5. Pieces auto‑connect when geometry matches
6. Shift+Drag to detach a single piece from a group
7. Reload page → choose Resume to continue

---
## 📥 Install as an App (PWA)
The project is now a Progressive Web App. You can install it for a native‑like, fullscreen experience and offline play.

### Desktop (Chrome / Edge / Chromium)
1. Open the app in the browser.
2. Look for the install icon (a plus-in-a-window) in the address bar OR open the browser menu.
3. Click "Install" / "Install Puzzle Lab".
4. Launch later from your OS application launcher like a native app.

### Android (Chrome)
1. Open the site.
2. After a brief usage or refresh you'll see a bottom snackbar or menu option: "Install app" / "Add to Home screen".
3. Confirm; an icon appears on your home screen.

### iOS / iPadOS (Safari)
1. Tap the Share button.
2. Choose "Add to Home Screen".
3. Launch from the added icon (standalone mode).

### Offline Behavior
The first load caches core assets (HTML, JS modules, CSS) via `service-worker.js`.
Subsequent visits work offline; you can continue a saved puzzle without network.

### Updating
When you deploy changes and bump `SW_VERSION` in `service-worker.js`, the new service worker installs in the background and takes control after all tabs close (standard PWA lifecycle). You can force an update by:
- Closing all tabs of the app and reopening
- Or from DevTools > Application > Service Workers > Skip Waiting

### Custom Icons
`manifest.json` currently embeds placeholder base64 PNG icons (192 & 512). Replace them for production:
1. Export real icons (maskable safe zone) at 192x192 and 512x512 PNG.
2. Save as `icons/icon-192.png` and `icons/icon-512.png`.
3. Update `manifest.json` icons array to point to those files instead of data URIs.
4. (Optional) Add a maskable variation: `{ "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }`.
5. Increment `SW_VERSION` to ensure updated manifest & icons are re-fetched.

### Apple Touch Icon
For best iOS appearance add a real `apple-touch-icon` (180x180). After adding, replace the temporary manifest link-as-icon in `index.html` with:
```html
<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png" />
```

### Manifest Fields Summary
- `display: standalone` gives app-like chrome
- `start_url: ./?source=pwa` lets you distinguish PWA launches (optional analytics)
- `theme_color` and `background_color` influence splash & toolbar color

### Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Install button missing | Served via file:// | Use local static server (see Getting Started) |
| Old code after deploy | SW waiting | Close all tabs or click Skip Waiting in DevTools |
| Icon blurry | low-res placeholder | Provide proper 192 & 512 PNG icons |
| iOS opens in Safari UI | Not added via "Add to Home Screen" | Re-add through share sheet |

---

---
## 🧪 Development Notes
- Pure ES modules, no bundler required
- Keep modules small; avoid circular imports (persistence is lazy‑loaded)
- For performance profiling: add selective logging or wrap spatial queries
- To experiment with tolerances, adjust constants in `connectionManager.js`

### Suggested Debug Enhancements (Not yet included)
- Toggle overlays for world corners & sPoints
- Spatial index cell visualization
- Connection attempt heatmap

---
## Directory Structure (Simplified)
```
puzzle/
  index.html
  README.md
  docs/
    GAME_SPECIFICATION.md
  js/
    app.js
    persistence.js
    jigsawGenerator.js
    pieceRenderer.js
    connectionManager.js
    spatialIndex.js
    gameEngine.js
    imageProcessor.js
    windowManager.js
  css/
    (stylesheets)
```

---
## Roadmap (High‑Value Next Steps)
| Priority | Feature | Notes |
|----------|---------|-------|
| High | Improved progress metric (Heaviside fragmentation penalty) | Bring spec formula fully inline |
| High | Connection animation / easing | Visual polish |
| High | Multiple save slots | `localStorage` namespacing or IndexedDB |
| Medium | Undo / redo | Command stack (piece transform + group ops) |
| Medium | Advanced snapping tolerance scaling with zoom | Adjust connection tolerance with zoomLevel |
| Medium | Mobile touch optimization | Gesture rotation / inertial pan |
| Medium | Seeded piece generation | Deterministic shareable layouts |
| Low | Alternative piece shapes | Square / hex variants |
| Low | Assist tools (ghost overlay / hint) | UI toggles |
| Low | Sound effects | Non-blocking audio sprites |

---
##  Design Principles
- Determinism where helpful (reconstructable geometry, not storing volatile pixel buffers)
- Performance via coarse → fine filtering (spatial index, then geometry match)
- Minimal persistent payload (structural, not per-frame)
- Explicit constants for clarity & tuning

---
##  License
MIT

---
##  Contributions
For now: open issues with concise reproduction steps or enhancement rationale. PR guidelines can be added later.

---
##  Related Docs
- `docs/GAME_SPECIFICATION.md` – Full design & algorithmic detail
- `DEVELOPMENT_PLAN.md` *(add if needed)*

---
##  Questions / Iteration
Feel free to propose: connection heuristics tweaks, UI improvements, performance instrumentation, or migration to a more advanced spatial structure (R-tree) once needed.

---
Happy puzzling! 
