# Persistence Refactoring - Implementation Guide

## Completed Changes

### 1. New Custom Events (js/constants/custom-events.js)
- ✅ `PERSISTENCE_SAVE` - Core requests persistence to save
- ✅ `PERSISTENCE_RESTORE` - Core requests persistence to restore
- ✅ `PERSISTENCE_CAN_RESUME` - Persistence signals state is available (with savedState in detail)
- ✅ `PERSISTENCE_CANNOT_RESUME` - Persistence signals no saved state available
- ✅ `PIECES_CONNECTED` - Emitted when pieces connect/merge

### 2. Extended State Object (js/game-engine.js)
```javascript
state.viewport = {
  offsetX: 0,
  offsetY: 0,
  scale: 1.0,
}

state.image = {
  data: null,      // HTMLImageElement
  source: null,    // URL or "file"
  id: null,        // unique identifier
  license: null,   // attribution string
}

state.puzzleSettings = {
  sliderValue: 3,
  removeColor: false,
}
```

### 3. Clean Event-Driven Persistence (js/persistence/persistence.js)
- ✅ Listens for: PERSISTENCE_SAVE, PERSISTENCE_RESTORE, PIECES_CONNECTED, DRAG_END
- ✅ Emits: PERSISTENCE_CAN_RESUME, PERSISTENCE_CANNOT_RESUME
- ✅ Uses state object directly (no callbacks)
- ✅ Auto-saves on piece connections and drag end
- ✅ Serializes/deserializes viewport, image, and puzzle settings from state

### 4. Group Manager Emits Connection Events (js/logic/group-manager.js)
- ✅ Emits PIECES_CONNECTED when pieces are merged

## Remaining Work

### Update app.js

1. **Remove callback-based persistence initialization**
   - Remove the large `initPersistence({ ... })` callback object
   - Simply call `initPersistence()` with no arguments

2. **Update state objects instead of using local closures**
   - When setting current image: also update `state.image.data`
   - When setting image source: also update `state.image.source`
   - When setting image ID: also update `state.image.id`
   - When setting image license: also update `state.image.license`

3. **Remove direct function calls**
   - Remove: `requestAutoSave()` after DRAG_END (persistence already listens)
   - Replace: `tryOfferResume()` with `document.dispatchEvent(new CustomEvent(PERSISTENCE_RESTORE))`
   - Replace: `clearSavedGame()` with importing and calling directly (or create event)

4. **Listen for persistence events**
   ```javascript
   // Listen for can-resume event
   registerGlobalEvent(PERSISTENCE_CAN_RESUME, (event) => {
     const { savedState } = event.detail;
     showResumeModal({
       onResume: () => loadGame(),
       onDiscard: () => {
         clearSavedGame();
         // Show picture gallery
       },
       onCancel: () => {},
       hasResume: true,
     });
   });

   // Listen for cannot-resume event
   registerGlobalEvent(PERSISTENCE_CANNOT_RESUME, () => {
     // No saved game - show picture gallery or file picker directly
     showPictureGallery((deepLinkUrl) => {
       window.location.href = deepLinkUrl;
     });
   });
   ```

5. **Update viewport state synchronization**
   - After viewport pan/zoom, update state.viewport.offsetX, offsetY, scale
   - This is needed in ui/display.js or wherever viewport is modified

### Update control-bar.js

1. **Update state when slider changes**
   ```javascript
   state.puzzleSettings.sliderValue = newValue;
   ```

2. **Update state when grayscale changes**
   ```javascript
   state.puzzleSettings.removeColor = newValue;
   ```

3. **Sync state.image when image is set**
   - Whenever setCurrentImage() is called, also set state.image.data
   - Whenever setCurrentImageSource() is called, also set state.image.source
   - Whenever setCurrentImageId() is called, also set state.image.id
   - Whenever setCurrentImageLicense() is called, also set state.image.license

4. **Remove setPersistence() callback registration**
   - This is no longer needed with event-driven architecture

### Update ui/display.js

1. **Sync viewport state after pan/zoom operations**
   ```javascript
   function updateViewportTransform(offsetX, offsetY, scale) {
     // ... existing code ...
     
     // Update state
     state.viewport.offsetX = offsetX;
     state.viewport.offsetY = offsetY;
     state.viewport.scale = scale;
   }
   ```

2. **Update getViewportState() to use state directly**
   ```javascript
   export function getViewportState() {
     return {
       offsetX: state.viewport.offsetX,
       offsetY: state.viewport.offsetY,
       scale: state.viewport.scale,
     };
   }
   ```

3. **Update applyViewportState() to update state**
   ```javascript
   export function applyViewportState(viewportState) {
     state.viewport.offsetX = viewportState.offsetX;
     state.viewport.offsetY = viewportState.offsetY;
     state.viewport.scale = viewportState.scale;
     // ... apply to DOM ...
   }
   ```

## Benefits of This Architecture

1. **Decoupling**: Core and persistence communicate only through events
2. **No Callbacks**: No complex callback injection required
3. **Single Source of Truth**: All persistent data lives in `state` object
4. **Automatic Save**: Persistence listens for connection/drag events automatically
5. **Testability**: Each module can be tested independently
6. **Clarity**: Event names make data flow explicit

## Migration Strategy

1. Update app.js to use events (can be done incrementally)
2. Update control-bar.js to sync state objects
3. Update ui/display.js to sync viewport state
4. Test save/load functionality
5. Remove old persistence.old.js backup once verified

## Testing Checklist

- [ ] Create new puzzle and verify auto-save
- [ ] Refresh page and verify resume prompt appears
- [ ] Resume game and verify all pieces, positions, and zoom restored
- [ ] Verify slider value restored correctly
- [ ] Verify grayscale filter restored correctly
- [ ] Verify image license displayed correctly
- [ ] Connect pieces and verify auto-save triggered
- [ ] Drag pieces and verify auto-save triggered
- [ ] Deep link mode should bypass resume
- [ ] IndexedDB images should load correctly
- [ ] Remote URL images should load correctly
- [ ] File upload images should show "cannot reload" message
