#!/usr/bin/env node

/**
 * Pre-Start Validation Script
 *
 * Quick validation before launching the application.
 * Auto-repairs minor issues when possible.
 */

const { existsSync } = require("node:fs");
const path = require("node:path");
const PythonManager = require("./python-manager");

async function validate() {
  try {
    const pythonManager = new PythonManager();

    // Quick check: Python environment exists
    if (!pythonManager.venvExists()) {
      console.log("⚠ Virtual environment not found. Running setup...");
      await pythonManager.ensureEnvironment();
    }

    // Check .env exists
    const envPath = path.join(process.cwd(), "src", ".env");
    if (!existsSync(envPath)) {
      console.error("✗ src/.env not found. Run: npm run setup");
      process.exit(1);
    }

    // All good
    process.exit(0);
  } catch (error) {
    console.error("✗ Validation failed:", error.message);
    console.error("\nTry running: npm run setup");
    process.exit(1);
  }
}

validate();
