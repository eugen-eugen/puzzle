# Complete State Structure Documentation

This document describes the complete structure of the `state` object in the puzzle game application.

## Main State Object

The `state` object is defined in [`js/game-engine.js`](js/game-engine.js) and serves as the central data store for the entire application.

**Note:** The state uses a **flat structure** (no nested objects) for simplicity and ease of access.

```javascript
const state = {
  // Array of Piece objects representing all puzzle pieces
  pieces: [],
  
  // Total count of pieces in the puzzle
  totalPieces: 0,
  
  // Array of group objects (legacy - actual groups managed by GroupManager)
  groups: [],
  
  // Snap settings - proximity thresholds
  snapNearPx: 50,   // Proximity threshold for near-snap visualization
  snapReadyPx: 25,  // Tighter threshold for actual snap readiness
  
  // Flag indicating if rotation is disabled for all pieces
  noRotate: false,
  
  // Deep link parameters from URL (set by parseDeepLinkParams() in url-util.js)
  deepLinkImageUrl: null,     // URL of the image to load
  deepLinkPieceCount: null,   // Number of pieces in puzzle
  deepLinkNoRotate: "n",      // String version of rotation disabled flag ("y" | "n")
  deepLinkRemoveColor: "n",   // Grayscale filter enabled flag ("y" | "n")
  deepLinkLicense: null,      // License text to overlay on image
}
```

## Field Descriptions

### `state.pieces`
- **Type**: `Array<Piece>`
- **Description**: Array of all puzzle piece objects in the current game
- **Set by**: 
  - `generatePuzzle()` in app.js
  - `handleImageUpload()` in control-bar.js
  - Restored from persistence
- **Used by**: Almost all game logic modules (rendering, interaction, grouping, etc.)

### `state.totalPieces`
- **Type**: `number`
- **Description**: Total count of pieces in the current puzzle
- **Set by**: Same locations that set `state.pieces`
- **Used by**: Progress tracking, UI displays, utility functions

### `state.groups`
- **Type**: `Array`
- **Description**: Legacy array, actual group management is now handled by GroupManager class
- **Current usage**: Minimal - kept for backwards compatibility

### `state.snapNearPx`
- **Type**: `number`
- **Default**: `50`
- **Description**: Distance threshold (in pixels) for "near snap" visual feedback
- **Set by**: Initialized in game-engine.js
- **Used by**: Connection detection logic

### `state.snapReadyPx`
- **Type**: `number`
- **Default**: `25`
- **Description**: Distance threshold (in pixels) for actual snap connection
- **Set by**: Initialized in game-engine.js
- **Used by**: Connection detection logic

### `state.noRotate`
- **Type**: `boolean`
- **Description**: When `true`, piece rotation is disabled throughout the game
- **Set by**: 
  - `parseDeepLinkParams()` in url-util.js (from URL parameter)
  - `generatePuzzle()` in control-bar.js
- **Used by**: 
  - Rotation handlers in hl-interaction-handler.js
  - UI display logic in display.js
  - Control bar UI in control-bar.js

### Deep Link Fields

The following fields store URL parameters when the app is loaded with deep link parameters:

#### `state.deepLinkImageUrl`
- **Type**: `string | null`
- **Description**: URL of the image to load for the puzzle
- **Example**: `"https://example.com/image.jpg"` or `"pictures/myimage.png"`
- **Set by**: `parseDeepLinkParams()` in url-util.js
- **Used by**: App initialization in app.js

#### `state.deepLinkPieceCount`
- **Type**: `number | null`
- **Description**: Number of pieces the puzzle should be divided into
- **Example**: `20`, `100`, `500`
- **Set by**: `parseDeepLinkParams()` in url-util.js
- **Used by**: App initialization in app.js

#### `state.deepLinkNoRotate`
- **Type**: `"y" | "n"`
- **Description**: String representation of rotation disabled flag (differs from `state.noRotate` which is boolean)
- **Values**: 
  - `"y"` - Rotation disabled
  - `"n"` - Rotation enabled (default)
