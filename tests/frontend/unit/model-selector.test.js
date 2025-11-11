/**
 * ModelSelector Component Tests
 * Tests for the model selector component used on both welcome and chat pages
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelSelector } from "../../../electron/renderer/ui/components/model-selector.js";

// Mock MODEL_METADATA and REASONING_DESCRIPTIONS
vi.mock("../../../electron/renderer/config/model-metadata.js", () => ({
  MODEL_METADATA: {
    "gpt-5": {
      displayName: "GPT-5",
      description: "Most capable model",
      isPrimary: true,
    },
    "gpt-5-mini": {
      displayName: "GPT-5 Mini",
      description: "Faster and cheaper",
      isPrimary: true,
    },
    o1: {
      displayName: "o1",
      description: "Advanced reasoning model",
      isPrimary: false,
    },
  },
  REASONING_DESCRIPTIONS: {
    minimal: "Fast, basic reasoning",
    low: "Balanced speed and quality",
    medium: "Enhanced reasoning (recommended)",
    high: "Maximum reasoning depth",
  },
}));

describe("ModelSelector", () => {
  let container;
  let mockOnChange;
  let mockIpcAdapter;
  let mockSessionState;

  beforeEach(() => {
    // Create fresh container for each test
    container = document.createElement("div");
    document.body.appendChild(container);

    // Mock callbacks
    mockOnChange = vi.fn();
    mockIpcAdapter = {
      sendSessionCommand: vi.fn().mockResolvedValue({ session_id: "test-session" }),
    };
    mockSessionState = {
      currentSessionId: "test-session",
    };
  });

  afterEach(() => {
    // Cleanup
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.clearAllMocks();
  });

  describe("Constructor", () => {
    it("should throw error if container is missing", () => {
      expect(() => new ModelSelector(null)).toThrow("ModelSelector requires a container element");
    });

    it("should initialize with default options", () => {
      const selector = new ModelSelector(container);
      expect(selector.container).toBe(container);
      expect(selector.onChange).toBeNull();
      expect(selector.autoSyncBackend).toBe(false);
    });

    it("should initialize with custom options", () => {
      const selector = new ModelSelector(container, {
        onChange: mockOnChange,
        ipcAdapter: mockIpcAdapter,
        sessionState: mockSessionState,
        autoSyncBackend: true,
      });

      expect(selector.onChange).toBe(mockOnChange);
      expect(selector.ipcAdapter).toBe(mockIpcAdapter);
      expect(selector.sessionState).toBe(mockSessionState);
      expect(selector.autoSyncBackend).toBe(true);
    });
  });

  describe("initialize()", () => {
    it("should inject HTML structure", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: true },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];
      const reasoningLevels = [
        { value: "medium", label: "Medium", isDefault: true },
        { value: "high", label: "High", isDefault: false },
      ];

      await selector.initialize(models, reasoningLevels);

      // Check HTML structure
      expect(container.querySelector("#model-selector-trigger")).toBeTruthy();
      expect(container.querySelector("#model-selector-dropdown")).toBeTruthy();
      expect(container.querySelector("#main-models")).toBeTruthy();
      expect(container.querySelector("#more-models-section")).toBeTruthy();
    });

    it("should populate model cards", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: true },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
        { value: "o1", isDefault: false, supportsReasoning: true },
      ];

      await selector.initialize(models, []);

      // Check model cards
      const mainModels = container.querySelectorAll("#main-models .model-card-wrapper");
      const moreModels = container.querySelectorAll("#more-models-section .model-card-wrapper");

      // gpt-5 and gpt-5-mini are primary (isPrimary: true)
      expect(mainModels.length).toBe(2);
      // o1 is secondary (isPrimary: false)
      expect(moreModels.length).toBe(1);
    });

    it("should mark default model as selected", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: true },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      const selectedCard = container.querySelector(".model-card.selected");
      expect(selectedCard).toBeTruthy();
      expect(selectedCard.closest(".model-card-wrapper").dataset.model).toBe("gpt-5");
    });

    it("should populate reasoning options", async () => {
      const selector = new ModelSelector(container);
      const models = [{ value: "gpt-5", isDefault: true, supportsReasoning: true }];
      const reasoningLevels = [
        { value: "minimal", label: "Minimal", isDefault: false },
        { value: "medium", label: "Medium", isDefault: true },
        { value: "high", label: "High", isDefault: false },
      ];

      await selector.initialize(models, reasoningLevels);

      const reasoningOptions = container.querySelectorAll(".reasoning-option");
      expect(reasoningOptions.length).toBe(3);

      // Check default is selected
      const selectedOption = container.querySelector(".reasoning-option.selected");
      expect(selectedOption.dataset.value).toBe("medium");
    });
  });

  describe("getSelection()", () => {
    it("should return current selection", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: true },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];
      const reasoningLevels = [{ value: "medium", label: "Medium", isDefault: true }];

      await selector.initialize(models, reasoningLevels);

      const selection = selector.getSelection();
      expect(selection.model).toBe("gpt-5");
      expect(selection.reasoning_effort).toBe("medium");
    });

    it("should return default values if nothing selected", async () => {
      const selector = new ModelSelector(container);
      await selector.initialize([], []);

      const selection = selector.getSelection();
      expect(selection.model).toBe("gpt-5"); // fallback
    });
  });

  describe("updateSelection()", () => {
    it("should update model selection", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: true },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      // Update selection
      selector.updateSelection("gpt-5-mini", null);

      // Check selection updated
      const selectedCard = container.querySelector(".model-card.selected");
      expect(selectedCard.closest(".model-card-wrapper").dataset.model).toBe("gpt-5-mini");
    });

    it("should update reasoning effort selection", async () => {
      const selector = new ModelSelector(container);
      const models = [{ value: "gpt-5", isDefault: true, supportsReasoning: true }];
      const reasoningLevels = [
        { value: "medium", label: "Medium", isDefault: true },
        { value: "high", label: "High", isDefault: false },
      ];

      await selector.initialize(models, reasoningLevels);

      // Update selection
      selector.updateSelection("gpt-5", "high");

      // Check reasoning effort updated
      const selectedOption = container.querySelector(".reasoning-option.selected");
      expect(selectedOption.dataset.value).toBe("high");
    });

    it("should update trigger label", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: true },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      selector.updateSelection("gpt-5-mini", null);

      const label = container.querySelector("#selected-model-label");
      expect(label.textContent).toBe("GPT-5 Mini");
    });
  });

  describe("onChange callback", () => {
    it("should call onChange when model card clicked", async () => {
      const selector = new ModelSelector(container, { onChange: mockOnChange });
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: false },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      // Click on gpt-5-mini card
      const miniCard = Array.from(container.querySelectorAll(".model-card")).find(
        (card) => card.closest(".model-card-wrapper").dataset.model === "gpt-5-mini"
      );

      miniCard.click();

      expect(mockOnChange).toHaveBeenCalledWith("gpt-5-mini", "medium");
    });

    it("should call onChange when reasoning option clicked", async () => {
      const selector = new ModelSelector(container, { onChange: mockOnChange });
      const models = [{ value: "gpt-5", isDefault: true, supportsReasoning: true }];
      const reasoningLevels = [
        { value: "medium", label: "Medium", isDefault: true },
        { value: "high", label: "High", isDefault: false },
      ];

      await selector.initialize(models, reasoningLevels);

      // Expand reasoning panel first
      const expandBtn = container.querySelector(".reasoning-expand-btn");
      expandBtn.click();

      // Click on high reasoning option
      const highOption = Array.from(container.querySelectorAll(".reasoning-option")).find(
        (opt) => opt.dataset.value === "high"
      );

      highOption.click();

      expect(mockOnChange).toHaveBeenCalledWith("gpt-5", "high");
    });
  });

  describe("Auto-sync to backend", () => {
    it("should sync to backend when autoSyncBackend is true", async () => {
      const selector = new ModelSelector(container, {
        onChange: mockOnChange,
        ipcAdapter: mockIpcAdapter,
        sessionState: mockSessionState,
        autoSyncBackend: true,
      });

      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: false },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      // Click on gpt-5-mini card
      const miniCard = Array.from(container.querySelectorAll(".model-card")).find(
        (card) => card.closest(".model-card-wrapper").dataset.model === "gpt-5-mini"
      );

      miniCard.click();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockIpcAdapter.sendSessionCommand).toHaveBeenCalledWith("update_config", {
        session_id: "test-session",
        model: "gpt-5-mini",
        reasoning_effort: "medium",
      });
    });

    it("should not sync to backend when autoSyncBackend is false", async () => {
      const selector = new ModelSelector(container, {
        onChange: mockOnChange,
        ipcAdapter: mockIpcAdapter,
        sessionState: mockSessionState,
        autoSyncBackend: false,
      });

      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: false },
        { value: "gpt-5-mini", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      // Click on gpt-5-mini card
      const miniCard = Array.from(container.querySelectorAll(".model-card")).find(
        (card) => card.closest(".model-card-wrapper").dataset.model === "gpt-5-mini"
      );

      miniCard.click();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockIpcAdapter.sendSessionCommand).not.toHaveBeenCalled();
    });
  });

  describe("Dropdown behavior", () => {
    it("should toggle dropdown when trigger clicked", async () => {
      const selector = new ModelSelector(container);
      const models = [{ value: "gpt-5", isDefault: true, supportsReasoning: false }];

      await selector.initialize(models, []);

      const trigger = container.querySelector("#model-selector-trigger");
      const dropdown = container.querySelector("#model-selector-dropdown");

      // Initially hidden
      expect(dropdown.style.display).toBe("none");

      // Click to show
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dropdown.style.display).toBe("block");

      // Click to hide
      trigger.click();
      expect(dropdown.style.display).toBe("none");
    });

    it("should expand/collapse reasoning panel", async () => {
      const selector = new ModelSelector(container);
      const models = [{ value: "gpt-5", isDefault: true, supportsReasoning: true }];
      const reasoningLevels = [{ value: "medium", label: "Medium", isDefault: true }];

      await selector.initialize(models, reasoningLevels);

      const expandBtn = container.querySelector(".reasoning-expand-btn");
      const panel = container.querySelector(".reasoning-panel");

      // Initially hidden
      expect(panel.style.display).toBe("none");

      // Click to expand
      expandBtn.click();
      expect(panel.style.display).toBe("block");

      // Click to collapse
      expandBtn.click();
      expect(panel.style.display).toBe("none");
    });

    it("should toggle more models section", async () => {
      const selector = new ModelSelector(container);
      const models = [
        { value: "gpt-5", isDefault: true, supportsReasoning: false },
        { value: "o1", isDefault: false, supportsReasoning: false },
      ];

      await selector.initialize(models, []);

      const toggle = container.querySelector("#more-models-toggle");
      const section = container.querySelector("#more-models-section");

      // Initially hidden
      expect(section.style.display).toBe("none");

      // Click to show
      toggle.click();
      expect(section.style.display).toBe("block");

      // Click to hide
      toggle.click();
      expect(section.style.display).toBe("none");
    });
  });
});
