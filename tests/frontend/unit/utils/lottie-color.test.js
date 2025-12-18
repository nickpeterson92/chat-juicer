/**
 * Unit tests for Lottie color override utilities
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock lottie-web before importing the module
vi.mock("lottie-web", () => ({
  default: {
    loadAnimation: vi.fn(() => ({
      play: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    })),
  },
}));

describe("Lottie Color Utilities", () => {
  let initLottieWithColor;
  let lottie;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("@utils/lottie-color.js");
    initLottieWithColor = module.initLottieWithColor;
    lottie = (await import("lottie-web")).default;
    vi.clearAllMocks();
  });

  describe("initLottieWithColor", () => {
    it("should return null for missing container element", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = initLottieWithColor("#nonexistent", {}, "#0066cc");

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith("Lottie container element not found");

      consoleSpy.mockRestore();
    });

    it("should handle string selector for container", () => {
      const container = document.createElement("div");
      container.id = "lottie-test";
      document.body.appendChild(container);

      const animationData = { layers: [] };
      initLottieWithColor("#lottie-test", animationData, "#0066cc");

      expect(lottie.loadAnimation).toHaveBeenCalledWith(
        expect.objectContaining({
          container: container,
        })
      );

      container.remove();
    });

    it("should handle HTMLElement directly for container", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = { layers: [] };
      initLottieWithColor(container, animationData, "#ff0000");

      expect(lottie.loadAnimation).toHaveBeenCalledWith(
        expect.objectContaining({
          container: container,
        })
      );

      container.remove();
    });

    it("should return animation instance on success", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const result = initLottieWithColor(container, { layers: [] }, "#0066cc");

      expect(result).toBeDefined();
      expect(result).not.toBeNull();

      container.remove();
    });

    it("should handle errors gracefully and return null", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      lottie.loadAnimation.mockImplementationOnce(() => {
        throw new Error("Load failed");
      });

      const result = initLottieWithColor(container, { layers: [] }, "#0066cc");

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load Lottie animation with color override:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      container.remove();
    });
  });

  describe("Color override functionality", () => {
    it("should override static fill colors in layers", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              {
                ty: "fl", // fill
                c: { a: 0, k: [1, 0, 0, 1] }, // red, static
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#0066cc");

      // Verify loadAnimation was called with modified data
      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const fillColor = calledData.layers[0].shapes[0].c.k;

      // Should be converted to normalized RGB for #0066cc
      expect(fillColor[0]).toBeCloseTo(0, 1); // R
      expect(fillColor[1]).toBeCloseTo(0.4, 1); // G
      expect(fillColor[2]).toBeCloseTo(0.8, 1); // B

      container.remove();
    });

    it("should override static stroke colors", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              {
                ty: "st", // stroke
                c: { a: 0, k: [0, 1, 0, 1] }, // green, static
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#ff0000");

      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const strokeColor = calledData.layers[0].shapes[0].c.k;

      // Should be converted to normalized RGB for #ff0000
      expect(strokeColor[0]).toBeCloseTo(1, 1); // R
      expect(strokeColor[1]).toBeCloseTo(0, 1); // G
      expect(strokeColor[2]).toBeCloseTo(0, 1); // B

      container.remove();
    });

    it("should override keyframed color animations", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              {
                ty: "fl",
                c: {
                  a: 1, // animated
                  k: [
                    { s: [1, 0, 0, 1], e: [0, 1, 0, 1], t: 0 }, // keyframe 1
                    { s: [0, 1, 0, 1], e: [0, 0, 1, 1], t: 30 }, // keyframe 2
                  ],
                },
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#ffffff");

      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const keyframes = calledData.layers[0].shapes[0].c.k;

      // All keyframe start and end colors should be white
      expect(keyframes[0].s[0]).toBeCloseTo(1, 1);
      expect(keyframes[0].s[1]).toBeCloseTo(1, 1);
      expect(keyframes[0].s[2]).toBeCloseTo(1, 1);
      expect(keyframes[0].e[0]).toBeCloseTo(1, 1);
      expect(keyframes[0].e[1]).toBeCloseTo(1, 1);
      expect(keyframes[0].e[2]).toBeCloseTo(1, 1);

      container.remove();
    });

    it("should traverse nested shape groups (it property)", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              {
                ty: "gr", // group
                it: [
                  {
                    ty: "fl",
                    c: { a: 0, k: [1, 0, 0, 1] },
                  },
                ],
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#00ff00");

      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const nestedFill = calledData.layers[0].shapes[0].it[0].c.k;

      expect(nestedFill[0]).toBeCloseTo(0, 1); // R
      expect(nestedFill[1]).toBeCloseTo(1, 1); // G
      expect(nestedFill[2]).toBeCloseTo(0, 1); // B

      container.remove();
    });

    it("should traverse precomp assets", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [],
        assets: [
          {
            layers: [
              {
                shapes: [
                  {
                    ty: "fl",
                    c: { a: 0, k: [1, 1, 1, 1] },
                  },
                ],
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#0000ff");

      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const assetFill = calledData.assets[0].layers[0].shapes[0].c.k;

      expect(assetFill[0]).toBeCloseTo(0, 1); // R
      expect(assetFill[1]).toBeCloseTo(0, 1); // G
      expect(assetFill[2]).toBeCloseTo(1, 1); // B

      container.remove();
    });

    it("should preserve alpha channel when overriding colors", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              {
                ty: "fl",
                c: { a: 0, k: [1, 0, 0, 0.5] }, // 50% alpha
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#0066cc");

      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const fillColor = calledData.layers[0].shapes[0].c.k;

      // Alpha should be preserved
      expect(fillColor[3]).toBe(0.5);

      container.remove();
    });

    it("should handle null/undefined animation data gracefully", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      // These should not throw
      expect(() => initLottieWithColor(container, null, "#0066cc")).not.toThrow();
      expect(() => initLottieWithColor(container, undefined, "#0066cc")).not.toThrow();

      container.remove();
    });

    it("should handle animation data without layers or assets", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = { v: "5.7.0", fr: 30 }; // minimal data, no layers

      expect(() => initLottieWithColor(container, animationData, "#0066cc")).not.toThrow();
      expect(lottie.loadAnimation).toHaveBeenCalled();

      container.remove();
    });

    it("should handle layers with nested precomp layers", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            layers: [
              // nested layers (precomp)
              {
                shapes: [
                  {
                    ty: "fl",
                    c: { a: 0, k: [0, 0, 0, 1] },
                  },
                ],
              },
            ],
          },
        ],
      };

      initLottieWithColor(container, animationData, "#ff00ff");

      const calledData = lottie.loadAnimation.mock.calls[0][0].animationData;
      const nestedFill = calledData.layers[0].layers[0].shapes[0].c.k;

      expect(nestedFill[0]).toBeCloseTo(1, 1); // R
      expect(nestedFill[1]).toBeCloseTo(0, 1); // G
      expect(nestedFill[2]).toBeCloseTo(1, 1); // B

      container.remove();
    });

    it("should skip non-fill/stroke shapes", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              { ty: "rc" }, // rectangle - not a fill/stroke
              { ty: "el" }, // ellipse - not a fill/stroke
              { ty: "fl", c: { a: 0, k: [1, 1, 1, 1] } }, // fill - should be overridden
            ],
          },
        ],
      };

      expect(() => initLottieWithColor(container, animationData, "#0066cc")).not.toThrow();

      container.remove();
    });

    it("should handle keyframes without s or e properties", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const animationData = {
        layers: [
          {
            shapes: [
              {
                ty: "fl",
                c: {
                  a: 1,
                  k: [
                    { t: 0 }, // keyframe without s/e (hold keyframe)
                    { s: [1, 0, 0, 1], t: 30 }, // only s, no e
                  ],
                },
              },
            ],
          },
        ],
      };

      expect(() => initLottieWithColor(container, animationData, "#0066cc")).not.toThrow();

      container.remove();
    });
  });
});
