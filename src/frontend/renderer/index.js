/**
 * Chat Juicer Renderer - Phase 4 Entry Point
 * Event-driven architecture with EventBus, plugins, and monitoring
 */

// Import CSS for Vite bundling
import "../ui/input.css";
import "katex/dist/katex.min.css";

import { bootstrapSimple } from "./bootstrap.js";

console.log("🚀 Starting Chat Juicer...");

// Initialize application
bootstrapSimple()
  .then((_app) => {
    console.log("🎉 Chat Juicer initialized");
  })
  .catch((error) => {
    console.error("❌ Failed to initialize Chat Juicer:", error);
    console.error(error.stack);
  });
