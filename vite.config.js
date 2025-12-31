import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Determine build mode: 'electron' (default) or 'web'
const buildMode = process.env.BUILD_MODE || "electron";
const isWebBuild = buildMode === "web";

export default defineConfig({
  // Plugins
  plugins: [tailwindcss()],

  // Root directory - use project root to ensure Tailwind scans all files
  // root: "src/frontend/ui",

  // Public directory for static assets
  publicDir: resolve(__dirname, "public"),

  // Base public path for assets
  base: "./",

  // Environment variables exposed to client
  define: {
    // Only set for web builds - Electron uses IPC
    "import.meta.env.VITE_API_BASE": JSON.stringify(
      process.env.VITE_API_BASE || (isWebBuild ? "https://api.chat-juicer.com" : "")
    ),
  },

  // Build configuration
  build: {
    // Output to different directories based on build mode
    outDir: resolve(__dirname, isWebBuild ? "dist/web" : "dist/renderer"),
    // Write to disk even if output is outside root
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/frontend/ui/index.html"),
      },
      output: {
        // manualChunks removed to fix build error
      },
    },
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for web (es2022 for top-level await), esnext for Electron
    target: isWebBuild ? "es2022" : "esnext",
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
  },

  // Development server
  server: {
    port: 5173,
    strictPort: true,
    // Allow serving files from parent directories (needed for ../renderer imports)
    fs: {
      allow: [resolve(__dirname)],
    },
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
