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

    it("stores app state reference when injected", () => {
      const state = { status: "idle" };

      adapter.setAppState(state);

      expect(adapter.appState).toBe(state);
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
      // Messages are normalized to array format for batch support
      // Session ID is forwarded as second argument (null when not provided)
      expect(mockAPI.sendUserInput).toHaveBeenCalledWith(["Hello World"], null);
      expect(mockAPI.sendUserInput).toHaveBeenCalledTimes(1);
    });

    it("should pass through array messages without re-wrapping", async () => {
      await adapter.sendMessage(["Hello", "World"]);

      expect(mockAPI.sendUserInput).toHaveBeenCalledWith(["Hello", "World"], null);
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

  describe("Stream Control", () => {
    it("should interrupt stream when API is available", async () => {
      mockAPI.interruptStream = vi.fn().mockResolvedValue({ success: true });

      const result = await adapter.interruptStream("session-123");

      expect(result).toEqual({ success: true });
      expect(mockAPI.interruptStream).toHaveBeenCalledWith("session-123");
    });

    it("should return default interrupt response when API is missing", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});

      const result = await adapterNoAPI.interruptStream("session-123");

      expect(result).toEqual({ success: false, error: "Not implemented" });
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: interruptStream"));

      consoleWarnSpy.mockRestore();
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

    it("should calculate size for base64 payloads", async () => {
      const base64Data = "YWJj"; // length 4 -> size 3 bytes

      await adapter.uploadFile("/path/to/file", base64Data, "encoded.bin", "application/octet-stream");

      const call = mockAPI.uploadFile.mock.calls[0][0];
      expect(call.size).toBe(3);
      expect(call.data).toBe(base64Data);
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

  describe("Command Queue", () => {
    it("should return early when queue is empty", async () => {
      const executeSpy = vi.spyOn(adapter, "_executeSessionCommand");

      await adapter.processQueue();

      expect(executeSpy).not.toHaveBeenCalled();
    });

    it("should process queued commands in order", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const resolve = vi.fn();
      const reject = vi.fn();
      const executeSpy = vi.spyOn(adapter, "_executeSessionCommand").mockResolvedValue("ok");

      adapter.commandQueue.push({
        command: "switch",
        data: { sessionId: "s-1" },
        resolve,
        reject,
      });

      await adapter.processQueue();

      expect(executeSpy).toHaveBeenCalledWith("switch", { sessionId: "s-1" });
      expect(resolve).toHaveBeenCalledWith("ok");
      expect(reject).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it("should reject queued commands when execution fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const resolve = vi.fn();
      const reject = vi.fn();
      const error = new Error("queue failure");

      vi.spyOn(adapter, "_executeSessionCommand").mockRejectedValue(error);

      adapter.commandQueue.push({
        command: "delete",
        data: { sessionId: "s-2" },
        resolve,
        reject,
      });

      await adapter.processQueue();

      expect(reject).toHaveBeenCalledWith(error);
      expect(resolve).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Toast helper", () => {
    it("should invoke toast utility via dynamic import", async () => {
      const toastModule = await import("@utils/toast.js");
      const showToastSpy = vi.spyOn(toastModule, "showToast");
      const container = document.createElement("div");

      container.id = "toast-container";
      document.body.appendChild(container);
      document.documentElement.style.setProperty("--color-status-info", "#123456");
      document.documentElement.style.setProperty("--color-status-success", "#123456");
      document.documentElement.style.setProperty("--color-status-warning", "#123456");
      document.documentElement.style.setProperty("--color-status-error", "#123456");

      await adapter._showToast("Hello", "info");
      await vi.waitFor(() => {
        expect(showToastSpy).toHaveBeenCalledWith("Hello", "info");
      });

      showToastSpy.mockRestore();
      container.remove();
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

  describe("Auth Operations", () => {
    beforeEach(() => {
      // Setup mock returns for auth methods
      mockAPI.authLogin = vi.fn().mockResolvedValue({ user: { id: 1 }, tokens: {} });
      mockAPI.authRegister = vi.fn().mockResolvedValue({ user: { id: 1 }, tokens: {} });
      mockAPI.authRefresh = vi.fn().mockResolvedValue({ accessToken: "new-token" });
      mockAPI.authLogout = vi.fn().mockResolvedValue({ success: true });
      mockAPI.authGetTokens = vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh" });
      mockAPI.authStoreTokens = vi.fn().mockResolvedValue({ success: true });
      mockAPI.authGetAccessToken = vi.fn().mockResolvedValue("access-token");
    });

    it("should login successfully", async () => {
      const result = await adapter.authLogin("test@example.com", "password");
      expect(mockAPI.authLogin).toHaveBeenCalledWith("test@example.com", "password");
      expect(result).toEqual({ user: { id: 1 }, tokens: {} });
    });

    it("should throw when API not available for login", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authLogin("email", "pass")).rejects.toThrow("IPC API not available: authLogin");
    });

    it("should register successfully", async () => {
      const result = await adapter.authRegister("test@example.com", "password", "Test User");
      expect(mockAPI.authRegister).toHaveBeenCalledWith("test@example.com", "password", "Test User");
      expect(result).toEqual({ user: { id: 1 }, tokens: {} });
    });

    it("should throw when API not available for register", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authRegister("email", "pass")).rejects.toThrow("IPC API not available: authRegister");
    });

    it("should refresh token successfully", async () => {
      const result = await adapter.authRefresh("refresh-token");
      expect(mockAPI.authRefresh).toHaveBeenCalledWith("refresh-token");
      expect(result).toEqual({ accessToken: "new-token" });
    });

    it("should throw when API not available for refresh", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authRefresh("token")).rejects.toThrow("IPC API not available: authRefresh");
    });

    it("should logout successfully", async () => {
      const result = await adapter.authLogout();
      expect(mockAPI.authLogout).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it("should throw when API not available for logout", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authLogout()).rejects.toThrow("IPC API not available: authLogout");
    });

    it("should get stored tokens", async () => {
      const result = await adapter.authGetTokens();
      expect(mockAPI.authGetTokens).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: "access", refreshToken: "refresh" });
    });

    it("should return null when API not available for get tokens", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authGetTokens()).resolves.toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: authGetTokens"));
      consoleWarnSpy.mockRestore();
    });

    it("should store tokens successfully", async () => {
      const result = await adapter.authStoreTokens("access", "refresh", { id: 1 });
      expect(mockAPI.authStoreTokens).toHaveBeenCalledWith("access", "refresh", { id: 1 });
      expect(result).toEqual({ success: true });
    });

    it("should throw when API not available for store tokens", async () => {
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authStoreTokens("a", "r")).rejects.toThrow("IPC API not available: authStoreTokens");
    });

    it("should get access token", async () => {
      const result = await adapter.authGetAccessToken();
      expect(mockAPI.authGetAccessToken).toHaveBeenCalled();
      expect(result).toBe("access-token");
    });

    it("should return null when API not available for get access token", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapterNoAPI = new IPCAdapter({});
      await expect(adapterNoAPI.authGetAccessToken()).resolves.toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("IPC API not available: authGetAccessToken"));
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
