/**
 * FilePanel Component Unit Tests
 * Phase 4 State Management Migration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globalLifecycleManager } from "@/core/lifecycle-manager.js";
import { AppState } from "@/core/state.js";
import { loadFilesIntoState, renderFileList } from "@/managers/file-manager.js";
import { FilePanel } from "@/ui/components/file-panel.js";

// Mock file-manager module
vi.mock("@/managers/file-manager.js", () => ({
  loadFilesIntoState: vi.fn().mockResolvedValue({ success: true, files: [] }),
  renderFileList: vi.fn(),
}));

const loadFilesIntoStateMock = loadFilesIntoState;
const renderFileListMock = renderFileList;

describe("FilePanel", () => {
  let panelElement;
  let toggleButton;
  let filesContainer;
  let refreshButton;
  let sourcesTab;
  let outputTab;
  let appState;

  beforeEach(() => {
    // Create mock DOM elements
    panelElement = document.createElement("div");
    panelElement.id = "files-panel";

    toggleButton = document.createElement("button");
    toggleButton.id = "open-files-btn";

    filesContainer = document.createElement("div");
    filesContainer.id = "files-container";

    refreshButton = document.createElement("button");
    refreshButton.id = "refresh-files-btn";

    sourcesTab = document.createElement("button");
    sourcesTab.id = "tab-sources";
    sourcesTab.dataset.directory = "sources";
    sourcesTab.classList.add("active");

    outputTab = document.createElement("button");
    outputTab.id = "tab-output";
    outputTab.dataset.directory = "output";

    appState = new AppState();

    loadFilesIntoStateMock.mockClear();
    renderFileListMock.mockClear();
    loadFilesIntoStateMock.mockResolvedValue({ success: true, files: [] });
    globalLifecycleManager.unmountAll();
  });

  afterEach(() => {
    globalLifecycleManager.unmountAll();
  });

  describe("constructor", () => {
    it("should initialize without appState (backwards compatibility)", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      expect(filePanel.panel).toBe(panelElement);
      expect(filePanel.appState).toBeNull();

      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "FilePanel");
      // 4 DOM listeners: toggle, refresh, two tabs
      expect(entry?.listeners ?? 0).toBe(4);
    });

    it("should initialize with appState", () => {
      const filePanel = new FilePanel(
        panelElement,
        toggleButton,
        filesContainer,
        refreshButton,
        sourcesTab,
        outputTab,
        { appState }
      );

      expect(filePanel.appState).toBe(appState);
      const snapshot = globalLifecycleManager.getDebugSnapshot();
      const entry = snapshot.components.find((c) => c.name === "FilePanel");
      // 7 total: 4 DOM + 3 appState subscriptions (session.current, files.outputList, files.sourcesList)
      expect(entry?.listeners).toBe(7);
    });

    it("should throw error without required elements", () => {
      expect(() => new FilePanel(null, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab)).toThrow(
        "FilePanel requires panel and container elements"
      );
    });
  });

  describe("AppState integration", () => {
    it("should subscribe to session.current", () => {
      const filePanel = new FilePanel(
        panelElement,
        toggleButton,
        filesContainer,
        refreshButton,
        sourcesTab,
        outputTab,
        { appState }
      );

      const setSessionSpy = vi.spyOn(filePanel, "setSession");

      // Change session in AppState
      appState.setState("session.current", "test-session-123");

      expect(setSessionSpy).toHaveBeenCalledWith("test-session-123");
    });

    it("should read getCurrentSession from AppState", () => {
      const filePanel = new FilePanel(
        panelElement,
        toggleButton,
        filesContainer,
        refreshButton,
        sourcesTab,
        outputTab,
        { appState }
      );

      appState.setState("session.current", "session-from-appstate");

      expect(filePanel.getCurrentSession()).toBe("session-from-appstate");
    });

    it("should fall back to internal state without appState", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      filePanel.setSession("internal-session");

      expect(filePanel.getCurrentSession()).toBe("internal-session");
    });
  });

  describe("setSession", () => {
    it("should update currentSessionId", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      filePanel.setSession("test-session");

      expect(filePanel.currentSessionId).toBe("test-session");
    });

    it("should clear session when null", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      filePanel.setSession("test-session");
      filePanel.setSession(null);

      expect(filePanel.currentSessionId).toBeNull();
    });
  });

  describe("toggle", () => {
    it("should toggle collapsed class", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      filePanel.toggle();
      expect(panelElement.classList.contains("collapsed")).toBe(true);

      filePanel.toggle();
      expect(panelElement.classList.contains("collapsed")).toBe(false);
    });
  });

  describe("show/hide", () => {
    it("should show panel", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      panelElement.classList.add("collapsed");

      filePanel.show();

      expect(filePanel.isVisible()).toBe(true);
    });

    it("should hide panel", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      filePanel.hide();

      expect(filePanel.isVisible()).toBe(false);
    });
  });

  describe("destroy", () => {
    it("should clean up AppState subscriptions", () => {
      const filePanel = new FilePanel(
        panelElement,
        toggleButton,
        filesContainer,
        refreshButton,
        sourcesTab,
        outputTab,
        { appState }
      );

      const snapshotBefore = globalLifecycleManager.getDebugSnapshot();
      const entryBefore = snapshotBefore.components.find((c) => c.name === "FilePanel");
      // 7 total: 4 DOM + 3 appState subscriptions (session.current, files.outputList, files.sourcesList)
      expect(entryBefore?.listeners).toBe(7);

      filePanel.destroy();

      const snapshotAfter = globalLifecycleManager.getDebugSnapshot();
      const entryAfter = snapshotAfter.components.find((c) => c.name === "FilePanel");
      expect(entryAfter).toBeUndefined();
    });

    it("should call closeAllHandles", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      const closeHandlesSpy = vi.spyOn(filePanel, "closeAllHandles");

      filePanel.destroy();

      expect(closeHandlesSpy).toHaveBeenCalled();
    });

    it("should work without appState", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      expect(() => filePanel.destroy()).not.toThrow();
    });
  });

  describe("closeAllHandles", () => {
    it("should remove file preview elements", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      // Add mock file preview
      const preview = document.createElement("div");
      preview.setAttribute("data-file-handle", "true");
      filesContainer.appendChild(preview);

      filePanel.closeAllHandles();

      expect(filesContainer.querySelectorAll("[data-file-handle]")).toHaveLength(0);
    });
  });

  describe("refresh", () => {
    it("should load files into state for the active tab", async () => {
      const filePanel = new FilePanel(
        panelElement,
        toggleButton,
        filesContainer,
        refreshButton,
        sourcesTab,
        outputTab,
        { appState }
      );

      filePanel.setSession("session-123");
      loadFilesIntoStateMock.mockClear();
      loadFilesIntoStateMock.mockResolvedValueOnce({ success: true, files: [] });

      await filePanel.refresh();

      expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/sources", "sources");
    });

    it("should resolve immediately when no session is set", async () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      await filePanel.refresh();

      expect(loadFilesIntoStateMock).not.toHaveBeenCalled();
    });

    it("should propagate errors from loadFilesIntoState", async () => {
      const filePanel = new FilePanel(
        panelElement,
        toggleButton,
        filesContainer,
        refreshButton,
        sourcesTab,
        outputTab,
        { appState }
      );
      filePanel.setSession("session-err");
      loadFilesIntoStateMock.mockClear();
      loadFilesIntoStateMock.mockRejectedValueOnce(new Error("load failed"));

      await expect(filePanel.refresh()).rejects.toThrow("load failed");
    });
  });

  describe("Phase 1: Folder Navigation", () => {
    describe("currentOutputPath state", () => {
      it("should initialize to empty string", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );

        expect(filePanel.currentOutputPath).toBe("");
      });

      it("should reset on tab switch", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");

        // Navigate into a folder
        filePanel.currentOutputPath = "code/python";

        // Switch to output tab
        loadFilesIntoStateMock.mockClear();
        await filePanel.switchTab(outputTab);

        expect(filePanel.currentOutputPath).toBe("");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output", "output");
      });

      it("should reset when switching to sources tab", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");

        // Navigate into a folder
        filePanel.currentOutputPath = "code/python";

        // Switch to sources tab
        loadFilesIntoStateMock.mockClear();
        await filePanel.switchTab(sourcesTab);

        expect(filePanel.currentOutputPath).toBe("");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/sources", "sources");
      });
    });

    describe("navigateToFolder", () => {
      it("should navigate from root to subfolder", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");

        // Switch to output tab first
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToFolder("code");

        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output/code", "output");
      });

      it("should navigate deeper into nested folders", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        // Navigate to first level
        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToFolder("code");
        expect(filePanel.currentOutputPath).toBe("code");

        // Navigate to second level
        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToFolder("python");
        expect(filePanel.currentOutputPath).toBe("code/python");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(
          appState,
          "data/files/session-123/output/code/python",
          "output"
        );

        // Navigate to third level
        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToFolder("scripts");
        expect(filePanel.currentOutputPath).toBe("code/python/scripts");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(
          appState,
          "data/files/session-123/output/code/python/scripts",
          "output"
        );
      });

      it("should handle empty folder name gracefully", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code";

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToFolder("");

        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).not.toHaveBeenCalled();
      });

      it("should handle null folder name gracefully", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code";

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToFolder(null);

        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).not.toHaveBeenCalled();
      });

      it("should call refresh after navigation", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        const refreshSpy = vi.spyOn(filePanel, "refresh");

        await filePanel.navigateToFolder("code");

        expect(refreshSpy).toHaveBeenCalled();
      });
    });

    describe("navigateToBreadcrumb", () => {
      it("should navigate to root with index 0", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python/scripts";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToBreadcrumb(0);

        expect(filePanel.currentOutputPath).toBe("");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output", "output");
      });

      it("should reconstruct path for intermediate segments", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python/scripts";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        // Navigate to "code" (index 1)
        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToBreadcrumb(1);
        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output/code", "output");

        // Reset path
        filePanel.currentOutputPath = "code/python/scripts";

        // Navigate to "code/python" (index 2)
        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToBreadcrumb(2);
        expect(filePanel.currentOutputPath).toBe("code/python");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(
          appState,
          "data/files/session-123/output/code/python",
          "output"
        );
      });

      it("should handle edge cases with negative index", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToBreadcrumb(-1);

        // Negative index with slice(0, -1) returns all but last element
        // ["code", "python"].slice(0, -1) = ["code"]
        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output/code", "output");
      });

      it("should handle index beyond path length", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateToBreadcrumb(5);

        // slice(0, 5) on 1-element array returns full array
        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output/code", "output");
      });
    });

    describe("getFullOutputPath", () => {
      it("should return base path when at root", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "";

        expect(filePanel.getFullOutputPath()).toBe("data/files/session-123/output");
      });

      it("should append subdirectory to base path", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code";

        expect(filePanel.getFullOutputPath()).toBe("data/files/session-123/output/code");
      });

      it("should handle nested paths correctly", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python/scripts";

        expect(filePanel.getFullOutputPath()).toBe("data/files/session-123/output/code/python/scripts");
      });

      it("should work with different session IDs", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.setSession("different-session");
        filePanel.currentOutputPath = "docs";

        expect(filePanel.getFullOutputPath()).toBe("data/files/different-session/output/docs");
      });
    });

    describe("getBreadcrumbSegments", () => {
      it("should return empty array at root", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.currentOutputPath = "";

        expect(filePanel.getBreadcrumbSegments()).toEqual([]);
      });

      it("should split path into segments", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.currentOutputPath = "code/python";

        expect(filePanel.getBreadcrumbSegments()).toEqual(["code", "python"]);
      });

      it("should filter empty segments", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.currentOutputPath = "code//python///scripts";

        // filter(Boolean) removes empty strings
        expect(filePanel.getBreadcrumbSegments()).toEqual(["code", "python", "scripts"]);
      });

      it("should handle single-level path", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.currentOutputPath = "code";

        expect(filePanel.getBreadcrumbSegments()).toEqual(["code"]);
      });

      it("should handle deeply nested paths", () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab
        );
        filePanel.currentOutputPath = "a/b/c/d/e/f";

        expect(filePanel.getBreadcrumbSegments()).toEqual(["a", "b", "c", "d", "e", "f"]);
      });
    });

    describe("navigateUp", () => {
      it("should navigate up one level", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateUp();

        expect(filePanel.currentOutputPath).toBe("code");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output/code", "output");
      });

      it("should do nothing at root", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "";

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateUp();

        expect(filePanel.currentOutputPath).toBe("");
        expect(loadFilesIntoStateMock).not.toHaveBeenCalled();
      });

      it("should handle single-level paths", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateUp();

        expect(filePanel.currentOutputPath).toBe("");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/output", "output");
      });

      it("should handle deeply nested paths", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python/scripts/utils";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.navigateUp();

        expect(filePanel.currentOutputPath).toBe("code/python/scripts");
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(
          appState,
          "data/files/session-123/output/code/python/scripts",
          "output"
        );
      });

      it("should call refresh after navigation", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        const refreshSpy = vi.spyOn(filePanel, "refresh");

        await filePanel.navigateUp();

        expect(refreshSpy).toHaveBeenCalled();
      });
    });

    describe("Integration: refresh with navigation", () => {
      it("should use getFullOutputPath for output tab", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python";

        // Switch to output tab
        outputTab.classList.add("active");
        sourcesTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.refresh();

        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(
          appState,
          "data/files/session-123/output/code/python",
          "output"
        );
      });

      it("should not use currentOutputPath for sources tab", async () => {
        const filePanel = new FilePanel(
          panelElement,
          toggleButton,
          filesContainer,
          refreshButton,
          sourcesTab,
          outputTab,
          { appState }
        );
        filePanel.setSession("session-123");
        filePanel.currentOutputPath = "code/python";

        // Input tab is active by default
        sourcesTab.classList.add("active");
        outputTab.classList.remove("active");

        loadFilesIntoStateMock.mockClear();
        await filePanel.refresh();

        // Should ignore currentOutputPath for sources
        expect(loadFilesIntoStateMock).toHaveBeenCalledWith(appState, "data/files/session-123/sources", "sources");
      });
    });
  });
});
