import { describe, it, expect, beforeEach } from "vitest";
import { createPieceElement } from "@/js/ui/display.js";

describe("display", () => {
  describe("createPieceElement", () => {
    let mockPiece;
    let mockContext;

    beforeEach(() => {
      // Create a mock canvas for the piece bitmap
      const bitmap = document.createElement("canvas");
      bitmap.width = 100;
      bitmap.height = 80;

      // Mock canvas 2D context
      mockContext = {
        save: vi.fn(),
        restore: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
      };

      // Mock getContext to return our mock context
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        mockContext
      );

      mockPiece = {
        id: 1,
        bitmap: bitmap,
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should create wrapper with correct dimensions for normal scale", () => {
      const scale = 1.0;
      const wrapper = createPieceElement(mockPiece, scale);

      expect(wrapper).toBeDefined();
      expect(wrapper.tagName).toBe("DIV");
      expect(wrapper.className).toBe("piece");
      expect(wrapper.dataset.id).toBe("1");
      expect(wrapper.style.width).toBe("100px");
      expect(wrapper.style.height).toBe("80px");
    });

    it("should create canvas with correct dimensions for normal scale", () => {
      const scale = 1.0;
      const wrapper = createPieceElement(mockPiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(canvas).toBeDefined();
      expect(canvas.width).toBe(100);
      expect(canvas.height).toBe(80);
    });

    it("should scale wrapper dimensions correctly with scale factor", () => {
      const scale = 1.5;
      const wrapper = createPieceElement(mockPiece, scale);

      expect(wrapper.style.width).toBe("150px"); // 100 * 1.5
      expect(wrapper.style.height).toBe("120px"); // 80 * 1.5
    });

    it("should scale canvas dimensions correctly with scale factor", () => {
      const scale = 1.5;
      const wrapper = createPieceElement(mockPiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(canvas.width).toBe(150); // 100 * 1.5
      expect(canvas.height).toBe(120); // 80 * 1.5
    });

    it("should handle fractional scale factors", () => {
      const scale = 0.7;
      const wrapper = createPieceElement(mockPiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(wrapper.style.width).toBe("70px"); // 100 * 0.7
      expect(wrapper.style.height).toBe("56px"); // 80 * 0.7
      expect(canvas.width).toBe(70);
      expect(canvas.height).toBe(56);
    });

    it("should enforce minimum dimension of 24px for very small scale", () => {
      const scale = 0.1;
      // With scale 0.1: 100 * 0.1 = 10, 80 * 0.1 = 8
      // Both should be clamped to MIN_RENDERED_DIMENSION (24)
      const wrapper = createPieceElement(mockPiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(wrapper.style.width).toBe("24px");
      expect(wrapper.style.height).toBe("24px");
      expect(canvas.width).toBe(24);
      expect(canvas.height).toBe(24);
    });

    it("should enforce minimum dimension on one dimension if needed", () => {
      // Small bitmap
      const smallBitmap = document.createElement("canvas");
      smallBitmap.width = 200; // Large width
      smallBitmap.height = 20; // Small height

      const smallPiece = {
        id: 2,
        bitmap: smallBitmap,
      };

      const scale = 0.1;
      // width: 200 * 0.1 = 20 -> clamped to 24
      // height: 20 * 0.1 = 2 -> clamped to 24
      const wrapper = createPieceElement(smallPiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(wrapper.style.width).toBe("24px");
      expect(wrapper.style.height).toBe("24px");
      expect(canvas.width).toBe(24);
      expect(canvas.height).toBe(24);
    });

    it("should handle large scale factors correctly", () => {
      const scale = 3.0;
      const wrapper = createPieceElement(mockPiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(wrapper.style.width).toBe("300px"); // 100 * 3.0
      expect(wrapper.style.height).toBe("240px"); // 80 * 3.0
      expect(canvas.width).toBe(300);
      expect(canvas.height).toBe(240);
    });

    it("should append canvas as child of wrapper", () => {
      const scale = 1.0;
      const wrapper = createPieceElement(mockPiece, scale);

      expect(wrapper.children.length).toBe(1);
      expect(wrapper.children[0].tagName).toBe("CANVAS");
    });

    it("should create canvas with 2d context", () => {
      const scale = 1.0;
      const wrapper = createPieceElement(mockPiece, scale);
      const canvas = wrapper.querySelector("canvas");
      const ctx = canvas.getContext("2d");

      expect(ctx).toBeDefined();
      expect(ctx).toBeTruthy();
      expect(typeof ctx).toBe("object");
    });

    it("should maintain aspect ratio across different scales", () => {
      const scale1 = 0.5;
      const scale2 = 2.0;

      const wrapper1 = createPieceElement(mockPiece, scale1);
      const wrapper2 = createPieceElement(mockPiece, scale2);

      const canvas1 = wrapper1.querySelector("canvas");
      const canvas2 = wrapper2.querySelector("canvas");

      // Original aspect ratio: 100:80 = 1.25
      const aspectRatio1 = canvas1.width / canvas1.height;
      const aspectRatio2 = canvas2.width / canvas2.height;

      // Both should maintain the same aspect ratio (approximately)
      expect(aspectRatio1).toBeCloseTo(1.25, 1);
      expect(aspectRatio2).toBeCloseTo(1.25, 1);
    });

    it("should handle square bitmaps correctly", () => {
      const squareBitmap = document.createElement("canvas");
      squareBitmap.width = 100;
      squareBitmap.height = 100;

      const squarePiece = {
        id: 3,
        bitmap: squareBitmap,
      };

      const scale = 1.5;
      const wrapper = createPieceElement(squarePiece, scale);
      const canvas = wrapper.querySelector("canvas");

      expect(wrapper.style.width).toBe("150px");
      expect(wrapper.style.height).toBe("150px");
      expect(canvas.width).toBe(150);
      expect(canvas.height).toBe(150);
    });
  });
});
