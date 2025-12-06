/**
 * SessionService Unit Tests
 * Updated for Phase 2 State Management Migration
 */

import { MockIPCAdapter } from "@test-helpers/MockIPCAdapter.js";
import { MockStorageAdapter } from "@test-helpers/MockStorageAdapter.js";
import { beforeEach, describe, expect, it } from "vitest";
import { AppState } from "@/core/state.js";
import { SessionService } from "@/services/session-service.js";

describe("SessionService", () => {
  let sessionService;
  let mockIPC;
  let mockStorage;
  let appState;

  beforeEach(() => {
    mockIPC = new MockIPCAdapter();
    mockStorage = new MockStorageAdapter();
    appState = new AppState();

    sessionService = new SessionService({
      ipcAdapter: mockIPC,
      storageAdapter: mockStorage,
      appState,
    });
  });

  describe("constructor", () => {
    it("should initialize with adapters and appState", () => {
      expect(sessionService.ipc).toBe(mockIPC);
      expect(sessionService.storage).toBe(mockStorage);
      expect(sessionService.appState).toBe(appState);
    });

    it("should have session state in AppState", () => {
      expect(appState.getState("session.current")).toBeNull();
      expect(appState.getState("session.list")).toEqual([]);
      expect(appState.getState("session.totalCount")).toBe(0);
      expect(appState.getState("session.hasMore")).toBe(false);
      expect(appState.getState("session.isLoading")).toBe(false);
    });
  });

  describe("loadSessions", () => {
    it("should load sessions from backend and update AppState", async () => {
      const mockSessions = [
        { session_id: "session-1", title: "Chat 1" },
        { session_id: "session-2", title: "Chat 2" },
      ];

      mockIPC.setResponse("session-command", {
        sessions: mockSessions,
        total_count: 2,
        has_more: false,
      });

      const result = await sessionService.loadSessions();

      expect(result.success).toBe(true);
      expect(result.sessions).toEqual(mockSessions);
      expect(appState.getState("session.list")).toEqual(mockSessions);
      expect(appState.getState("session.totalCount")).toBe(2);
      expect(appState.getState("session.hasMore")).toBe(false);
    });

    it("should handle pagination", async () => {
      mockIPC.setResponse("session-command", {
        sessions: [{ session_id: "session-3" }],
        total_count: 3,
        has_more: false,
      });

      await sessionService.loadSessions(2, 1);

      const calls = mockIPC.getCalls("session-command");
      expect(calls[0].data.offset).toBe(2);
      expect(calls[0].data.limit).toBe(1);
    });

    it("should append to existing sessions on pagination", async () => {
      // First load
      mockIPC.setResponse("session-command", {
        sessions: [{ session_id: "session-1" }],
        total_count: 2,
        has_more: true,
      });
      await sessionService.loadSessions(0, 1);

      // Second load
      mockIPC.setResponse("session-command", {
        sessions: [{ session_id: "session-2" }],
        total_count: 2,
        has_more: false,
      });
      await sessionService.loadSessions(1, 1);

      const sessions = appState.getState("session.list");
      expect(sessions).toHaveLength(2);
      expect(sessions[0].session_id).toBe("session-1");
      expect(sessions[1].session_id).toBe("session-2");
    });

    it("should prevent concurrent loads", async () => {
      mockIPC.setResponse("session-command", {
        sessions: [],
        total_count: 0,
        has_more: false,
      });

      // Set loading state via AppState
      appState.setState("session.isLoading", true);

      const result = await sessionService.loadSessions();

      expect(result.success).toBe(false);
      expect(result.error).toContain("loading");
    });

    it("should handle backend errors", async () => {
      mockIPC.setResponse("session-command", new Error("Backend error"));

      const result = await sessionService.loadSessions();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Backend error");
    });
  });

  describe("loadMoreSessions", () => {
    it("should load next page", async () => {
      appState.setState("session.list", [{ session_id: "session-1" }]);
      appState.setState("session.hasMore", true);

      mockIPC.setResponse("session-command", {
        sessions: [{ session_id: "session-2" }],
        total_count: 2,
        has_more: false,
      });

      const result = await sessionService.loadMoreSessions();

      expect(result.success).toBe(true);
      const sessions = appState.getState("session.list");
      expect(sessions).toHaveLength(2);
    });

    it("should not load if no more sessions", async () => {
      appState.setState("session.hasMore", false);

      const result = await sessionService.loadMoreSessions();

      expect(result.success).toBe(false);
    });
  });

  describe("createSession", () => {
    it("should create new session and update AppState", async () => {
      mockIPC.setResponse("session-command", {
        session_id: "new-session",
        title: "New Chat",
      });

      const result = await sessionService.createSession({ title: "New Chat" });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("new-session");
      expect(appState.getState("session.current")).toBe("new-session");
    });

    it("should pass all options to backend", async () => {
      mockIPC.setResponse("session-command", { session_id: "new-session" });

      await sessionService.createSession({
        title: "Test",
        mcpConfig: ["server1"],
        model: "gpt-4",
        reasoningEffort: "high",
      });

      const calls = mockIPC.getCalls("session-command");
      expect(calls[0].data.title).toBe("Test");
      expect(calls[0].data.mcp_config).toEqual(["server1"]);
      expect(calls[0].data.model).toBe("gpt-4");
      expect(calls[0].data.reasoning_effort).toBe("high");
    });

    it("should handle creation errors", async () => {
      mockIPC.setResponse("session-command", new Error("Creation failed"));

      const result = await sessionService.createSession();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Creation failed");
    });
  });

  describe("switchSession", () => {
    it("should switch to different session and update AppState", async () => {
      mockIPC.setResponse("session-command", {
        session: { session_id: "session-2" },
        full_history: [{ role: "user", content: "Hello" }],
        message_count: 1,
      });

      const result = await sessionService.switchSession("session-2");

      expect(result.success).toBe(true);
      expect(result.session.session_id).toBe("session-2");
      expect(result.fullHistory).toHaveLength(1);
      expect(appState.getState("session.current")).toBe("session-2");
    });

    it("should reject switching to current session", async () => {
      appState.setState("session.current", "session-1");

      const result = await sessionService.switchSession("session-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Already");
    });

    it("should require session ID", async () => {
      const result = await sessionService.switchSession(null);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No session ID");
    });
  });

  describe("deleteSession", () => {
    it("should delete session and update AppState", async () => {
      appState.setState("session.list", [{ session_id: "session-1" }, { session_id: "session-2" }]);
      mockIPC.setResponse("session-command", { success: true });

      const result = await sessionService.deleteSession("session-1");

      expect(result.success).toBe(true);
      const sessions = appState.getState("session.list");
      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe("session-2");
    });

    it("should clear current session if deleting active", async () => {
      appState.setState("session.current", "session-1");
      mockIPC.setResponse("session-command", { success: true });

      await sessionService.deleteSession("session-1");

      expect(appState.getState("session.current")).toBeNull();
    });

    it("should handle backend error response", async () => {
      mockIPC.setResponse("session-command", { success: false, error: "Not found" });

      const result = await sessionService.deleteSession("session-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not found");
    });
  });

  describe("renameSession", () => {
    it("should rename session and update AppState", async () => {
      appState.setState("session.list", [{ session_id: "session-1", title: "Old Title" }]);
      mockIPC.setResponse("session-command", { success: true });

      const result = await sessionService.renameSession("session-1", "New Title");

      expect(result.success).toBe(true);
      const sessions = appState.getState("session.list");
      expect(sessions[0].title).toBe("New Title");
    });

    it("should trim title", async () => {
      appState.setState("session.list", [{ session_id: "session-1", title: "Old" }]);
      mockIPC.setResponse("session-command", { success: true });

      const result = await sessionService.renameSession("session-1", "  New Title  ");

      expect(result.title).toBe("New Title");
      const sessions = appState.getState("session.list");
      expect(sessions[0].title).toBe("New Title");
    });

    it("should reject empty title", async () => {
      const result = await sessionService.renameSession("session-1", "");

      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
    });

    it("should require session ID", async () => {
      const result = await sessionService.renameSession(null, "Title");

      expect(result.success).toBe(false);
      expect(result.error).toContain("session ID");
    });
  });

  describe("summarizeSession", () => {
    it("should summarize current session", async () => {
      mockIPC.setResponse("session-command", {
        success: true,
        message: "Summarized successfully",
      });

      const result = await sessionService.summarizeSession();

      expect(result.success).toBe(true);
      expect(result.message).toBe("Summarized successfully");
    });

    it("should handle summarization errors", async () => {
      mockIPC.setResponse("session-command", { success: false, error: "No session" });

      const result = await sessionService.summarizeSession();

      expect(result.success).toBe(false);
      expect(result.error).toBe("No session");
    });
  });

  describe("clearCurrentSession", () => {
    it("should clear current session in AppState", async () => {
      appState.setState("session.current", "session-1");
      mockIPC.setResponse("session-command", { success: true });

      const result = await sessionService.clearCurrentSession();

      expect(result.success).toBe(true);
      expect(appState.getState("session.current")).toBeNull();
    });
  });

  describe("loadMoreMessages", () => {
    it("should load more messages for session", async () => {
      mockIPC.setResponse("session-command", {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
        ],
      });

      const result = await sessionService.loadMoreMessages("session-1", 100, 50);

      expect(result.success).toBe(true);
      expect(result.messages).toHaveLength(2);
    });

    it("should require session ID", async () => {
      const result = await sessionService.loadMoreMessages(null, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain("session ID");
    });

    it("should handle backend errors", async () => {
      mockIPC.setResponse("session-command", { error: "Load failed" });

      const result = await sessionService.loadMoreMessages("session-1", 0);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Load failed");
    });
  });

  describe("getCurrentSessionId", () => {
    it("should return current session ID from AppState", () => {
      appState.setState("session.current", "session-1");

      expect(sessionService.getCurrentSessionId()).toBe("session-1");
    });

    it("should return null when no current session", () => {
      expect(sessionService.getCurrentSessionId()).toBeNull();
    });
  });

  describe("getSessions", () => {
    it("should return copy of sessions array from AppState", () => {
      const mockSessions = [{ session_id: "session-1" }];
      appState.setState("session.list", mockSessions);

      const sessions = sessionService.getSessions();

      expect(sessions).toEqual(mockSessions);
      expect(sessions).not.toBe(mockSessions); // Copy, not reference
    });
  });

  describe("getSession", () => {
    it("should return session by ID from AppState", () => {
      appState.setState("session.list", [
        { session_id: "session-1", title: "Chat 1" },
        { session_id: "session-2", title: "Chat 2" },
      ]);

      const session = sessionService.getSession("session-2");

      expect(session).toBeDefined();
      expect(session.title).toBe("Chat 2");
    });

    it("should return null for non-existent session", () => {
      const session = sessionService.getSession("non-existent");

      expect(session).toBeNull();
    });
  });

  describe("getPaginationState", () => {
    it("should return pagination information from AppState", () => {
      appState.setState("session.totalCount", 100);
      appState.setState("session.list", new Array(50));
      appState.setState("session.hasMore", true);
      appState.setState("session.isLoading", false);

      const state = sessionService.getPaginationState();

      expect(state.total).toBe(100);
      expect(state.loaded).toBe(50);
      expect(state.hasMore).toBe(true);
      expect(state.isLoading).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all service state in AppState", () => {
      appState.setState("session.current", "session-1");
      appState.setState("session.list", [{ session_id: "session-1" }]);
      appState.setState("session.totalCount", 1);
      appState.setState("session.hasMore", true);

      sessionService.reset();

      expect(appState.getState("session.current")).toBeNull();
      expect(appState.getState("session.list")).toEqual([]);
      expect(appState.getState("session.totalCount")).toBe(0);
      expect(appState.getState("session.hasMore")).toBe(false);
      expect(appState.getState("session.isLoading")).toBe(false);
    });
  });
});
