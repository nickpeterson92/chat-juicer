#!/usr/bin/env node

/**
 * Universal Launch Script
 *
 * Cross-platform launcher for Chat Juicer.
 * Handles platform-specific Electron startup.
 */

const { spawn } = require("node:child_process");
const _path = require("node:path");
const platformConfig = require("./platform-config");

function launch() {
  // Get command line arguments
  const args = process.argv.slice(2);

  // Determine if development mode
  const isDev = args.includes("--dev");
  const isInspect = args.includes("--inspect");

  // Build Electron arguments
  const electronArgs = ["."];
  if (isDev) electronArgs.push("--dev");
  if (isInspect) electronArgs.push("--inspect");

  console.log("Starting Chat Juicer...");
  console.log("Platform:", platformConfig.getPlatformName());
  console.log("Mode:", isDev ? "Development" : "Production");
  console.log("");

  // Set environment to prevent conflicts
  const env = { ...process.env };

  // On Unix systems, unset ELECTRON_RUN_AS_NODE if set
  if (!platformConfig.isWindows()) {
    delete env.ELECTRON_RUN_AS_NODE;
  }

  // Get path to Electron
  const electronPath = require("electron");

  // Launch Electron
  const electron = spawn(electronPath, electronArgs, {
    env,
    stdio: "inherit",
    cwd: process.cwd(),
  });

  electron.on("close", (code) => {
    if (code !== 0) {
      console.error(`\nElectron exited with code ${code}`);
      process.exit(code);
    }
  });

  electron.on("error", (error) => {
    console.error("Failed to start Electron:", error);
    process.exit(1);
  });

  // Handle signals for graceful shutdown
  process.on("SIGINT", () => {
    electron.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    electron.kill("SIGTERM");
  });
}

launch();
