/**
 * Platform Configuration Module
 *
 * Centralized platform-specific logic for cross-platform compatibility.
 * Single source of truth for all platform differences.
 */

const os = require("node:os");
const path = require("node:path");

class PlatformConfig {
  constructor() {
    this.platform = process.platform;
    this.arch = process.arch;
  }

  /**
   * Get platform-specific Python virtual environment paths
   */
  getVenvPaths() {
    const isWindows = this.platform === "win32";

    return {
      // Virtual environment directory
      venvDir: ".juicer",

      // Python executable path within venv
      pythonBin: isWindows ? path.join(".juicer", "Scripts", "python.exe") : path.join(".juicer", "bin", "python3"),

      // Pip executable path within venv
      pipBin: isWindows ? path.join(".juicer", "Scripts", "pip.exe") : path.join(".juicer", "bin", "pip"),

      // Activation script
      activateScript: isWindows
        ? path.join(".juicer", "Scripts", "activate.bat")
        : path.join(".juicer", "bin", "activate"),
    };
  }

  /**
   * Get fallback Python command names to try (in order of preference)
   * Requires Python 3.13+ for all dependencies
   */
  getPythonCommands() {
    switch (this.platform) {
      case "win32":
        return ["python", "py", "python3"];
      case "darwin":
      case "linux":
        return ["python3.13", "python3"];
      default:
        return ["python3.13", "python3"];
    }
  }

  /**
   * Get platform-specific shell configuration
   */
  getShellConfig() {
    const isWindows = this.platform === "win32";

    return {
      shell: isWindows ? "cmd.exe" : "/bin/bash",
      envCommand: isWindows ? "set" : "export",
      pathSeparator: isWindows ? ";" : ":",
      lineEnding: isWindows ? "\r\n" : "\n",
      scriptExtension: isWindows ? ".bat" : ".sh",
    };
  }

  /**
   * Get platform display name
   */
  getPlatformName() {
    const names = {
      win32: "Windows",
      darwin: "macOS",
      linux: "Linux",
    };
    return names[this.platform] || this.platform;
  }

  /**
   * Get platform-specific temporary directory
   */
  getTempDir() {
    return os.tmpdir();
  }

  /**
   * Check if running on Windows
   */
  isWindows() {
    return this.platform === "win32";
  }

  /**
   * Check if running on macOS
   */
  isMacOS() {
    return this.platform === "darwin";
  }

  /**
   * Check if running on Linux
   */
  isLinux() {
    return this.platform === "linux";
  }

  /**
   * Get spawn options for child processes
   */
  getSpawnOptions(additionalOptions = {}) {
    return {
      // Detached mode for better process management (not supported on Windows)
      detached: !this.isWindows(),

      // Windows-specific shell option
      shell: this.isWindows(),

      // Environment variables
      env: { ...process.env, PYTHONUNBUFFERED: "1" },

      ...additionalOptions,
    };
  }

  /**
   * Get platform info summary
   */
  getPlatformInfo() {
    return {
      platform: this.platform,
      platformName: this.getPlatformName(),
      arch: this.arch,
      nodeVersion: process.version,
      homeDir: os.homedir(),
      tempDir: this.getTempDir(),
    };
  }
}

// Export singleton instance
module.exports = new PlatformConfig();
