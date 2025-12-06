/**
 * FilePanel Component Unit Tests
 * Phase 4 State Management Migration
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppState } from "@/core/state.js";
import { FilePanel } from "@/ui/components/file-panel.js";

// Mock file-manager module
vi.mock("@/managers/file-manager.js", () => ({
  loadFiles: vi.fn(),
}));

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
  });

  describe("constructor", () => {
    it("should initialize without appState (backwards compatibility)", () => {
      const filePanel = new FilePanel(panelElement, toggleButton, filesContainer, refreshButton, sourcesTab, outputTab);

      expect(filePanel.panel).toBe(panelElement);
      expect(filePanel.appState).toBeNull();
      expect(filePanel.unsubscribers).toEqual([]);
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
      expect(filePanel.unsubscribers).toHaveLength(1); // session.current subscription
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

      expect(filePanel.unsubscribers).toHaveLength(1);

      filePanel.destroy();

      expect(filePanel.unsubscribers).toEqual([]);
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
});
