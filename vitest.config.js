import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Environment setup
    environment: "happy-dom",
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "electron/main.js",
        "electron/preload.js",
        "scripts/",
        "**/*.config.js",
        "**/*.spec.js",
        "**/*.test.js",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Test file patterns
    include: [
      "tests/frontend/unit/**/*.test.js",
      "tests/frontend/integration/**/*.test.js",
      "tests/frontend/e2e/**/*.test.js",
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
      "@": resolve(__dirname, "electron/renderer"),
      "@utils": resolve(__dirname, "electron/renderer/utils"),
      "@ui": resolve(__dirname, "electron/renderer/ui"),
      "@config": resolve(__dirname, "electron/renderer/config"),
      "@adapters": resolve(__dirname, "electron/renderer/adapters"),
      "@services": resolve(__dirname, "electron/renderer/services"),
      "@test-helpers": resolve(__dirname, "tests/frontend/helpers"),
    },
  },
});
