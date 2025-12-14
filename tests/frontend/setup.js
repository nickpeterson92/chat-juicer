/**
 * Vitest setup file - runs before all tests.
 *
 * Mocks modules that don't work in happy-dom environment.
 */
import { vi } from "vitest";

// Mock lottie-web - it tries to access canvas context which doesn't exist in happy-dom
vi.mock("lottie-web", () => ({
  default: {
    loadAnimation: vi.fn(() => ({
      destroy: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      setSpeed: vi.fn(),
      goToAndStop: vi.fn(),
      goToAndPlay: vi.fn(),
    })),
  },
}));
