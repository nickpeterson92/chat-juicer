import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Environment setup
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/frontend/setup.js"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "src/frontend/main.js",
        "src/frontend/preload.js",
        "scripts/",
        "**/*.config.js",
        "**/*.spec.js",
        "**/*.test.js",
        "tests/frontend/helpers/**", // Exclude test mocks and helpers from coverage
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },

    // Test file patterns
    include: [
      "tests/frontend/unit/**/*.test.js",
      "tests/frontend/integration/**/*.test.js",
      "tests/frontend/performance/**/*.test.js",
      "tests/frontend/e2e/**/*.test.js",
      "tests/frontend/accessibility/**/*.test.js",
    ],
    exclude: ["node_modules", "dist", "data", "output"],

    // Test execution
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,

    // Reporters
    reporters: ["verbose"],

    // Watch mode
    watch: false,

    // Mocking
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },

  // Resolve aliases to match main vite config
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/frontend/renderer"),
      "@utils": resolve(__dirname, "src/frontend/renderer/utils"),
      "@ui": resolve(__dirname, "src/frontend/renderer/ui"),
      "@config": resolve(__dirname, "src/frontend/renderer/config"),
      "@adapters": resolve(__dirname, "src/frontend/renderer/adapters"),
      "@services": resolve(__dirname, "src/frontend/renderer/services"),
      "@test-helpers": resolve(__dirname, "tests/frontend/helpers"),
    },
  },
});
