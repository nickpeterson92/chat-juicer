import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Plugins
  plugins: [tailwindcss()],

  // Public directory for static assets
  publicDir: "public",

  // Base public path for assets
  base: "./",

  // Build configuration
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "ui/index.html"),
      },
    },
    // Electron-specific optimizations
    target: "esnext",
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
  },

  // Development server
  server: {
    port: 5173,
    strictPort: true,
  },

  // Resolve configuration
  resolve: {
    alias: {
      "@": resolve(__dirname, "electron/renderer"),
      "@utils": resolve(__dirname, "electron/renderer/utils"),
      "@ui": resolve(__dirname, "electron/renderer/ui"),
      "@config": resolve(__dirname, "electron/renderer/config"),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ["marked", "marked-footnote", "dompurify", "highlight.js", "katex", "mermaid"],
  },
});
