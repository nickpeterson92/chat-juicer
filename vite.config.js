import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Determine build mode: 'electron' (default) or 'web'
const buildMode = process.env.BUILD_MODE || "electron";
const isWebBuild = buildMode === "web";

export default defineConfig({
  // Plugins
  plugins: [tailwindcss()],

  // Public directory for static assets
  publicDir: "public",

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
    outDir: isWebBuild ? "dist/web" : "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/frontend/ui/index.html"),
      },
    },
    // Target modern browsers for web (es2022 for top-level await), esnext for Electron
    target: isWebBuild ? "es2022" : "esnext",
    minify: process.env.NODE_ENV === "production",
    sourcemap: process.env.NODE_ENV !== "production",
  },

  // Development server
  server: {
    port: 5173,
    strictPort: true,
    // Automatically open the right HTML file
    open: "/src/frontend/ui/index.html",
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
