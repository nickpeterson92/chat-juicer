/**
 * Chat Juicer Renderer - New Architecture Entry Point
 * Uses bootstrap-simple.js for compatibility with existing HTML
 */

// Import CSS for Vite bundling
import "../../ui/input.css";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";

import { bootstrapSimple } from "./bootstrap.js";

console.log("🆕 Starting NEW Architecture...");

// Initialize application (async)
bootstrapSimple()
  .then((_app) => {
    console.log("🎉 Chat Juicer (New Architecture) initialized");
    console.log("💡 Available commands:");
    console.log("  - showCurrentArch()  → Show architecture info");
    console.log("  - window.app         → Access app instance");
    console.log("  - window.app.services → Access services");
    console.log("  - window.app.state    → Access state");
  })
  .catch((error) => {
    console.error("❌ Failed to initialize Chat Juicer:", error);
    console.error(error.stack);
  });
