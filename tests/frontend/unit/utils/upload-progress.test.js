import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock DOM elements before importing the module
let mockContainer;
let mockProgressBar;
let mockProgressText;

const createMockElements = () => {
  mockContainer = {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
  mockProgressBar = {
    style: { width: "" },
  };
  mockProgressText = {
    textContent: "",
  };
};

// Setup DOM mock
beforeEach(() => {
  createMockElements();
  vi.stubGlobal("document", {
    getElementById: vi.fn((id) => {
      if (id === "file-upload-progress") return mockContainer;
      if (id === "progress-bar-fill") return mockProgressBar;
      if (id === "progress-text") return mockProgressText;
      return null;
    }),
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe("upload-progress", () => {
  describe("startUploadProgress", () => {
    it("should initialize and show progress bar for single file", async () => {
      const { startUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      startUploadProgress(1);

      expect(mockProgressBar.style.width).toBe("0%");
      expect(mockProgressText.textContent).toBe("Preparing upload...");
      expect(mockContainer.classList.add).toHaveBeenCalledWith("active");
    });

    it("should show file count for multiple files", async () => {
      const { startUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      startUploadProgress(5);

      expect(mockProgressBar.style.width).toBe("0%");
      expect(mockProgressText.textContent).toBe("Uploading 0 of 5 files...");
      expect(mockContainer.classList.add).toHaveBeenCalledWith("active");
    });

    it("should reset state when starting new upload", async () => {
      const { startUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(3);
      completeFileUpload("file1.txt", true);
      completeFileUpload("file2.txt", true);

      // Start new upload - should reset
      startUploadProgress(2);

      expect(mockProgressBar.style.width).toBe("0%");
      expect(mockProgressText.textContent).toBe("Uploading 0 of 2 files...");
    });

    it("should handle missing DOM elements gracefully", async () => {
      document.getElementById = vi.fn(() => null);

      const { startUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      // Should not throw
      expect(() => startUploadProgress(1)).not.toThrow();
    });
  });

  describe("updateUploadProgress", () => {
    it("should update progress for single file with percent", async () => {
      const { startUploadProgress, updateUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(1);
      updateUploadProgress("document.pdf", 50);

      expect(mockProgressBar.style.width).toBe("50%");
      expect(mockProgressText.textContent).toBe("Uploading document.pdf");
    });

    it("should update progress for multiple files with percent", async () => {
      const { startUploadProgress, updateUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(4);
      updateUploadProgress("image.png", 75);

      // Base progress: 0/4 = 0%, file progress: 75/4 = 18.75%
      expect(mockProgressBar.style.width).toBe("18.75%");
      expect(mockProgressText.textContent).toBe("Uploading 1 of 4: image.png");
    });

    it("should handle update without percent", async () => {
      const { startUploadProgress, updateUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(1);
      updateUploadProgress("file.txt");

      expect(mockProgressBar.style.width).toBe("0%");
      expect(mockProgressText.textContent).toBe("Uploading file.txt");
    });

    it("should cap progress at 99% until complete", async () => {
      const { startUploadProgress, updateUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(1);
      updateUploadProgress("file.txt", 100);

      expect(mockProgressBar.style.width).toBe("99%");
    });

    it("should not update when not visible", async () => {
      const { updateUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      // Don't call startUploadProgress first
      updateUploadProgress("file.txt", 50);

      // Progress bar should not be updated
      expect(mockProgressBar.style.width).toBe("");
    });

    it("should calculate correct progress after completing files", async () => {
      const { startUploadProgress, completeFileUpload, updateUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(4);
      completeFileUpload("file1.txt", true); // 1/4 = 25% base

      updateUploadProgress("file2.txt", 50); // 25% + 50/4 = 37.5%

      expect(mockProgressBar.style.width).toBe("37.5%");
      expect(mockProgressText.textContent).toBe("Uploading 2 of 4: file2.txt");
    });
  });

  describe("completeFileUpload", () => {
    it("should increment completed count and update progress", async () => {
      const { startUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(4);
      completeFileUpload("file1.txt", true);

      expect(mockProgressBar.style.width).toBe("25%");
      expect(mockProgressText.textContent).toBe("Uploaded 1 of 4 files...");
    });

    it("should update text for multiple completed files", async () => {
      const { startUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(4);
      completeFileUpload("file1.txt", true);
      completeFileUpload("file2.txt", true);

      expect(mockProgressBar.style.width).toBe("50%");
      expect(mockProgressText.textContent).toBe("Uploaded 2 of 4 files...");
    });

    it("should not update text for single file uploads", async () => {
      const { startUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(1);
      mockProgressText.textContent = "Uploading test.txt";
      completeFileUpload("test.txt", true);

      // Text should not change for single file (will be set by finish)
      expect(mockProgressBar.style.width).toBe("100%");
    });

    it("should handle failed uploads", async () => {
      const { startUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(2);
      completeFileUpload("file1.txt", false);

      // Still increments progress
      expect(mockProgressBar.style.width).toBe("50%");
    });

    it("should not update when not visible", async () => {
      const { completeFileUpload } = await import("../../../../electron/renderer/utils/upload-progress.js");

      completeFileUpload("file.txt", true);

      expect(mockProgressBar.style.width).toBe("");
    });
  });

  describe("finishUploadProgress", () => {
    it("should show 100% and success message for single file", async () => {
      const { startUploadProgress, finishUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(1);
      finishUploadProgress(1, 0);

      expect(mockProgressBar.style.width).toBe("100%");
      expect(mockProgressText.textContent).toBe("Upload complete!");
    });

    it("should show success message for multiple files", async () => {
      const { startUploadProgress, finishUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(5);
      finishUploadProgress(5, 0);

      expect(mockProgressBar.style.width).toBe("100%");
      expect(mockProgressText.textContent).toBe("5 files uploaded!");
    });

    it("should show failure count when some uploads failed", async () => {
      const { startUploadProgress, finishUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(5);
      finishUploadProgress(3, 2);

      expect(mockProgressBar.style.width).toBe("100%");
      expect(mockProgressText.textContent).toBe("Completed: 3 uploaded, 2 failed");
    });

    it("should hide progress bar after delay", async () => {
      const { startUploadProgress, finishUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(1);
      finishUploadProgress(1, 0);

      expect(mockContainer.classList.remove).not.toHaveBeenCalled();

      // Fast-forward past the 800ms delay
      vi.advanceTimersByTime(800);

      expect(mockContainer.classList.remove).toHaveBeenCalledWith("active");
    });

    it("should not update when not visible", async () => {
      const { finishUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      finishUploadProgress(1, 0);

      expect(mockProgressBar.style.width).toBe("");
    });
  });

  describe("hideUploadProgress", () => {
    it("should remove active class and reset state", async () => {
      const { startUploadProgress, hideUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(3);
      hideUploadProgress();

      expect(mockContainer.classList.remove).toHaveBeenCalledWith("active");
    });

    it("should handle missing container gracefully", async () => {
      const { hideUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      // Container is null initially before init
      expect(() => hideUploadProgress()).not.toThrow();
    });
  });

  describe("isActive state tracking", () => {
    it("should track visibility state correctly through lifecycle", async () => {
      const { startUploadProgress, updateUploadProgress, hideUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      // Initially not visible - updates should be ignored
      updateUploadProgress("file.txt", 50);
      expect(mockProgressBar.style.width).toBe("");

      // Start makes it visible
      startUploadProgress(2);
      expect(mockProgressBar.style.width).toBe("0%");

      // Updates work when visible
      updateUploadProgress("file.txt", 50);
      expect(mockProgressBar.style.width).toBe("25%");

      // Complete works when visible
      completeFileUpload("file.txt", true);
      expect(mockProgressBar.style.width).toBe("50%");

      // Hide makes it not visible
      hideUploadProgress();

      // Reset mock to verify next call
      mockProgressBar.style.width = "";

      // Updates ignored after hide
      updateUploadProgress("file2.txt", 75);
      expect(mockProgressBar.style.width).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should handle zero file count", async () => {
      const { startUploadProgress, finishUploadProgress } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(0);
      finishUploadProgress(0, 0);

      expect(mockProgressText.textContent).toBe("0 files uploaded!");
    });

    it("should handle rapid successive calls", async () => {
      const { startUploadProgress, updateUploadProgress, completeFileUpload } = await import(
        "../../../../electron/renderer/utils/upload-progress.js"
      );

      startUploadProgress(3);
      updateUploadProgress("file1.txt", 25);
      updateUploadProgress("file1.txt", 50);
      updateUploadProgress("file1.txt", 75);
      updateUploadProgress("file1.txt", 100);
      completeFileUpload("file1.txt", true);
      updateUploadProgress("file2.txt", 50);

      // Base progress: 1/3 = 33.33%, file progress: 50/3 = 16.67%, total = 50%
      expect(mockProgressBar.style.width).toBe("50%");
    });

    it("should reinitialize if DOM elements become available later", async () => {
      // Start with no elements
      document.getElementById = vi.fn(() => null);

      const { startUploadProgress } = await import("../../../../electron/renderer/utils/upload-progress.js");

      startUploadProgress(1);
      // Should not throw, just return early

      // Now elements are available
      createMockElements();
      document.getElementById = vi.fn((id) => {
        if (id === "file-upload-progress") return mockContainer;
        if (id === "progress-bar-fill") return mockProgressBar;
        if (id === "progress-text") return mockProgressText;
        return null;
      });

      // Should work now
      startUploadProgress(2);

      expect(mockProgressBar.style.width).toBe("0%");
      expect(mockProgressText.textContent).toBe("Uploading 0 of 2 files...");
    });
  });
});