- **Set by**: `parseDeepLinkParams()` in url-util.js
- **Used by**: App initialization in app.js

#### `state.deepLinkRemoveColor`
- **Type**: `"y" | "n"`
- **Description**: Whether to apply grayscale filter to the puzzle
- **Values**: 
  - `"y"` - Apply grayscale filter
  - `"n"` - Show original colors (default)
- **Set by**: `parseDeepLinkParams()` in url-util.js
- **Used by**: 
  - `applyViewportGrayscaleFilter()` in display.js
  - `applyLicenseIfPresent()` in image-util.js

#### `state.deepLinkLicense`
- **Type**: `string | null`
- **Description**: License text to overlay on the puzzle image
- **Example**: `"CC BY-SA 4.0 - Artist Name"`
- **Set by**: `parseDeepLinkParams()` in url-util.js
- **Used by**: 
  - `applyLicenseIfPresent()` in image-util.js
  - Image processing and display

## Piece Object Structure

Each item in `state.pieces` is an instance of the `Piece` class from [`js/model/piece.js`](js/model/piece.js):

```javascript
class Piece {
  // Core identity
  id: string                // Unique piece identifier (e.g., "0", "1", "2")
  gridPos: Point           // Grid position (x, y) in the puzzle grid
  _groupId: string | null  // Current group ID (managed by GroupManager)
  
  // Physical dimensions
  imgRect: Rectangle       // Rectangle with position and size in source image
                          // (imgX, imgY, width, height)
  
  // Visual representation
  bitmap: HTMLCanvasElement  // Rendered piece bitmap
  paths: {                   // Separate Path2D for each edge direction
    north: Path2D,           // Top edge path (nw -> ne)
    east: Path2D,            // Right edge path (ne -> se)
    south: Path2D,           // Bottom edge path (se -> sw)
    west: Path2D             // Left edge path (sw -> nw)
  }
  scale: number              // Display scale (default: 1.0)
  
  // Position and orientation
  // Position managed by GameTableController
  rotation: number           // Rotation in degrees (0-360)
  zIndex: number | null      // Z-index for layering
  
  // Geometry
  corners: {                 // Corner points (relative to piece origin)
    nw: Point,               // Northwest
    ne: Point,               // Northeast
    se: Point,               // Southeast
    sw: Point                // Southwest
  }
  sPoints: {                 // Side edge points (for connections)
    north: Point[],          // Array of 5 points for north edge
    east: Point[],           // Array of 5 points for east edge
    south: Point[],          // Array of 5 points for south edge
    west: Point[]            // Array of 5 points for west edge
  }

**Note on Multi-Path Architecture:**
The piece maintains 4 separate Path2D objects (one per edge direction) to enable 
selective rendering. This allows the system to draw only edges that don't connect 
to other pieces, providing visual feedback for disconnected edges. Each path is 
independent and runs from one corner through the side points to the next corner.
  
  // Getters/Methods
  get worldData()            // World-space transformed geometry
  get nw()                   // Current position (delegates to GameTableController)
  set nw(point)              // Set position (delegates to GameTableController)
  get groupId()              // Current group ID
  set groupId(value)         // Set group ID (managed by GroupManager)
}
```

## Related State (Not in main state object)

### Viewport State
Managed separately by the display module but can be retrieved via `getViewportState()`:

```javascript
{
  zoomLevel: number,   // Current zoom level (1.0 = 100%)
  panX: number,        // Pan offset X
  panY: number         // Pan offset Y
}
```

### GameTableController State
Internal position management (not directly accessible):
- Piece positions stored in spatial index
- Cached world-space geometry data

### GroupManager State
Group relationships managed internally:
- Groups map (groupId → Group objects)
- Piece-to-group mappings

