#!/usr/bin/env node

/**
 * Universal Setup Script
 *
 * Cross-platform setup automation for Chat Juicer.
 * Replaces platform-specific setup.sh and Makefile.
 */

const { existsSync } = require("node:fs");
const { copyFile } = require("node:fs/promises");
const path = require("node:path");
const { execSync } = require("node:child_process");
const PythonManager = require("./python-manager");
const platformConfig = require("./platform-config");

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(text) {
  console.log(`\n${colorize("═".repeat(60), "blue")}`);
  console.log(colorize(`  ${text}`, "blue"));
  console.log(`${colorize("═".repeat(60), "blue")}\n`);
}

function printSuccess(text) {
  console.log(`${colorize("✓", "green")} ${text}`);
}

function printError(text) {
  console.log(`${colorize("✗", "red")} ${text}`);
}

function printWarning(text) {
  console.log(`${colorize("⚠", "yellow")} ${text}`);
}

function printInfo(text) {
  console.log(`${colorize("ℹ", "blue")} ${text}`);
}

/**
 * Check if command exists in PATH
 */
function commandExists(command) {
  try {
    const which = platformConfig.isWindows() ? "where" : "which";
    execSync(`${which} ${command}`, { stdio: "ignore" });
    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Get version of a command
 */
function getVersion(command) {
  try {
    return execSync(`${command} --version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    })
      .trim()
      .split("\n")[0];
  } catch (_error) {
    return "Unknown";
  }
}

/**
 * Check prerequisites
 */
async function checkPrerequisites() {
  printHeader("Checking Prerequisites");

  const checks = {
    "Node.js": { command: "node", required: true },
    npm: { command: "npm", required: true },
  };

  let allPassed = true;

  for (const [name, { command, required }] of Object.entries(checks)) {
    if (commandExists(command)) {
      const version = getVersion(command);
      printSuccess(`${name}: ${version}`);
    } else {
      if (required) {
        printError(`${name} not found (required)`);
        allPassed = false;
      } else {
        printWarning(`${name} not found (optional)`);
      }
    }
  }

  // Python check (will be handled by PythonManager)
  printInfo("Python will be detected automatically...");

  if (!allPassed) {
    throw new Error("Missing required prerequisites");
  }

  return true;
}

/**
 * Install Node.js dependencies
 */
async function installNodeDependencies() {
  printHeader("Installing Node.js Dependencies");

  try {
    execSync("npm install", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    printSuccess("Node.js dependencies installed");
    return true;
  } catch (error) {
    printError(`Failed to install Node.js dependencies: ${error.message}`);
    throw error;
  }
}

/**
 * Setup Python environment
 */
async function setupPythonEnvironment() {
  printHeader("Setting Up Python Environment");

  const pythonManager = new PythonManager();

  try {
    await pythonManager.ensureEnvironment();
    return true;
  } catch (error) {
    printError(`Failed to setup Python environment: ${error.message}`);
    throw error;
  }
}

/**
 * Install MCP servers
 */
async function installMCPServers() {
  printHeader("Installing MCP Servers");

  // Sequential Thinking Server (Node.js-based, global install)
  const seqThinkingPackage = "@modelcontextprotocol/server-sequential-thinking";

  try {
    // Check if already installed
    try {
      execSync(`npm list -g ${seqThinkingPackage}`, { stdio: "ignore" });
      printSuccess(`Sequential Thinking MCP server already installed`);
    } catch (_error) {
      // Not installed, proceed with installation
      printInfo(`Installing ${seqThinkingPackage} globally...`);

      execSync(`npm install -g ${seqThinkingPackage}`, {
        stdio: "inherit",
      });

      printSuccess("Sequential Thinking MCP server installed");
    }
  } catch (_error) {
    printWarning("Failed to install Sequential Thinking MCP server globally");
    printInfo("You may need elevated permissions. Try:");
    if (platformConfig.isWindows()) {
      printInfo(`  Run as Administrator: npm install -g ${seqThinkingPackage}`);
    } else {
      printInfo(`  sudo npm install -g ${seqThinkingPackage}`);
    }
  }

  // Fetch Server (Python-based, installed in venv via requirements.txt)
  printInfo("Fetch MCP server will be installed with Python dependencies");
  printSuccess("MCP servers configuration complete");

  return true;
}

/**
 * Setup environment configuration
 */
async function setupEnvironment() {
  printHeader("Setting Up Environment Variables");

  const envPath = path.join(process.cwd(), "src", ".env");
  const envExamplePath = path.join(process.cwd(), "src", ".env.example");

  if (existsSync(envPath)) {
    printWarning("src/.env already exists, skipping...");
    printInfo("If you need to reconfigure, edit src/.env manually");

    // Check if still has placeholder values
    const fs = require("node:fs");
    const envContent = fs.readFileSync(envPath, "utf-8");
    if (envContent.includes("your-azure-api-key-here")) {
      printWarning("src/.env contains placeholder values");
      printInfo("Remember to configure your Azure OpenAI credentials in src/.env");
    } else {
      printSuccess("Environment variables configured");
    }
  } else {
    if (existsSync(envExamplePath)) {
      await copyFile(envExamplePath, envPath);
      printSuccess("Created src/.env from template");
      printInfo("\nPlease edit src/.env with your Azure OpenAI credentials:");
      printInfo("  - AZURE_OPENAI_API_KEY");
      printInfo("  - AZURE_OPENAI_ENDPOINT");
      printInfo("  - AZURE_OPENAI_DEPLOYMENT");
    } else {
      printError("src/.env.example not found");
      throw new Error("Missing .env.example file");
    }
  }
}

/**
 * Install development tools (optional)
 */
async function installDevTools() {
  const args = process.argv.slice(2);
  const installDev = args.includes("--dev") || args.includes("--with-dev");

  if (!installDev) {
    printInfo("Skipping dev tools (use --dev to install linters, formatters, etc.)");
    return true;
  }

  printHeader("Installing Development Tools");

  const pythonManager = new PythonManager();
  const devRequirementsPath = path.join(process.cwd(), "requirements-dev.txt");

  if (!existsSync(devRequirementsPath)) {
    printWarning("requirements-dev.txt not found, skipping dev tools");
    return true;
  }

  try {
    const pipPath = path.join(process.cwd(), pythonManager.venvPaths.pipBin);

    printInfo("Installing Python dev dependencies (ruff, black, mypy, pre-commit)...");
    execSync(`"${pipPath}" install -r requirements-dev.txt`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    printSuccess("Python dev dependencies installed");

    // Install pre-commit hooks
    printInfo("Installing pre-commit hooks...");
    const preCommitPath = path.join(process.cwd(), pythonManager.venvPaths.venvDir, "bin", "pre-commit");
    execSync(`"${preCommitPath}" install`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    printSuccess("Pre-commit hooks installed");
    return true;
  } catch (error) {
    printWarning(`Dev tools installation failed: ${error.message}`);
    printInfo("You can install them later with: make install-dev");
    return false;
  }
}

/**
 * Create necessary directories
 */
async function createDirectories() {
  printHeader("Creating Project Directories");

  const fs = require("node:fs");
  const dirs = [
    "logs", // Log files (conversations.jsonl, errors.jsonl)
    "sources", // Global source documents (deprecated in favor of per-session)
    "output", // Global output documents (deprecated in favor of per-session)
    "templates", // Global document templates
    "data", // Session metadata and SQLite databases
    "data/files", // Per-session workspaces (sources, output, templates)
  ];

  for (const dir of dirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  printSuccess("Project directories ready");
}

/**
 * Validate setup
 */
async function validateSetup() {
  printHeader("Validating Setup");

  const pythonManager = new PythonManager();
  const info = await pythonManager.getEnvironmentInfo();

  console.log("\nEnvironment Summary:");
  console.log("  Platform:", platformConfig.getPlatformName());
  console.log("  Python:", info.pythonVersion);
  console.log("  Virtual Env:", info.venvExists ? "✓ Ready" : "✗ Not found");

  // Test Python syntax
  const mainPy = path.join(process.cwd(), "src", "main.py");
  if (existsSync(mainPy)) {
    try {
      execSync(`"${info.pythonPath}" -m py_compile "${mainPy}"`, {
        stdio: "ignore",
      });
      printSuccess("Python backend syntax valid");
    } catch (_error) {
      printError("Python syntax check failed");
    }
  }
}

/**
 * Main setup flow
 */
async function main() {
  console.log(colorize("\n╔══════════════════════════════════════════════════════════════╗", "blue"));
  console.log(colorize("║              Chat Juicer - Universal Setup               ║", "blue"));
  console.log(colorize("╚══════════════════════════════════════════════════════════════╝\n", "blue"));

  console.log("Platform:", colorize(platformConfig.getPlatformName(), "bright"));
  console.log("Node.js:", colorize(process.version, "bright"));
  console.log("");

  try {
    await checkPrerequisites();
    await installNodeDependencies();
    await setupPythonEnvironment();
    await installMCPServers();
    await installDevTools();
    await setupEnvironment();
    await createDirectories();
    await validateSetup();

    printHeader("Setup Complete!");
    printSuccess("Chat Juicer is ready to use!");
    console.log("\nQuick start commands:");
    console.log("  npm start        - Start the application");
    console.log("  npm run dev      - Start in development mode (with DevTools)");
    console.log("\n");
  } catch (error) {
    printHeader("Setup Failed");
    printError(error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

// Run setup if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
