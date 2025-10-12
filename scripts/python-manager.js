/**
 * Python Runtime Manager
 *
 * Intelligent Python detection, validation, and environment management.
 * Implements self-healing pattern with multiple fallback strategies.
 */

const { spawn, execSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const platformConfig = require("./platform-config");

class PythonManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.venvPaths = platformConfig.getVenvPaths();
    this.pythonCommands = platformConfig.getPythonCommands();
    this.cachedPythonPath = null;
  }

  /**
   * Find Python interpreter using multiple strategies
   * Returns absolute path to Python executable
   */
  async findPython() {
    // Return cached result if available
    if (this.cachedPythonPath && existsSync(this.cachedPythonPath)) {
      return this.cachedPythonPath;
    }

    const strategies = [() => this.checkVenv(), () => this.checkSystemPython()];

    for (const strategy of strategies) {
      try {
        const pythonPath = await strategy();
        if (pythonPath) {
          this.cachedPythonPath = pythonPath;
          return pythonPath;
        }
      } catch (_error) {}
    }

    throw new Error(
      `Python not found. Please install Python 3.9+ from https://www.python.org/downloads/\n` +
        `Tried: ${this.pythonCommands.join(", ")}`
    );
  }

  /**
   * Strategy 1: Check virtual environment
   */
  async checkVenv() {
    const venvPythonPath = path.join(this.projectRoot, this.venvPaths.pythonBin);

    if (existsSync(venvPythonPath)) {
      // Validate it works
      if (await this.validatePython(venvPythonPath)) {
        return venvPythonPath;
      }
    }

    return null;
  }

  /**
   * Strategy 2: Check system Python installations
   */
  async checkSystemPython() {
    for (const cmd of this.pythonCommands) {
      try {
        // Try to find Python in PATH
        const pythonPath = await this.findInPath(cmd);
        if (pythonPath && (await this.validatePython(pythonPath))) {
          return pythonPath;
        }
      } catch (_error) {}
    }

    return null;
  }

  /**
   * Find command in system PATH
   */
  async findInPath(command) {
    try {
      const which = platformConfig.isWindows() ? "where" : "which";
      const result = execSync(`${which} ${command}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      // On Windows, 'where' returns multiple paths, take the first
      const pythonPath = result.split("\n")[0].trim();
      return existsSync(pythonPath) ? pythonPath : null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Validate Python executable works and meets version requirements
   */
  async validatePython(pythonPath) {
    try {
      const version = execSync(`"${pythonPath}" --version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();

      // Check version is Python 3.9+
      const match = version.match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        return major === 3 && minor >= 9;
      }

      return false;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if virtual environment exists and is valid
   */
  venvExists() {
    const venvPath = path.join(this.projectRoot, this.venvPaths.venvDir);
    const pythonPath = path.join(this.projectRoot, this.venvPaths.pythonBin);
    return existsSync(venvPath) && existsSync(pythonPath);
  }

  /**
   * Create virtual environment
   */
  async createVenv(pythonPath) {
    return new Promise((resolve, reject) => {
      const venvPath = path.join(this.projectRoot, this.venvPaths.venvDir);

      console.log(`Creating virtual environment at ${venvPath}...`);

      const process = spawn(pythonPath, ["-m", "venv", this.venvPaths.venvDir], {
        cwd: this.projectRoot,
        stdio: "inherit",
      });

      process.on("close", (code) => {
        if (code === 0) {
          console.log("✓ Virtual environment created");
          resolve();
        } else {
          reject(new Error(`Failed to create virtual environment (exit code ${code})`));
        }
      });

      process.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Install Python dependencies
   */
  async installDependencies() {
    const pipPath = path.join(this.projectRoot, this.venvPaths.pipBin);
    const requirementsPath = path.join(this.projectRoot, "src", "requirements.txt");

    if (!existsSync(requirementsPath)) {
      throw new Error(`Requirements file not found: ${requirementsPath}`);
    }

    return new Promise((resolve, reject) => {
      console.log("Installing Python dependencies...");

      const process = spawn(pipPath, ["install", "-r", requirementsPath], {
        cwd: this.projectRoot,
        stdio: "inherit",
      });

      process.on("close", (code) => {
        if (code === 0) {
          console.log("✓ Python dependencies installed");
          resolve();
        } else {
          reject(new Error(`Failed to install dependencies (exit code ${code})`));
        }
      });

      process.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get Python version string
   */
  async getPythonVersion(pythonPath) {
    try {
      return execSync(`"${pythonPath}" --version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
    } catch (_error) {
      return "Unknown";
    }
  }

  /**
   * Get pip version string
   */
  async getPipVersion() {
    const pipPath = path.join(this.projectRoot, this.venvPaths.pipBin);
    try {
      return execSync(`"${pipPath}" --version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
    } catch (_error) {
      return "Unknown";
    }
  }

  /**
   * Get environment info for diagnostics
   */
  async getEnvironmentInfo() {
    const pythonPath = await this.findPython().catch(() => null);

    return {
      pythonPath,
      pythonVersion: pythonPath ? await this.getPythonVersion(pythonPath) : "Not found",
      venvExists: this.venvExists(),
      venvPath: path.join(this.projectRoot, this.venvPaths.venvDir),
      platform: platformConfig.getPlatformName(),
    };
  }

  /**
   * Ensure environment is ready (create venv if needed, install deps)
   */
  async ensureEnvironment() {
    console.log("Checking Python environment...");

    // Find Python
    const pythonPath = await this.findPython();
    const version = await this.getPythonVersion(pythonPath);
    console.log(`✓ Found Python: ${version}`);

    // Check/create venv
    if (!this.venvExists()) {
      await this.createVenv(pythonPath);
    } else {
      console.log("✓ Virtual environment exists");
    }

    // Check dependencies
    // Simple check: see if openai package is installed
    const venvPython = path.join(this.projectRoot, this.venvPaths.pythonBin);
    try {
      execSync(`"${venvPython}" -c "import openai"`, {
        stdio: "ignore",
      });
      console.log("✓ Python dependencies installed");
    } catch (_error) {
      console.log("Installing dependencies...");
      await this.installDependencies();
    }

    return venvPython;
  }
}

module.exports = PythonManager;
