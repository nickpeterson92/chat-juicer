/**
 * SessionViewModel Unit Tests
 */

import { describe, expect, it } from "vitest";
import {
  calculateSessionAge,
  createSessionListViewModel,
  createSessionViewModel,
  formatTimestamp,
  generateDefaultTitle,
  groupSessionsByPeriod,
  truncateSessionTitle,
  validateSession,
} from "@/viewmodels/session-viewmodel.js";

describe("SessionViewModel", () => {
  describe("formatTimestamp", () => {
    it("should format recent timestamp as 'Just now'", () => {
      const now = Date.now();
      expect(formatTimestamp(now)).toBe("Just now");
    });

    it("should format minutes ago", () => {
      const timestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      expect(formatTimestamp(timestamp)).toBe("5 minutes ago");
    });

    it("should format single minute correctly", () => {
      const timestamp = Date.now() - 60 * 1000; // 1 minute ago
      expect(formatTimestamp(timestamp)).toBe("1 minute ago");
    });

    it("should format hours ago", () => {
      const timestamp = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
      expect(formatTimestamp(timestamp)).toBe("3 hours ago");
    });

    it("should format single hour correctly", () => {
      const timestamp = Date.now() - 60 * 60 * 1000; // 1 hour ago
      expect(formatTimestamp(timestamp)).toBe("1 hour ago");
    });

    it("should format days ago", () => {
      const timestamp = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
      expect(formatTimestamp(timestamp)).toBe("5 days ago");
    });

    it("should format single day correctly", () => {
      const timestamp = Date.now() - 24 * 60 * 60 * 1000; // 1 day ago
      expect(formatTimestamp(timestamp)).toBe("1 day ago");
    });

    it("should format old dates as date string", () => {
      const timestamp = new Date("2025-01-15").getTime();
      const formatted = formatTimestamp(timestamp);

      expect(formatted).toMatch(/Jan 15/);
    });

    it("should handle null timestamp", () => {
      expect(formatTimestamp(null)).toBe("Unknown");
    });

    it("should handle invalid timestamp", () => {
      expect(formatTimestamp("invalid")).toBe("Invalid date");
    });
  });

  describe("generateDefaultTitle", () => {
    it("should generate title with date", () => {
      const timestamp = new Date("2025-01-15T10:30:00").getTime();
      const title = generateDefaultTitle(timestamp);

      expect(title).toMatch(/Chat - Jan 15/);
    });

    it("should handle null timestamp", () => {
      expect(generateDefaultTitle(null)).toBe("Untitled Chat");
    });

    it("should handle invalid timestamp", () => {
      expect(generateDefaultTitle("invalid")).toBe("Untitled Chat");
    });
  });

  describe("createSessionViewModel", () => {
    it("should create view model for session", () => {
      const session = {
        session_id: "session-1",
        title: "My Chat",
        created_at: Date.now() - 60 * 60 * 1000, // 1 hour ago
        updated_at: Date.now() - 30 * 60 * 1000, // 30 min ago
      };

      const vm = createSessionViewModel(session, false);

      expect(vm.id).toBe("session-1");
      expect(vm.title).toBe("My Chat");
      expect(vm.displayTitle).toBe("My Chat");
      expect(vm.isActive).toBe(false);
      expect(vm.classes).toBe("session-item");
    });

    it("should mark active session", () => {
      const session = {
        session_id: "session-1",
        title: "My Chat",
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const vm = createSessionViewModel(session, true);

      expect(vm.isActive).toBe(true);
      expect(vm.classes).toBe("session-item active");
    });

    it("should generate default title if missing", () => {
      const session = {
        session_id: "session-1",
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const vm = createSessionViewModel(session);

      expect(vm.title).toMatch(/Chat -/);
    });

    it("should use updated_at for formatted date", () => {
      const session = {
        session_id: "session-1",
        title: "Chat",
        created_at: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
        updated_at: Date.now() - 60 * 60 * 1000, // 1 hour ago
      };

      const vm = createSessionViewModel(session);

      expect(vm.formattedDate).toBe("1 hour ago");
    });

    it("should fallback to created_at if no updated_at", () => {
      const session = {
        session_id: "session-1",
        title: "Chat",
        created_at: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      };

      const vm = createSessionViewModel(session);

      expect(vm.formattedDate).toBe("2 hours ago");
    });

    it("should handle alternative id field", () => {
      const session = {
        id: "session-1", // Using 'id' instead of 'session_id'
        title: "Chat",
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const vm = createSessionViewModel(session);

      expect(vm.id).toBe("session-1");
    });
  });

  describe("createSessionListViewModel", () => {
    it("should create view models for multiple sessions", () => {
      const sessions = [
        { session_id: "session-1", title: "Chat 1", created_at: Date.now(), updated_at: Date.now() },
        { session_id: "session-2", title: "Chat 2", created_at: Date.now(), updated_at: Date.now() },
      ];

      const viewModels = createSessionListViewModel(sessions);

      expect(viewModels).toHaveLength(2);
      expect(viewModels[0].id).toBe("session-1");
      expect(viewModels[1].id).toBe("session-2");
    });

    it("should sort sessions by updated_at (most recent first)", () => {
      const sessions = [
        {
          session_id: "session-1",
          title: "Old",
          updated_at: new Date("2025-01-01").getTime(),
          created_at: new Date("2025-01-01").getTime(),
        },
        {
          session_id: "session-2",
          title: "Recent",
          updated_at: new Date("2025-01-15").getTime(),
          created_at: new Date("2025-01-15").getTime(),
        },
      ];

      const viewModels = createSessionListViewModel(sessions);

      expect(viewModels[0].id).toBe("session-2"); // Recent first
      expect(viewModels[1].id).toBe("session-1");
    });

    it("should mark active session", () => {
      const sessions = [
        { session_id: "session-1", title: "Chat 1", created_at: Date.now(), updated_at: Date.now() },
        { session_id: "session-2", title: "Chat 2", created_at: Date.now(), updated_at: Date.now() },
      ];

      const viewModels = createSessionListViewModel(sessions, "session-1");

      expect(viewModels.find((vm) => vm.id === "session-1").isActive).toBe(true);
      expect(viewModels.find((vm) => vm.id === "session-2").isActive).toBe(false);
    });

    it("should handle empty array", () => {
      const viewModels = createSessionListViewModel([]);

      expect(viewModels).toEqual([]);
    });

    it("should handle null input", () => {
      const viewModels = createSessionListViewModel(null);

      expect(viewModels).toEqual([]);
    });

    it("should not mutate original array", () => {
      const sessions = [
        {
          session_id: "session-1",
          title: "Chat 1",
          updated_at: new Date("2025-01-01").getTime(),
          created_at: new Date("2025-01-01").getTime(),
        },
        {
          session_id: "session-2",
          title: "Chat 2",
          updated_at: new Date("2025-01-02").getTime(),
          created_at: new Date("2025-01-02").getTime(),
        },
      ];

      const originalOrder = sessions.map((s) => s.session_id);
      createSessionListViewModel(sessions);

      expect(sessions.map((s) => s.session_id)).toEqual(originalOrder);
    });
  });

  describe("validateSession", () => {
    it("should validate valid session", () => {
      const session = { session_id: "session-1", title: "Chat" };
      const result = validateSession(session);

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("should accept session with id field", () => {
      const session = { id: "session-1", title: "Chat" };
      const result = validateSession(session);

      expect(result.valid).toBe(true);
    });

    it("should reject non-object", () => {
      const result = validateSession("not an object");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("object");
    });

    it("should reject session without id", () => {
      const session = { title: "Chat" };
      const result = validateSession(session);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("session_id");
    });

    it("should allow session without title", () => {
      // Title is optional
      const session = { session_id: "session-1" };
      const result = validateSession(session);

      expect(result.valid).toBe(true);
    });
  });

  describe("truncateSessionTitle", () => {
    it("should truncate long title", () => {
      const title = "A".repeat(100);
      const truncated = truncateSessionTitle(title, 50);

      expect(truncated.length).toBe(53); // 50 + "..."
      expect(truncated.endsWith("...")).toBe(true);
    });

    it("should not truncate short title", () => {
      const title = "Short Title";
      const truncated = truncateSessionTitle(title, 50);

      expect(truncated).toBe("Short Title");
    });

    it("should use default max length", () => {
      const title = "A".repeat(100);
      const truncated = truncateSessionTitle(title);

      expect(truncated.length).toBe(53); // 50 (default) + "..."
    });

    it("should handle null title", () => {
      const truncated = truncateSessionTitle(null);

      expect(truncated).toBe("Untitled");
    });

    it("should handle empty title", () => {
      const truncated = truncateSessionTitle("");

      expect(truncated).toBe("Untitled");
    });
  });

  describe("calculateSessionAge", () => {
    it("should calculate age in days", () => {
      const timestamp = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
      const age = calculateSessionAge(timestamp);

      expect(age).toBe(5);
    });

    it("should return 0 for recent sessions", () => {
      const timestamp = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago
      const age = calculateSessionAge(timestamp);

      expect(age).toBe(0);
    });

    it("should handle null timestamp", () => {
      const age = calculateSessionAge(null);

      expect(age).toBe(0);
    });

    it("should handle invalid timestamp", () => {
      const age = calculateSessionAge("invalid");

      expect(age).toBe(0);
    });

    it("should not return negative age", () => {
      const future = Date.now() + 24 * 60 * 60 * 1000; // 1 day in future
      const age = calculateSessionAge(future);

      expect(age).toBe(0);
    });
  });

  describe("groupSessionsByPeriod", () => {
    it("should group sessions by time period", () => {
      const now = Date.now();
      const sessions = [
        { session_id: "1", updated_at: now - 30 * 60 * 1000 }, // Today
        { session_id: "2", updated_at: now - 25 * 60 * 60 * 1000 }, // Yesterday
        { session_id: "3", updated_at: now - 3 * 24 * 60 * 60 * 1000 }, // This week
        { session_id: "4", updated_at: now - 10 * 24 * 60 * 60 * 1000 }, // Older
      ];

      const groups = groupSessionsByPeriod(sessions);

      expect(groups.today).toHaveLength(1);
      expect(groups.yesterday).toHaveLength(1);
      expect(groups.thisWeek).toHaveLength(1);
      expect(groups.older).toHaveLength(1);
    });

    it("should handle empty array", () => {
      const groups = groupSessionsByPeriod([]);

      expect(groups.today).toEqual([]);
      expect(groups.yesterday).toEqual([]);
      expect(groups.thisWeek).toEqual([]);
      expect(groups.older).toEqual([]);
    });

    it("should handle null input", () => {
      const groups = groupSessionsByPeriod(null);

      expect(groups.today).toEqual([]);
    });

    it("should use updated_at or created_at", () => {
      const now = Date.now();
      const sessions = [
        { session_id: "1", created_at: now - 30 * 60 * 1000 }, // No updated_at
        { session_id: "2", updated_at: now - 30 * 60 * 1000 }, // Has updated_at
      ];

      const groups = groupSessionsByPeriod(sessions);

      expect(groups.today).toHaveLength(2);
    });

    it("should handle sessions exactly at boundaries", () => {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const sessions = [
        { session_id: "1", updated_at: now - oneDayMs + 1000 }, // Just under 1 day - Today
        { session_id: "2", updated_at: now - oneDayMs - 1000 }, // Just over 1 day - Yesterday
      ];

      const groups = groupSessionsByPeriod(sessions);

      expect(groups.today).toHaveLength(1);
      expect(groups.yesterday).toHaveLength(1);
    });
  });
});