### Persistence Data
Saved to localStorage as `"puzzle.save.v2"`:
```javascript
{
  version: 2,
  pieces: Array<SerializedPiece>,
  ui: {
    zoomLevel: number,
    panX: number,
    panY: number,
    sliderValue: number
  },
  imageSource: string | null,
  imageLicense: string | null,
  rows: number,
  cols: number,
  noRotate: boolean,
  removeColor: "y" | "n"
}
```

## State Initialization Flow

1. **App startup** ([`app.js`](js/app.js)):
   - State initialized with empty pieces array and default values
   - `parseDeepLinkParams()` checks URL and sets deep link fields (`state.deepLinkImageUrl`, etc.)
   - If deep link present, puzzle generated automatically
   - If no deep link, picture gallery shown

2. **Puzzle generation** ([`control-bar.js`](js/components/control-bar.js)):
   - Pieces generated via `generatePuzzle()`
   - `state.pieces` populated with Piece objects
   - `state.totalPieces` set to piece count
   - `state.noRotate` set based on user selection or deep link

3. **Piece positioning** ([`game-table-controller.js`](js/logic/game-table-controller.js)):
   - Positions registered in spatial index
   - World-space geometry cached

4. **Group initialization** ([`group-manager.js`](js/group-manager.js)):
   - Groups created (one per piece initially)
   - Group relationships established as connections made

## State Access Patterns

### Read Access
- Direct property access: `state.pieces`, `state.noRotate`, `state.deepLinkImageUrl`, etc.
- Null checks for nullable fields: `state.deepLinkImageUrl !== null`
- Piece lookup: `state.pieces.find(p => p.id === id)`

### Write Access
- Direct assignment: `state.pieces = []`, `state.noRotate = true`
- Deep link fields: Usually set once by `parseDeepLinkParams()`
- Pieces array: Usually replaced entirely, not mutated

### Best Practices
1. **Avoid direct mutation** of the pieces array during iteration
2. **Check for null** before using deep link fields (e.g., `state.deepLinkImageUrl`)
3. **Prefer boolean** `state.noRotate` over string `state.deepLinkNoRotate` for logic
4. **Use GameTableController** for piece position management, not direct piece property access
5. **Use flat access** - no nested object navigation needed

## Module Dependencies

### Modules that READ state:
- [`app.js`](js/app.js) - Main app logic
- [`control-bar.js`](js/components/control-bar.js) - UI controls
- [`piece-renderer.js`](js/piece-renderer.js) - Rendering
- [`game-table-controller.js`](js/logic/game-table-controller.js) - Position management
- [`hl-interaction-handler.js`](js/interaction/hl-interaction-handler.js) - User interaction
- [`display.js`](js/ui/display.js) - Viewport and display
- [`ui-interaction-manager.js`](js/ui/ui-interaction-manager.js) - UI event handling
- [`image-util.js`](js/utils/image-util.js) - Image processing
- [`numeric-util.js`](js/utils/numeric-util.js) - Utility functions
- [`group-manager.js`](js/group-manager.js) - Group management

### Modules that WRITE state:
- [`app.js`](js/app.js) - During puzzle generation
- [`control-bar.js`](js/components/control-bar.js) - During puzzle generation and reset
- [`url-util.js`](js/utils/url-util.js) - Sets deep link fields from URL

### State Export
The state object is exported from [`game-engine.js`](js/game-engine.js) and imported where needed:
```javascript
import { state } from './game-engine.js';
```

## Future Considerations

### Potential Improvements
1. **Immutable state updates** - Use immutable patterns for safer state changes
2. **State management library** - Consider Redux/Zustand for complex state
3. **Type definitions** - Add TypeScript/JSDoc for better type safety
4. **Reactive state** - Use observers/subscriptions for automatic UI updates
5. **State validation** - Add runtime validation for state mutations
6. **Separate viewport state** - Move viewport state into main state object
7. **Consolidate noRotate** - Use only one format (boolean vs string) throughout

### Completed Improvements
✅ **Flat state structure** - State is now completely flat with no nested objects (completed 2025-12-22)
