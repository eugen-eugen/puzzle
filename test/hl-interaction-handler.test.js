// hl-interaction-handler.test.js - Unit tests for high-level interaction handler
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as hlHandler from "../js/interaction/hl-interaction-handler.js";

// Mock dependencies
vi.mock("../js/app.js", () => ({
  fitAllPiecesInView: vi.fn(),
  calculatePiecesBounds: vi.fn(() => ({
    min: { x: 0, y: 0 },
    max: { x: 100, y: 100 },
  })),
}));

vi.mock("../js/group-manager.js", () => ({
  groupManager: {
    getGroup: vi.fn(),
    detachPiece: vi.fn(),
  },
}));

vi.mock("../js/game-table-controller.js", () => ({
  gameTableController: {
    movePiece: vi.fn(),
    moveGroup: vi.fn(),
    rotatePiece: vi.fn(),
    rotateGroup: vi.fn(),
    rotatePieceOrGroup: vi.fn(),
    bringToFront: vi.fn(),
  },
}));

vi.mock("../js/ui/display.js", () => ({
  enforceInitialMargins: vi.fn(),
}));

vi.mock("../js/connection-manager.js", () => ({
  handleDragEnd: vi.fn(),
}));

vi.mock("../js/game-engine.js", () => ({
  state: {
    pieces: [],
    noRotate: false,
  },
}));

import { fitAllPiecesInView, calculatePiecesBounds } from "../js/app.js";
import { groupManager } from "../js/group-manager.js";
import { gameTableController } from "../js/game-table-controller.js";
import { enforceInitialMargins } from "../js/ui/display.js";
import { handleDragEnd } from "../js/connection-manager.js";
import { state } from "../js/game-engine.js";
import { Point } from "../js/geometry/point.js";

