import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionViewModel, formatTimestamp, generateDefaultTitle } from "@/viewmodels/session-viewmodel.js";

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
    // Test singular forms
    expect(formatTimestamp("2025-01-15T11:59:00Z")).toBe("1 minute ago");
    expect(formatTimestamp("2025-01-15T11:00:00Z")).toBe("1 hour ago");
    expect(formatTimestamp("2025-01-14T12:00:00Z")).toBe("1 day ago");
    // Test plural forms
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

  it("generates default titles correctly and handles invalid dates", () => {
    expect(generateDefaultTitle("invalid-date")).toBe("Untitled Chat");
    expect(generateDefaultTitle(null)).toBe("Untitled Chat");
  });
});
