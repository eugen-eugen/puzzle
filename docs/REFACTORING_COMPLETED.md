# Persistence Refactoring - Completed Changes

## Summary

Successfully refactored the entire persistence architecture from callback-based to event-driven. All data persistence now flows through the `state` object and custom events.

## Files Modified

### 1. `/js/app.js` ✅

**Removed:**
- `requestAutoSave` and `tryOfferResume` from imports
- `setPersistence` from control-bar imports
- Direct `requestAutoSave()` call after DRAG_END (persistence handles automatically)
- Large callback object passed to `initPersistence()`

**Added:**
- `loadGame` import
- `PERSISTENCE_RESTORE`, `PERSISTENCE_CAN_RESUME`, `PERSISTENCE_CANNOT_RESUME` event constants
- Event listener for `PERSISTENCE_CAN_RESUME` - shows resume modal when save exists
- Event listener for `PERSISTENCE_CANNOT_RESUME` - shows picture gallery when no save exists

**Changed:**
- `initPersistence()` now called with no arguments (event-driven)
- `tryOfferResume()` replaced with `document.dispatchEvent(new CustomEvent(PERSISTENCE_RESTORE))`
- All persistence interaction now happens via events

### 2. `/js/components/control-bar.js` ✅

**Updated Functions:**
- `setCurrentImage()` - now updates `state.image.data`
- `setCurrentImageSource()` - now updates `state.image.source`
- `setCurrentImageId()` - now updates `state.image.id`
- `setCurrentImageLicense()` - now updates `state.image.license`
- `setSliderValue()` - now updates `state.puzzleSettings.sliderValue`

**Removed:**
- `setPersistence()` function (no longer needed)
- `setPersistence` from exports

### 3. `/js/ui/display.js` ✅

**Updated Functions:**

- `getViewportState()` - now reads from `state.viewport` object
  ```javascript
  return {
    offsetX: state.viewport.offsetX,
    offsetY: state.viewport.offsetY,
    scale: state.viewport.scale,
  };
  ```

- `applyViewportState()` - now updates both local variables and `state.viewport`
  - Supports both new format (offsetX, offsetY, scale) and old format (panX, panY, zoomLevel)

- `applyViewportGrayscaleFilter()` - now uses `state.puzzleSettings.removeColor`
  - Updates state when filter is applied
  - Handles boolean and string ("y"/"n") values

- `setPanOffset()` - now updates `state.viewport.offsetX` and `state.viewport.offsetY`

- `setZoom()` - now updates `state.viewport.scale`
  - Also updates pan offset in state when zooming to a center point

### 4. `/js/persistence/persistence.js` ✅

**Complete rewrite** - see PERSISTENCE_REFACTORING.md for details
- Event-driven architecture
- No callbacks required
- Reads/writes directly from/to `state` object
- Auto-saves on `PIECES_CONNECTED` and `DRAG_END`
- Emits `PERSISTENCE_CAN_RESUME` and `PERSISTENCE_CANNOT_RESUME`

## Architecture Flow

### Save Flow
```
User Action (drag/connect pieces)
  ↓
DRAG_END or PIECES_CONNECTED event
  ↓
Persistence listens → requestAutoSave()
  ↓
Debounced saveNow()
  ↓
Serializes from state object
  ↓
localStorage
```

### Load Flow
```
App startup (or deep link error/timeout)
  ↓
document.dispatchEvent(PERSISTENCE_RESTORE)
  ↓
Persistence checks localStorage
  ↓
If saved game exists:
  PERSISTENCE_CAN_RESUME event (with savedState)
  ↓
  App shows resume modal
  ↓
  User chooses Resume → loadGame()
  ↓
  Deserializes → updates state object → renders
  
If no saved game:
  PERSISTENCE_CANNOT_RESUME event
  ↓
  App shows picture gallery
```

## State Object Structure

All persistent data now lives in `state` (from game-engine.js):

```javascript
state = {
  pieces: [],
  totalPieces: 0,
  noRotate: false,
  
  viewport: {
    offsetX: 0,
    offsetY: 0,
    scale: 1.0,
  },
  
  image: {
    data: null,      // HTMLImageElement
    source: null,    // URL or "file"
    id: null,        // unique identifier
    license: null,   // attribution string
  },
  
  puzzleSettings: {
    sliderValue: 3,
    removeColor: false,
  },
  
  // Deep link params (temporary, not persisted)
  deepLinkImageUrl: null,
  deepLinkPieceCount: null,
  deepLinkNoRotate: "n",
  deepLinkRemoveColor: "n",
  deepLinkLicense: null,
}
```

## Benefits

1. **Decoupling** - Modules communicate only through events, no direct dependencies
2. **Single Source of Truth** - All persistent data in one place (`state` object)
3. **No Callback Hell** - No complex callback injection or management
4. **Automatic Persistence** - Save happens automatically on relevant events
5. **Testability** - Each module can be tested independently
6. **Maintainability** - Clear event names make data flow explicit and traceable

## Testing Checklist

- ✅ No TypeScript/lint errors in modified files
- ⏳ Runtime testing needed:
  - [ ] Create new puzzle and verify auto-save works
  - [ ] Refresh page and verify resume prompt appears
  - [ ] Resume game and verify pieces, zoom, pan restored
  - [ ] Verify slider value persists
  - [ ] Verify grayscale filter persists
  - [ ] Connect pieces and verify auto-save triggered
  - [ ] Drag pieces and verify auto-save triggered
  - [ ] Deep link mode bypasses resume correctly
  - [ ] IndexedDB images load correctly
  - [ ] Remote URL images load correctly

## Files to Review

- Original backup: `/js/persistence/persistence.old.js`
- New implementation: `/js/persistence/persistence.js`

## Next Steps

1. Test the application thoroughly
2. If everything works, delete `persistence.old.js`
3. Update any documentation that references the old callback-based approach
4. Consider adding unit tests for the event-driven persistence