describe("hl-interaction-handler", () => {
  let visualListeners;
  let mockPieces;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create visual listeners
    visualListeners = {
      onPieceSelectedVisual: vi.fn(),
      onPieceDeselectedVisual: vi.fn(),
      onPieceDetachedVisual: vi.fn(),
      onEnsurePieceInView: vi.fn(),
    };

    // Create mock pieces
    mockPieces = [
      { id: 1, position: new Point(10, 20), rotation: 0, groupId: null },
      { id: 2, position: new Point(30, 40), rotation: 90, groupId: 1 },
      { id: 3, position: new Point(50, 60), rotation: 180, groupId: 1 },
    ];

    state.pieces = mockPieces;
    state.noRotate = false;

    // Initialize the handler
    hlHandler.initialize(null, visualListeners);

    // Clear any previously selected piece and callback
    hlHandler.onPieceDeselected();
    hlHandler.setSelectionChangeCallback(null);
  });

  describe("initialize", () => {
    it("should initialize with visual listeners", () => {
      const newListeners = { onPieceSelectedVisual: vi.fn() };

      hlHandler.initialize(null, newListeners);

      // Should not throw and should be ready to use
      expect(() => hlHandler.getSelectedPiece()).not.toThrow();
    });
  });
  describe("onPieceSelected", () => {
    it("should select a piece by numeric ID", () => {
      hlHandler.onPieceSelected(1);

      expect(hlHandler.getSelectedPiece()).toEqual(mockPieces[0]);
      expect(gameTableController.bringToFront).toHaveBeenCalledWith(1);
      expect(visualListeners.onPieceSelectedVisual).toHaveBeenCalledWith(
        1,
        null
      );
    });

    it("should select a piece by string ID", () => {
      // Ensure no piece is selected first
      hlHandler.onPieceDeselected();
      visualListeners.onPieceSelectedVisual.mockClear();

      hlHandler.onPieceSelected("2");

      expect(hlHandler.getSelectedPiece()).toEqual(mockPieces[1]);
      expect(gameTableController.bringToFront).toHaveBeenCalledWith(2);
      expect(visualListeners.onPieceSelectedVisual).toHaveBeenCalledWith(
        2,
        null
      );
    });

    it("should deselect previous piece when selecting new one", () => {
      hlHandler.onPieceSelected(1);
      hlHandler.onPieceSelected(2);

      expect(hlHandler.getSelectedPiece()).toEqual(mockPieces[1]);
      expect(visualListeners.onPieceSelectedVisual).toHaveBeenCalledWith(2, 1);
    });

    it("should not select the same piece twice", () => {
      hlHandler.onPieceSelected(1);
      visualListeners.onPieceSelectedVisual.mockClear();

      hlHandler.onPieceSelected(1);

      expect(visualListeners.onPieceSelectedVisual).not.toHaveBeenCalled();
    });

    it("should handle invalid piece ID gracefully", () => {
      // Ensure clean state
      hlHandler.onPieceDeselected();

      hlHandler.onPieceSelected(999);

      // Should remain unselected (null) since piece doesn't exist
      expect(hlHandler.getSelectedPiece()).toBeNull();
    });

    it("should handle NaN ID gracefully", () => {
      // Ensure clean state
      hlHandler.onPieceDeselected();

      hlHandler.onPieceSelected(NaN);

      // Should remain unselected (null) since ID is invalid
      expect(hlHandler.getSelectedPiece()).toBeNull();
    });

    it("should call selection change callback", () => {
      const callback = vi.fn();
      hlHandler.setSelectionChangeCallback(callback);

      hlHandler.onPieceSelected(1);

      expect(callback).toHaveBeenCalledWith(mockPieces[0]);
    });
  });

  describe("onPieceDeselected", () => {
    it("should deselect the currently selected piece", () => {
      hlHandler.onPieceSelected(1);
      hlHandler.onPieceDeselected();

      expect(hlHandler.getSelectedPiece()).toBeNull();
      expect(visualListeners.onPieceDeselectedVisual).toHaveBeenCalledWith(1);
    });

    it("should call selection change callback with null", () => {
      const callback = vi.fn();
      hlHandler.setSelectionChangeCallback(callback);
      hlHandler.onPieceSelected(1);
      callback.mockClear();

      hlHandler.onPieceDeselected();

      expect(callback).toHaveBeenCalledWith(null);
    });

    it("should handle deselecting when no piece is selected", () => {
      hlHandler.onPieceDeselected();

      expect(hlHandler.getSelectedPiece()).toBeNull();
      expect(visualListeners.onPieceDeselectedVisual).not.toHaveBeenCalled();
    });
  });

  describe("onPieceDragged", () => {
    it("should move a piece without a group", () => {
      const delta = new Point(5, 10);
      hlHandler.onPieceDragged(1, delta);

      expect(gameTableController.movePiece).toHaveBeenCalledWith(1, delta);
      expect(gameTableController.moveGroup).not.toHaveBeenCalled();
    });

    it("should move an entire group when piece has groupId", () => {
      const delta = new Point(5, 10);
      hlHandler.onPieceDragged(2, delta);

      expect(gameTableController.moveGroup).toHaveBeenCalledWith(1, delta);
      expect(gameTableController.movePiece).not.toHaveBeenCalled();
    });

    it("should handle dragging non-existent piece gracefully", () => {
      const delta = new Point(5, 10);
      hlHandler.onPieceDragged(999, delta);

      expect(gameTableController.movePiece).not.toHaveBeenCalled();
      expect(gameTableController.moveGroup).not.toHaveBeenCalled();
    });
  });

  describe("onPieceDragEnded", () => {
    it("should handle drag end with piece going outside", () => {
      hlHandler.onPieceDragEnded(1, true);

      expect(handleDragEnd).toHaveBeenCalledWith(mockPieces[0], false);
      expect(enforceInitialMargins).toHaveBeenCalled();
      expect(fitAllPiecesInView).toHaveBeenCalled();
      expect(visualListeners.onEnsurePieceInView).not.toHaveBeenCalled();
    });

    it("should handle drag end with piece staying inside", () => {
      hlHandler.onPieceDragEnded(1, false);

      expect(handleDragEnd).toHaveBeenCalledWith(mockPieces[0], false);
      expect(enforceInitialMargins).toHaveBeenCalled();
      expect(fitAllPiecesInView).not.toHaveBeenCalled();
      expect(visualListeners.onEnsurePieceInView).toHaveBeenCalledWith(1);
    });

    it("should handle non-existent piece gracefully", () => {
      hlHandler.onPieceDragEnded(999, false);

      expect(handleDragEnd).not.toHaveBeenCalled();
    });
  });

  describe("onPieceRotated", () => {
    it("should rotate a piece", () => {
      hlHandler.onPieceRotated(1, 90);

      expect(gameTableController.rotatePieceOrGroup).toHaveBeenCalledWith(
        1,
        90
      );
      expect(visualListeners.onEnsurePieceInView).toHaveBeenCalledWith(1);
    });

    it("should not rotate when noRotate is enabled", () => {
      state.noRotate = true;
      hlHandler.onPieceRotated(1, 90);

      expect(gameTableController.rotatePieceOrGroup).not.toHaveBeenCalled();
    });

    it("should handle non-existent piece gracefully", () => {
      hlHandler.onPieceRotated(999, 90);

      expect(gameTableController.rotatePieceOrGroup).not.toHaveBeenCalled();
    });
  });

  describe("onPieceDetached", () => {
    it("should detach a piece from its group", () => {
      const mockNewGroup = { id: 2, size: () => 1 };
      groupManager.detachPiece.mockReturnValue(mockNewGroup);

      hlHandler.onPieceDetached(2);

      expect(groupManager.detachPiece).toHaveBeenCalledWith(mockPieces[1]);
      expect(gameTableController.bringToFront).toHaveBeenCalledWith(2);
      expect(visualListeners.onPieceDetachedVisual).toHaveBeenCalledWith(2);
    });

    it("should handle failed detachment", () => {
      groupManager.detachPiece.mockReturnValue(null);

      hlHandler.onPieceDetached(2);

      expect(groupManager.detachPiece).toHaveBeenCalledWith(mockPieces[1]);
      expect(gameTableController.bringToFront).not.toHaveBeenCalled();
      expect(visualListeners.onPieceDetachedVisual).not.toHaveBeenCalled();
    });

    it("should handle non-existent piece gracefully", () => {
      hlHandler.onPieceDetached(999);

      expect(groupManager.detachPiece).not.toHaveBeenCalled();
    });
  });

  describe("getSelectedPiece", () => {
    it("should return null when no piece is selected", () => {
      expect(hlHandler.getSelectedPiece()).toBeNull();
    });

    it("should return the selected piece", () => {
      hlHandler.onPieceSelected(1);
      expect(hlHandler.getSelectedPiece()).toEqual(mockPieces[0]);
    });
  });

  describe("fixSelectedPieceOrientation", () => {
    it("should return false when no piece is selected", () => {
      // Ensure no piece is selected
      hlHandler.onPieceDeselected();
      expect(hlHandler.fixSelectedPieceOrientation()).toBe(false);
    });

    it("should return true when piece is already at rotation 0", () => {
      hlHandler.onPieceSelected(1);
      expect(hlHandler.fixSelectedPieceOrientation()).toBe(true);
      expect(gameTableController.rotatePiece).not.toHaveBeenCalled();
    });

    it("should rotate single piece to 0 degrees", () => {
      hlHandler.onPieceSelected(2);
      expect(hlHandler.fixSelectedPieceOrientation()).toBe(true);
      expect(gameTableController.rotatePiece).toHaveBeenCalledWith(2, -90);
    });

    it("should rotate entire group when piece is in multi-piece group", () => {
      const mockGroup = { id: 1, size: () => 2 };
      groupManager.getGroup.mockReturnValue(mockGroup);

      hlHandler.onPieceSelected(2);
      expect(hlHandler.fixSelectedPieceOrientation()).toBe(true);
      expect(gameTableController.rotateGroup).toHaveBeenCalledWith(
        1,
        -90,
        mockPieces[1]
      );
    });

    it("should handle rotation greater than 180 degrees", () => {
      // Update rotation before selecting
      mockPieces[2].rotation = 270;
      // Ensure clean state
      hlHandler.onPieceDeselected();
      groupManager.getGroup.mockReturnValue(null);

      hlHandler.onPieceSelected(3);

      expect(hlHandler.fixSelectedPieceOrientation()).toBe(true);
      expect(gameTableController.rotatePiece).toHaveBeenCalledWith(3, 90);
    });

    it("should handle negative rotation", () => {
      // Update rotation before selecting
      mockPieces[0].rotation = -90;
      // Ensure clean state
      hlHandler.onPieceDeselected();
      groupManager.getGroup.mockReturnValue(null);

      hlHandler.onPieceSelected(1);

      expect(hlHandler.fixSelectedPieceOrientation()).toBe(true);
      expect(gameTableController.rotatePiece).toHaveBeenCalledWith(1, 90);
    });
  });

  describe("setSelectionChangeCallback", () => {
    it("should set and call selection change callback", () => {
      const callback = vi.fn();
      hlHandler.setSelectionChangeCallback(callback);

      hlHandler.onPieceSelected(1);

      expect(callback).toHaveBeenCalledWith(mockPieces[0]);
    });

    it("should allow replacing the callback", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      hlHandler.setSelectionChangeCallback(callback1);
      hlHandler.onPieceSelected(1);

      hlHandler.setSelectionChangeCallback(callback2);
      hlHandler.onPieceSelected(2);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("should handle selecting piece without visual listeners", () => {
      hlHandler.initialize(null, null);

      expect(() => hlHandler.onPieceSelected(1)).not.toThrow();
      expect(hlHandler.getSelectedPiece()).toEqual(mockPieces[0]);
    });

    it("should handle deselecting piece without visual listeners", () => {
      hlHandler.initialize(null, null);
      hlHandler.onPieceSelected(1);

      expect(() => hlHandler.onPieceDeselected()).not.toThrow();
      expect(hlHandler.getSelectedPiece()).toBeNull();
    });

    it("should handle fixing orientation when no piece selected", () => {
      hlHandler.onPieceDeselected();

      const result = hlHandler.fixSelectedPieceOrientation();
      expect(result).toBe(false);
    });
    it("should handle piece with single-piece group", () => {
      const mockGroup = { id: 1, size: () => 1 };
      groupManager.getGroup.mockReturnValue(mockGroup);

      hlHandler.onPieceSelected(2);
      hlHandler.fixSelectedPieceOrientation();

      expect(gameTableController.rotatePiece).toHaveBeenCalledWith(2, -90);
      expect(gameTableController.rotateGroup).not.toHaveBeenCalled();
    });
  });
});
