import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateSessionAge,
  createSessionListViewModel,
  createSessionViewModel,
  formatTimestamp,
  generateDefaultTitle,
  truncateSessionTitle,
  validateSession,
} from "@/viewmodels/session-viewmodel.js";

describe("SessionViewModel", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("formats timestamps across relative ranges and handles invalid input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    expect(formatTimestamp("bad")).toBe("Invalid date");
    expect(formatTimestamp(null)).toBe("Unknown");
    expect(formatTimestamp("2025-01-15T11:59:30Z")).toBe("Just now");
    expect(formatTimestamp("2025-01-15T11:10:00Z")).toBe("50 minutes ago");
    expect(formatTimestamp("2025-01-15T10:00:00Z")).toBe("2 hours ago");
    expect(formatTimestamp("2025-01-13T12:00:00Z")).toBe("2 days ago");
  });

  it("creates session view models with defaults and active class", () => {
    const session = {
      session_id: "s1",
      created_at: "2025-01-15T10:00:00Z",
      updated_at: "2025-01-15T11:00:00Z",
    };

    const vm = createSessionViewModel(session, true);
    expect(vm.id).toBe("s1");
    expect(vm.displayTitle).toContain("Chat -"); // default title
    expect(vm.formattedDate).toMatch(/ago|Jan/);
    expect(vm.classes).toBe("session-item active");
  });

  it("sorts sessions by recency and marks active in list view model", () => {
    const sessions = [
      { session_id: "a", title: "Old", created_at: "2025-01-10T00:00:00Z", updated_at: "2025-01-10T00:00:00Z" },
      { session_id: "b", title: "New", created_at: "2025-01-12T00:00:00Z", updated_at: "2025-01-12T00:00:00Z" },
    ];

    const list = createSessionListViewModel(sessions, "b");
    expect(list[0].id).toBe("b");
    expect(list[0].isActive).toBe(true);
    expect(list[1].id).toBe("a");
  });

  it("validates session objects", () => {
    expect(validateSession(null)).toEqual({ valid: false, error: "Session must be an object" });
    expect(validateSession({ title: "No id" })).toEqual({ valid: false, error: "Session must have session_id or id" });
    expect(validateSession({ session_id: "ok" })).toEqual({ valid: true, error: null });
  });

  it("truncates titles and generates defaults", () => {
    expect(truncateSessionTitle("short", 10)).toBe("short");
    expect(truncateSessionTitle("a".repeat(60), 10)).toBe(`${"a".repeat(10)}...`);
    expect(truncateSessionTitle("")).toBe("Untitled");

    expect(generateDefaultTitle("invalid-date")).toBe("Untitled Chat");
  });

  it("calculates session age in days safely", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T00:00:00Z"));
    expect(calculateSessionAge("bad")).toBe(0);
    expect(calculateSessionAge("2025-01-10T00:00:00Z")).toBe(5);
    expect(calculateSessionAge("2026-01-10T00:00:00Z")).toBe(0); // future dates clamp to 0
  });
});
