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

// Mock localStorage and sessionStorage
const mockStorage = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    length: 0,
    key: vi.fn((i) => Object.keys(store)[i] || null),
  };
};

if (!global.localStorage || typeof global.localStorage.getItem !== "function") {
  Object.defineProperty(window, "localStorage", {
    value: mockStorage(),
  });
}

if (!global.sessionStorage || typeof global.sessionStorage.getItem !== "function") {
  Object.defineProperty(window, "sessionStorage", {
    value: mockStorage(),
  });
}
