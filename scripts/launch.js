#!/usr/bin/env node

/**
 * Universal Launch Script
 *
 * Cross-platform launcher for Wishgate.
 * Handles platform-specific Electron startup.
 */

const { spawn } = require("node:child_process");
const _path = require("node:path");
const platformConfig = require("./platform-config");

async function launch() {
  // Get command line arguments
  const args = process.argv.slice(2);

  // Determine if development mode
  const isDev = args.includes("--dev");
  const isInspect = args.includes("--inspect");

  // Build Electron arguments
  const electronArgs = ["."];
  if (isDev) electronArgs.push("--dev");
  if (isInspect) electronArgs.push("--inspect");

  console.log("Starting Wishgate...");
  console.log("Platform:", platformConfig.getPlatformName());
  console.log("Mode:", isDev ? "Development" : "Production");
  console.log("");

  // Set environment to prevent conflicts
  const env = { ...process.env };

  // In development mode, start Vite dev server
  if (isDev) {
    console.log("Starting Vite dev server...");
    const vitePort = 5173;
    env.VITE_DEV_SERVER_URL = `http://localhost:${vitePort}/ui/`;

    // Start Vite in background
    const vite = spawn("npx", ["vite", "--port", vitePort.toString()], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    // Wait for Vite to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Vite dev server failed to start"));
      }, 30000);

      vite.stdout.on("data", (data) => {
        const output = data.toString();
        if (output.includes("ready in") || output.includes("Local:")) {
          clearTimeout(timeout);
          console.log("Vite dev server ready");
          resolve();
        }
      });

      vite.stderr.on("data", (data) => {
        console.error("Vite:", data.toString());
      });

      vite.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Cleanup Vite on exit
    process.on("exit", () => vite.kill());
    process.on("SIGINT", () => {
      vite.kill("SIGINT");
      process.exit();
    });
  }

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
