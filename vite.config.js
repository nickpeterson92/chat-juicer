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
        main: resolve(__dirname, "src/frontend/ui/index.html"),
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
      "@": resolve(__dirname, "src/frontend/renderer"),
      "@utils": resolve(__dirname, "src/frontend/renderer/utils"),
      "@ui": resolve(__dirname, "src/frontend/renderer/ui"),
      "@config": resolve(__dirname, "src/frontend/renderer/config"),
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ["marked", "marked-footnote", "dompurify", "shiki", "katex", "mermaid"],
  },
});
