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
    // Create mock API object (matches actual electronAPI interface)
    mockAPI = {
      sendUserInput: vi.fn().mockResolvedValue(undefined),
      restartBot: vi.fn().mockResolvedValue(undefined),
      sessionCommand: vi.fn().mockResolvedValue(undefined),
      uploadFile: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      openFile: vi.fn().mockResolvedValue(undefined),
      showFileInFolder: vi.fn().mockResolvedValue(undefined),
      getVersion: "1.0.0", // Not a function, it's a property
      openFileDialog: vi.fn().mockResolvedValue(null),
      saveFileDialog: vi.fn().mockResolvedValue(null),
      onBotMessage: vi.fn(),
      onBotError: vi.fn(),
      onBotDisconnected: vi.fn(),
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
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("No window.electronAPI found"));

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Message Operations", () => {
    it("should send message", async () => {
      await adapter.sendMessage("Hello World");
      expect(mockAPI.sendUserInput).toHaveBeenCalledWith("Hello World");
      expect(mockAPI.sendUserInput).toHaveBeenCalledTimes(1);
    });

    it("should throw when API not available for sendMessage", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.sendMessage("test")).rejects.toThrow("IPC API not available: sendUserInput");
    });

    it("should stop generation", async () => {
      await adapter.stopGeneration();
      expect(mockAPI.restartBot).toHaveBeenCalledTimes(1);
    });

    it("should not throw when API not available for stopGeneration", async () => {
      const adapterNoAPI = new IPCAdapter({});
      // stopGeneration resolves gracefully when API not available
      await expect(adapterNoAPI.stopGeneration()).resolves.toBeUndefined();
    });
  });

  describe("Session Commands", () => {
    it("should send session command with data", async () => {
      await adapter.sendSessionCommand("create", { title: "New Session" });
      expect(mockAPI.sessionCommand).toHaveBeenCalledWith("create", { title: "New Session" });
    });

    it("should send session command without data", async () => {
      await adapter.sendSessionCommand("list");
      expect(mockAPI.sessionCommand).toHaveBeenCalledWith("list", {});
    });

    it("should throw when API not available for sendSessionCommand", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.sendSessionCommand("test")).rejects.toThrow("IPC API not available: sessionCommand");
    });
  });

  describe("File Operations", () => {
    it("should upload file", async () => {
      // Use Uint8Array since implementation uses .length not .byteLength
      const fileData = new Uint8Array(8);
      await adapter.uploadFile("/path/to/file", fileData, "test.txt", "text/plain");

      // Upload now wraps data in an object
      const call = mockAPI.uploadFile.mock.calls[0][0];
      expect(call.filename).toBe("test.txt");
      expect(call.data).toBe(fileData);
      expect(call.size).toBe(8);
      expect(call.type).toBe("text/plain");
    });

    it("should delete file", async () => {
      await adapter.deleteFile("/path/to", "file.txt");
      expect(mockAPI.deleteFile).toHaveBeenCalledWith("/path/to", "file.txt");
    });

    it("should open file", async () => {
      await adapter.openFile("/path/to", "file.pdf");
      expect(mockAPI.openFile).toHaveBeenCalledWith("/path/to", "file.pdf");
    });

    it("should show file in folder", async () => {
      // showFileInFolder not implemented in electronAPI - just logs and returns undefined
      const result = await adapter.showFileInFolder("/path/to/file.txt");
      expect(result).toBeUndefined();
    });

    it("should throw when API not available for file operations", async () => {
      const adapterNoAPI = new IPCAdapter({});

      await expect(adapterNoAPI.uploadFile("/test", new ArrayBuffer(8), "test", "text/plain")).rejects.toThrow(
        "IPC API not available: uploadFile"
      );

      await expect(adapterNoAPI.deleteFile("/test", "file")).rejects.toThrow("IPC API not available: deleteFile");

      await expect(adapterNoAPI.openFile("/test", "file")).rejects.toThrow("IPC API not available: openFile");

      // showFileInFolder resolves gracefully when not available
      await expect(adapterNoAPI.showFileInFolder("/test")).resolves.toBeUndefined();
    });
  });

  describe("Dialog Operations", () => {
    it("should return null for openFileDialog (not implemented)", async () => {
      const result = await adapter.openFileDialog({
        filters: ["txt", "md"],
        multiple: true,
      });

      // openFileDialog not implemented - just warns and returns null
      expect(result).toBeNull();
    });

    it("should return null for openFileDialog without options (not implemented)", async () => {
      const result = await adapter.openFileDialog();
      // openFileDialog not implemented - just warns and returns null
      expect(result).toBeNull();
    });

    it("should return null for saveFileDialog (not implemented)", async () => {
      const result = await adapter.saveFileDialog({
        defaultPath: "/path/to/save.txt",
        filters: ["txt"],
      });

      // saveFileDialog not implemented - just warns and returns null
      expect(result).toBeNull();
    });

    it("should return null when API not available for dialogs", async () => {
      const adapterNoAPI = new IPCAdapter({});

      // Dialogs resolve to null when not available, they don't throw
      await expect(adapterNoAPI.openFileDialog()).resolves.toBeNull();
      await expect(adapterNoAPI.saveFileDialog()).resolves.toBeNull();
    });
  });

  describe("Version", () => {
    it("should get version", async () => {
      const version = await adapter.getVersion();
      // getVersion is a property, not a function
      expect(version).toBe("1.0.0");
    });

    it("should return default version when API not available", async () => {
      const adapterNoAPI = new IPCAdapter({});
      // Returns default "1.0.0" when not available
      await expect(adapterNoAPI.getVersion()).resolves.toBe("1.0.0");
    });
  });

  describe("Event Handlers", () => {
    it("should register bot message handler", () => {
      const callback = vi.fn();
      adapter.onBotMessage(callback);
      expect(mockAPI.onBotMessage).toHaveBeenCalledWith(callback);
    });

    it("should register bot error handler", () => {
      const callback = vi.fn();
      adapter.onPythonStderr(callback);
      expect(mockAPI.onBotError).toHaveBeenCalledWith(callback);
    });

    it("should register bot exit handler", () => {
      const callback = vi.fn();
      adapter.onPythonExit(callback);
      expect(mockAPI.onBotDisconnected).toHaveBeenCalledWith(callback);
    });

    it("should warn when API not available for event handlers", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      adapterNoAPI.onBotMessage(() => {});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: onBotMessage"));

      adapterNoAPI.onPythonStderr(() => {});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: onBotError"));

      adapterNoAPI.onPythonExit(() => {});
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: onBotDisconnected"));

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
      mockAPI.sendUserInput.mockRejectedValue(error);

      await expect(adapter.sendMessage("test")).rejects.toThrow("Backend connection failed");
    });

    it("should handle errors gracefully when API returns default values", async () => {
      // getVersion returns a property value, not a promise that can reject
      const version = await adapter.getVersion();
      expect(version).toBe("1.0.0");
    });
  });

  describe("Additional Methods", () => {
    it("should restart bot", async () => {
      await adapter.restartBot();
      expect(mockAPI.restartBot).toHaveBeenCalledTimes(1);
    });

    it("should handle restartBot when API not available", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      await expect(adapterNoAPI.restartBot()).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: restartBot"));

      consoleWarnSpy.mockRestore();
    });

    it("should open external URL", async () => {
      mockAPI.openExternalUrl = vi.fn().mockResolvedValue({ success: true });

      await adapter.openExternalUrl("https://example.com");

      expect(mockAPI.openExternalUrl).toHaveBeenCalledWith("https://example.com");
    });

    it("should handle openExternalUrl when API not available", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      const result = await adapterNoAPI.openExternalUrl("https://example.com");

      expect(result).toEqual({ success: false, error: "Not implemented" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: openExternalUrl"));

      consoleWarnSpy.mockRestore();
    });

    it("should get username", async () => {
      mockAPI.getUsername = vi.fn().mockResolvedValue("TestUser");

      const username = await adapter.getUsername();

      expect(username).toBe("TestUser");
      expect(mockAPI.getUsername).toHaveBeenCalledTimes(1);
    });

    it("should handle getUsername when API not available", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      const username = await adapterNoAPI.getUsername();

      expect(username).toBe("User");
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: getUsername"));

      consoleWarnSpy.mockRestore();
    });
  });

  describe("Generic IPC Methods", () => {
    it("should invoke method via channel", async () => {
      mockAPI.customMethod = vi.fn().mockResolvedValue({ result: "success" });

      const result = await adapter.invoke("customMethod", { param: "value" });

      expect(result).toEqual({ result: "success" });
      expect(mockAPI.customMethod).toHaveBeenCalledWith({ param: "value" });
    });

    it("should throw when invoke called with unavailable channel", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(adapter.invoke("nonExistentMethod", {})).rejects.toThrow(
        "IPC method not available: nonExistentMethod"
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("IPCAdapter.invoke(nonExistentMethod) - method not available")
      );

      consoleWarnSpy.mockRestore();
    });

    it("should send generic IPC message", async () => {
      const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      await adapter.send("test-channel", { data: "test" });

      expect(consoleDebugSpy).toHaveBeenCalledWith("IPC send: test-channel", { data: "test" });

      consoleDebugSpy.mockRestore();
    });

    it("should log to main process", () => {
      mockAPI.log = vi.fn();

      adapter.log("info", "Test message", { extra: "data" });

      expect(mockAPI.log).toHaveBeenCalledWith("info", "Test message", { extra: "data" });
    });

    it("should handle log when API not available", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      adapterNoAPI.log("info", "Test");

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: log"));

      consoleWarnSpy.mockRestore();
    });
  });
});
