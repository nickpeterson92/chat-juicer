/**
 * IPCAdapter Unit Tests
 *
 * Tests the IPCAdapter with mock window.api
 */

import { IPCAdapter } from "@adapters/IPCAdapter.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("IPCAdapter", () => {
  let adapter;
  let mockAPI;

  beforeEach(() => {
    // Create mock API object
    mockAPI = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stopGeneration: vi.fn().mockResolvedValue(undefined),
      sendSessionCommand: vi.fn().mockResolvedValue(undefined),
      uploadFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      openFile: vi.fn().mockResolvedValue(undefined),
      showFileInFolder: vi.fn().mockResolvedValue(undefined),
      getVersion: vi.fn().mockResolvedValue("1.0.0"),
      openFileDialog: vi.fn().mockResolvedValue(null),
      saveFileDialog: vi.fn().mockResolvedValue(null),
      onPythonStdout: vi.fn(),
      onPythonStderr: vi.fn(),
      onPythonExit: vi.fn(),
    };

    adapter = new IPCAdapter(mockAPI);
  });

  describe("Constructor", () => {
    it("should initialize with provided API", () => {
      expect(adapter.api).toBe(mockAPI);
      expect(adapter.isAvailable()).toBe(true);
    });

    it("should warn when no API provided", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter(null);

      expect(adapterNoAPI.isAvailable()).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("No window.api found"));

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Message Operations", () => {
    it("should send message", async () => {
      await adapter.sendMessage("Hello World");
      expect(mockAPI.sendMessage).toHaveBeenCalledWith("Hello World");
      expect(mockAPI.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("should throw when API not available for sendMessage", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.sendMessage("test")).rejects.toThrow("IPC API not available: sendMessage");
    });

    it("should stop generation", async () => {
      await adapter.stopGeneration();
      expect(mockAPI.stopGeneration).toHaveBeenCalledTimes(1);
    });

    it("should throw when API not available for stopGeneration", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.stopGeneration()).rejects.toThrow("IPC API not available: stopGeneration");
    });
  });

  describe("Session Commands", () => {
    it("should send session command with data", async () => {
      await adapter.sendSessionCommand("create", { title: "New Session" });
      expect(mockAPI.sendSessionCommand).toHaveBeenCalledWith("create", { title: "New Session" });
    });

    it("should send session command without data", async () => {
      await adapter.sendSessionCommand("list");
      expect(mockAPI.sendSessionCommand).toHaveBeenCalledWith("list", {});
    });

    it("should throw when API not available for sendSessionCommand", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.sendSessionCommand("test")).rejects.toThrow(
        "IPC API not available: sendSessionCommand"
      );
    });
  });

  describe("File Operations", () => {
    it("should upload file", async () => {
      const fileData = new ArrayBuffer(8);
      await adapter.uploadFile("/path/to/file", fileData, "test.txt", "text/plain");

      expect(mockAPI.uploadFile).toHaveBeenCalledWith("/path/to/file", fileData, "test.txt", "text/plain");
    });

    it("should delete file", async () => {
      await adapter.deleteFile("/path/to/file.txt");
      expect(mockAPI.deleteFile).toHaveBeenCalledWith("/path/to/file.txt");
    });

    it("should open file", async () => {
      await adapter.openFile("/path/to/file.pdf");
      expect(mockAPI.openFile).toHaveBeenCalledWith("/path/to/file.pdf");
    });

    it("should show file in folder", async () => {
      await adapter.showFileInFolder("/path/to/file.txt");
      expect(mockAPI.showFileInFolder).toHaveBeenCalledWith("/path/to/file.txt");
    });

    it("should throw when API not available for file operations", async () => {
      const adapterNoAPI = new IPCAdapter({});

      await expect(adapterNoAPI.uploadFile("/test", new ArrayBuffer(8), "test", "text/plain")).rejects.toThrow(
        "IPC API not available: uploadFile"
      );

      await expect(adapterNoAPI.deleteFile("/test")).rejects.toThrow("IPC API not available: deleteFile");

      await expect(adapterNoAPI.openFile("/test")).rejects.toThrow("IPC API not available: openFile");

      await expect(adapterNoAPI.showFileInFolder("/test")).rejects.toThrow("IPC API not available: showFileInFolder");
    });
  });

  describe("Dialog Operations", () => {
    it("should open file dialog with options", async () => {
      mockAPI.openFileDialog.mockResolvedValue(["/path/to/file.txt"]);

      const result = await adapter.openFileDialog({
        filters: ["txt", "md"],
        multiple: true,
      });

      expect(mockAPI.openFileDialog).toHaveBeenCalledWith({
        filters: ["txt", "md"],
        multiple: true,
      });
      expect(result).toEqual(["/path/to/file.txt"]);
    });

    it("should open file dialog without options", async () => {
      mockAPI.openFileDialog.mockResolvedValue(null);

      const result = await adapter.openFileDialog();
      expect(mockAPI.openFileDialog).toHaveBeenCalledWith({});
      expect(result).toBeNull();
    });

    it("should open save dialog", async () => {
      mockAPI.saveFileDialog.mockResolvedValue("/path/to/save.txt");

      const result = await adapter.saveFileDialog({
        defaultPath: "/path/to/save.txt",
        filters: ["txt"],
      });

      expect(mockAPI.saveFileDialog).toHaveBeenCalledWith({
        defaultPath: "/path/to/save.txt",
        filters: ["txt"],
      });
      expect(result).toBe("/path/to/save.txt");
    });

    it("should throw when API not available for dialogs", async () => {
      const adapterNoAPI = new IPCAdapter({});

      await expect(adapterNoAPI.openFileDialog()).rejects.toThrow("IPC API not available: openFileDialog");

      await expect(adapterNoAPI.saveFileDialog()).rejects.toThrow("IPC API not available: saveFileDialog");
    });
  });

  describe("Version", () => {
    it("should get version", async () => {
      const version = await adapter.getVersion();
      expect(mockAPI.getVersion).toHaveBeenCalledTimes(1);
      expect(version).toBe("1.0.0");
    });

    it("should throw when API not available for getVersion", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.getVersion()).rejects.toThrow("IPC API not available: getVersion");
    });
  });

  describe("Event Handlers", () => {
    it("should register Python stdout handler", () => {
      const callback = vi.fn();
      adapter.onPythonStdout(callback);
      expect(mockAPI.onPythonStdout).toHaveBeenCalledWith(callback);
    });

    it("should register Python stderr handler", () => {
      const callback = vi.fn();
      adapter.onPythonStderr(callback);
      expect(mockAPI.onPythonStderr).toHaveBeenCalledWith(callback);
    });

    it("should register Python exit handler", () => {
      const callback = vi.fn();
      adapter.onPythonExit(callback);
      expect(mockAPI.onPythonExit).toHaveBeenCalledWith(callback);
    });

    it("should warn when API not available for event handlers", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      adapterNoAPI.onPythonStdout(() => {});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: onPythonStdout"));

      adapterNoAPI.onPythonStderr(() => {});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: onPythonStderr"));

      adapterNoAPI.onPythonExit(() => {});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: onPythonExit"));

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Availability", () => {
    it("should report available when API exists", () => {
      expect(adapter.isAvailable()).toBe(true);
    });

    it("should report not available when API missing", () => {
      const adapterNoAPI = new IPCAdapter(null);
      expect(adapterNoAPI.isAvailable()).toBe(false);
    });

    it("should get raw API", () => {
      expect(adapter.getRawAPI()).toBe(mockAPI);
    });

    it("should return null for raw API when not available", () => {
      const adapterNoAPI = new IPCAdapter(null);
      expect(adapterNoAPI.getRawAPI()).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should propagate API errors", async () => {
      const error = new Error("Backend connection failed");
      mockAPI.sendMessage.mockRejectedValue(error);

      await expect(adapter.sendMessage("test")).rejects.toThrow("Backend connection failed");
    });

    it("should handle API method returning error", async () => {
      mockAPI.getVersion.mockRejectedValue(new Error("Version not available"));

      await expect(adapter.getVersion()).rejects.toThrow("Version not available");
    });
  });
});
