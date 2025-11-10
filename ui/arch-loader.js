/**
 * Architecture Loader - Feature Flag System
 * Dynamically loads the appropriate architecture based on localStorage setting
 */

// Check localStorage for architecture preference
const useNewArchitecture = localStorage.getItem("use-new-arch") === "true";
const scriptPath = useNewArchitecture ? "../electron/renderer/index-new.js" : "../electron/renderer/index.js";

console.log(`🏗️ Loading: ${useNewArchitecture ? "NEW" : "LEGACY"} architecture`);

// Dynamically load the appropriate entry point
const script = document.createElement("script");
script.type = "module";
script.src = scriptPath;
document.head.appendChild(script);

// Helper functions available in console
window.switchToNewArch = () => {
  localStorage.setItem("use-new-arch", "true");
  console.log("✅ Switched to NEW architecture. Reloading...");
  setTimeout(() => location.reload(), 500);
};

window.switchToLegacyArch = () => {
  localStorage.removeItem("use-new-arch");
  console.log("✅ Switched to LEGACY architecture. Reloading...");
  setTimeout(() => location.reload(), 500);
};

window.showCurrentArch = () => {
  const current = localStorage.getItem("use-new-arch") === "true" ? "NEW" : "LEGACY";
  console.log(`📊 Current architecture: ${current}`);
  console.log("💡 Commands available:");
  console.log("  - switchToNewArch()    → Switch to new architecture");
  console.log("  - switchToLegacyArch() → Switch to legacy architecture");
  console.log("  - showCurrentArch()    → Show current setting");
};

// Show available commands on load
console.log("💡 Architecture switcher loaded. Type showCurrentArch() for commands.");
