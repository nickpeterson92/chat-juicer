/**
 * Extended State Management Unit Tests
 * Tests for Phase 1: Foundation - New state namespaces and validation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppState, BoundedMap } from "@/core/state.js";

describe("AppState - Phase 1 Extensions", () => {
  let appState;

  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = { log: vi.fn() };
    appState = new AppState();
  });

  describe("Session State", () => {
    it("should initialize session state with defaults", () => {
      expect(appState.session).toEqual({
        current: null,
        list: [],
        isLoading: false,
        hasMore: false,
        totalCount: 0,
      });
    });

    it("should update session.current", () => {
      appState.setState("session.current", "session-123");

      expect(appState.session.current).toBe("session-123");
    });

    it("should update session.list", () => {
      const sessions = [
        { session_id: "session-1", title: "Session 1" },
        { session_id: "session-2", title: "Session 2" },
      ];

      appState.setState("session.list", sessions);

      expect(appState.session.list).toEqual(sessions);
      expect(appState.session.list).toHaveLength(2);
    });

    it("should update session.isLoading", () => {
      appState.setState("session.isLoading", true);

      expect(appState.session.isLoading).toBe(true);
    });

    it("should update session.hasMore", () => {
      appState.setState("session.hasMore", true);

      expect(appState.session.hasMore).toBe(true);
    });

    it("should update session.totalCount", () => {
      appState.setState("session.totalCount", 42);

      expect(appState.session.totalCount).toBe(42);
    });

    it("should notify listeners on session state changes", () => {
      const callback = vi.fn();
      appState.subscribe("session.current", callback);

      appState.setState("session.current", "session-456");

      expect(callback).toHaveBeenCalledWith("session-456", null, "session.current");
    });
  });

  describe("Files State", () => {
    it("should initialize files state with defaults", () => {
      expect(appState.files).toEqual({
        uploaded: [],
        dragActive: false,
        isUploading: false,
        uploadProgress: null,
        activeDirectory: null,
        sourcesList: [],
        outputList: [],
        isLoadingFiles: false,
      });
    });

    it("should update files.sourcesList", () => {
      const sources = [
        { name: "doc1.pdf", size: 10240 },
        { name: "doc2.txt", size: 2048 },
      ];

      appState.setState("files.sourcesList", sources);

      expect(appState.files.sourcesList).toEqual(sources);
      expect(appState.files.sourcesList).toHaveLength(2);
    });

    it("should update files.outputList", () => {
      const outputs = [{ name: "report.docx", size: 51200 }];

      appState.setState("files.outputList", outputs);

      expect(appState.files.outputList).toEqual(outputs);
      expect(appState.files.outputList).toHaveLength(1);
    });

    it("should update files.isLoadingFiles", () => {
      appState.setState("files.isLoadingFiles", true);

      expect(appState.files.isLoadingFiles).toBe(true);
    });

    it("should update files.uploaded", () => {
      const files = [
        { name: "file1.txt", size: 1024 },
        { name: "file2.pdf", size: 2048 },
      ];

      appState.setState("files.uploaded", files);

      expect(appState.files.uploaded).toEqual(files);
      expect(appState.files.uploaded).toHaveLength(2);
    });

    it("should update files.dragActive", () => {
      appState.setState("files.dragActive", true);

      expect(appState.files.dragActive).toBe(true);
    });

    it("should update files.isUploading", () => {
      appState.setState("files.isUploading", true);

      expect(appState.files.isUploading).toBe(true);
    });

    it("should update files.uploadProgress", () => {
      appState.setState("files.uploadProgress", 75);

      expect(appState.files.uploadProgress).toBe(75);
    });

    it("should reset uploadProgress to null", () => {
      appState.setState("files.uploadProgress", 50);
      appState.setState("files.uploadProgress", null);

      expect(appState.files.uploadProgress).toBeNull();
    });

    it("should notify listeners on files state changes", () => {
      const callback = vi.fn();
      appState.subscribe("files.dragActive", callback);

      appState.setState("files.dragActive", true);

      expect(callback).toHaveBeenCalledWith(true, false, "files.dragActive");
    });
  });

  describe("UI State Extensions", () => {
    it("should initialize extended UI state", () => {
      expect(appState.ui.sidebarCollapsed).toBe(false);
      expect(appState.ui.cachedModelConfig).toBeNull();
      expect(appState.ui.welcomeModelConfig).toBeNull();
      expect(appState.ui.isInitialized).toBe(false);
    });

    it("should update ui.sidebarCollapsed", () => {
      appState.setState("ui.sidebarCollapsed", true);

      expect(appState.ui.sidebarCollapsed).toBe(true);
    });

    it("should update ui.cachedModelConfig", () => {
      const config = { model: "gpt-4", reasoningEffort: "medium" };
      appState.setState("ui.cachedModelConfig", config);

      expect(appState.ui.cachedModelConfig).toEqual(config);
    });

    it("should update ui.welcomeModelConfig", () => {
      const config = { model: "gpt-3.5-turbo", reasoningEffort: "low" };
      appState.setState("ui.welcomeModelConfig", config);

      expect(appState.ui.welcomeModelConfig).toEqual(config);
    });

    it("should update ui.isInitialized", () => {
      appState.setState("ui.isInitialized", true);

      expect(appState.ui.isInitialized).toBe(true);
    });

    it("should preserve existing UI state properties", () => {
      expect(appState.ui.theme).toBeDefined();
      expect(appState.ui.toolsPanelCollapsed).toBeDefined();
      expect(appState.ui.currentView).toBeDefined();
    });
  });

  describe("Message State Extensions", () => {
    it("should initialize extended message state", () => {
      expect(appState.message.isTyping).toBe(false);
      expect(appState.message.isStreaming).toBe(false);
      expect(appState.message.lastUser).toBeNull();
      expect(appState.message.lastAssistant).toBeNull();
    });

    it("should update message.isTyping", () => {
      appState.setState("message.isTyping", true);

      expect(appState.message.isTyping).toBe(true);
    });

    it("should update message.isStreaming", () => {
      appState.setState("message.isStreaming", true);

      expect(appState.message.isStreaming).toBe(true);
    });

    it("should update message.lastUser", () => {
      const userMsg = "Hello, assistant!";
      appState.setState("message.lastUser", userMsg);

      expect(appState.message.lastUser).toBe(userMsg);
    });

    it("should update message.lastAssistant", () => {
      const assistantMsg = "Hello, user!";
      appState.setState("message.lastAssistant", assistantMsg);

      expect(appState.message.lastAssistant).toBe(assistantMsg);
    });

    it("should preserve existing message state properties", () => {
      expect(appState.message.currentAssistant).toBeDefined();
      expect(appState.message.assistantBuffer).toBeDefined();
    });
  });

  describe("Validation Methods", () => {
    describe("validatePath", () => {
      it("should validate existing top-level path", () => {
        expect(appState.validatePath("connection")).toBe(true);
        expect(appState.validatePath("session")).toBe(true);
        expect(appState.validatePath("files")).toBe(true);
        expect(appState.validatePath("message")).toBe(true);
        expect(appState.validatePath("ui")).toBe(true);
        expect(appState.validatePath("python")).toBe(true);
        expect(appState.validatePath("functions")).toBe(true);
      });

      it("should validate existing nested path", () => {
        expect(appState.validatePath("connection.status")).toBe(true);
        expect(appState.validatePath("session.current")).toBe(true);
        expect(appState.validatePath("session.list")).toBe(true);
        expect(appState.validatePath("files.uploaded")).toBe(true);
        expect(appState.validatePath("files.dragActive")).toBe(true);
        expect(appState.validatePath("ui.sidebarCollapsed")).toBe(true);
        expect(appState.validatePath("message.isTyping")).toBe(true);
      });

      it("should validate deep nested paths", () => {
        expect(appState.validatePath("connection.isInitial")).toBe(true);
        expect(appState.validatePath("ui.cachedModelConfig")).toBe(true);
        expect(appState.validatePath("message.currentAssistant")).toBe(true);
      });

      it("should reject invalid top-level path", () => {
        expect(appState.validatePath("nonexistent")).toBe(false);
        expect(appState.validatePath("invalid")).toBe(false);
      });

      it("should reject invalid nested path", () => {
        expect(appState.validatePath("connection.invalid")).toBe(false);
        expect(appState.validatePath("session.nonexistent")).toBe(false);
        expect(appState.validatePath("files.invalid.deeply")).toBe(false);
      });

      it("should handle empty or null paths", () => {
        expect(appState.validatePath("")).toBe(false);
        expect(appState.validatePath(null)).toBe(false);
        expect(appState.validatePath(undefined)).toBe(false);
      });
    });

    describe("getValidPaths", () => {
      it("should return array of all valid paths", () => {
        const paths = appState.getValidPaths();

        expect(Array.isArray(paths)).toBe(true);
        expect(paths.length).toBeGreaterThan(0);
      });

      it("should include top-level namespaces", () => {
        const paths = appState.getValidPaths();

        expect(paths).toContain("connection");
        expect(paths).toContain("session");
        expect(paths).toContain("files");
        expect(paths).toContain("message");
        expect(paths).toContain("ui");
        expect(paths).toContain("python");
        expect(paths).toContain("functions");
      });

      it("should include nested paths", () => {
        const paths = appState.getValidPaths();

        expect(paths).toContain("connection.status");
        expect(paths).toContain("session.current");
        expect(paths).toContain("session.list");
        expect(paths).toContain("files.uploaded");
        expect(paths).toContain("files.dragActive");
        expect(paths).toContain("ui.sidebarCollapsed");
        expect(paths).toContain("message.isTyping");
      });

      it("should not include duplicate paths", () => {
        const paths = appState.getValidPaths();
        const uniquePaths = new Set(paths);

        expect(paths.length).toBe(uniquePaths.size);
      });

      it("should not include internal properties", () => {
        const paths = appState.getValidPaths();

        expect(paths).not.toContain("listeners");
        expect(paths).not.toContain("validatePath");
        expect(paths).not.toContain("getValidPaths");
      });
    });

    describe("debugSnapshot", () => {
      it("should return sanitized state snapshot", () => {
        const snapshot = appState.debugSnapshot();

        expect(snapshot).toBeDefined();
        expect(typeof snapshot).toBe("object");
      });

      it("should include all state namespaces", () => {
        const snapshot = appState.debugSnapshot();

        expect(snapshot.connection).toBeDefined();
        expect(snapshot.session).toBeDefined();
        expect(snapshot.files).toBeDefined();
        expect(snapshot.message).toBeDefined();
        expect(snapshot.ui).toBeDefined();
        expect(snapshot.python).toBeDefined();
        expect(snapshot.functions).toBeDefined();
      });

      it("should sanitize BoundedMap instances", () => {
        appState.functions.activeCalls.set("call-1", { data: "test" });
        const snapshot = appState.debugSnapshot();

        expect(snapshot.functions.activeCalls).toBeDefined();
        expect(snapshot.functions.activeCalls).not.toBeInstanceOf(BoundedMap);
        expect(typeof snapshot.functions.activeCalls).toBe("object");
      });

      it("should sanitize Set instances", () => {
        appState.functions.activeTimers.add("timer-1");
        const snapshot = appState.debugSnapshot();

        expect(snapshot.functions.activeTimers).toBeDefined();
        expect(snapshot.functions.activeTimers).not.toBeInstanceOf(Set);
        expect(Array.isArray(snapshot.functions.activeTimers)).toBe(true);
      });

      it("should deeply clone objects within Set instances", () => {
        // Add an object to the Set
        const originalObj = { id: "timer-1", callback: { nested: "value" } };
        appState.functions.activeTimers.add(originalObj);
        const snapshot = appState.debugSnapshot();

        // Get the cloned object from the snapshot
        const clonedObj = snapshot.functions.activeTimers.find((t) => t.id === "timer-1");

        expect(clonedObj).toBeDefined();
        expect(clonedObj).not.toBe(originalObj); // Different reference
        expect(clonedObj.callback).not.toBe(originalObj.callback); // Nested object also cloned
        expect(clonedObj.callback.nested).toBe("value"); // But value is preserved

        // Mutating the clone should not affect the original
        clonedObj.callback.nested = "mutated";
        expect(originalObj.callback.nested).toBe("value");
      });

      it("should not include internal listeners", () => {
        const snapshot = appState.debugSnapshot();

        expect(snapshot.listeners).toBeUndefined();
      });

      it("should return a deep copy, not reference", () => {
        const snapshot = appState.debugSnapshot();
        snapshot.session.current = "modified";

        expect(appState.session.current).toBeNull();
      });
    });
  });

  describe("Integration - New State Namespaces", () => {
    it("should handle session lifecycle with new state", () => {
      const callback = vi.fn();
      appState.subscribe("session.current", callback);

      // Load sessions
      appState.setState("session.isLoading", true);
      appState.setState("session.list", [{ session_id: "s1", title: "Session 1" }]);
      appState.setState("session.totalCount", 1);
      appState.setState("session.isLoading", false);

      // Switch session
      appState.setState("session.current", "s1");

      expect(appState.session.current).toBe("s1");
      expect(appState.session.list).toHaveLength(1);
      expect(appState.session.isLoading).toBe(false);
      expect(callback).toHaveBeenCalledWith("s1", null, "session.current");
    });

    it("should handle file upload lifecycle with new state", () => {
      const dragCallback = vi.fn();
      const uploadCallback = vi.fn();

      appState.subscribe("files.dragActive", dragCallback);
      appState.subscribe("files.isUploading", uploadCallback);

      // Drag start
      appState.setState("files.dragActive", true);

      // Upload start
      appState.setState("files.isUploading", true);
      appState.setState("files.uploadProgress", 0);

      // Upload progress
      appState.setState("files.uploadProgress", 50);

      // Upload complete
      appState.setState("files.uploadProgress", 100);
      appState.setState("files.isUploading", false);
      appState.setState("files.uploaded", [{ name: "test.txt", size: 1024 }]);

      expect(appState.files.uploaded).toHaveLength(1);
      expect(dragCallback).toHaveBeenCalled();
      expect(uploadCallback).toHaveBeenCalled();
    });

    it("should coordinate UI and session state", () => {
      // Welcome page with model selection
      appState.setState("ui.currentView", "welcome");
      appState.setState("ui.welcomeModelConfig", { model: "gpt-4" });

      // Create session and switch to chat
      appState.setState("session.current", "new-session");
      appState.setState("ui.currentView", "chat");
      appState.setState("ui.cachedModelConfig", { model: "gpt-4" });

      expect(appState.ui.currentView).toBe("chat");
      expect(appState.session.current).toBe("new-session");
      expect(appState.ui.cachedModelConfig).toEqual({ model: "gpt-4" });
    });

    it("should handle complex wildcard subscriptions across namespaces", () => {
      const wildcardCallback = vi.fn();
      appState.subscribe("*", wildcardCallback);

      appState.setState("session.current", "s1");
      appState.setState("files.uploaded", []);
      appState.setState("message.isTyping", true);
      appState.setState("ui.isInitialized", true);

      expect(wildcardCallback).toHaveBeenCalledTimes(4);
    });

    it("should validate paths before setState (if validation is used)", () => {
      const validPath = "session.current";
      const invalidPath = "nonexistent";

      const isValidPath = appState.validatePath(validPath);
      const isInvalidPath = appState.validatePath(invalidPath);

      expect(isValidPath).toBe(true);
      expect(isInvalidPath).toBe(false);

      // Valid path can be set
      appState.setState(validPath, "session-123");
      expect(appState.session.current).toBe("session-123");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null values in new state properties", () => {
      appState.setState("session.current", "session-1");
      appState.setState("session.current", null);

      expect(appState.session.current).toBeNull();
    });

    it("should handle empty arrays in session.list", () => {
      appState.setState("session.list", []);

      expect(appState.session.list).toEqual([]);
      expect(appState.session.list).toHaveLength(0);
    });

    it("should handle large session lists", () => {
      const largeSessions = Array.from({ length: 100 }, (_, i) => ({
        session_id: `session-${i}`,
        title: `Session ${i}`,
      }));

      appState.setState("session.list", largeSessions);

      expect(appState.session.list).toHaveLength(100);
    });

    it("should handle rapid state updates", () => {
      for (let i = 0; i < 100; i++) {
        appState.setState("files.uploadProgress", i);
      }

      expect(appState.files.uploadProgress).toBe(99);
    });

    it("should handle nested object references (setState stores by reference)", () => {
      const config = { model: "gpt-4", reasoningEffort: "medium" };
      appState.setState("ui.cachedModelConfig", config);

      // setState stores by reference (performance optimization)
      expect(appState.ui.cachedModelConfig).toBe(config);

      // If you need isolation, clone before setting
      const isolatedConfig = { ...config };
      appState.setState("ui.welcomeModelConfig", isolatedConfig);
      isolatedConfig.model = "gpt-3.5-turbo";

      expect(appState.ui.welcomeModelConfig.model).toBe("gpt-3.5-turbo");
    });
  });
});
