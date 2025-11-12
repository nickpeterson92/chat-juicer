/**
 * ModelSelector - UI component for model and reasoning effort selection
 * Shared between welcome page and chat page to eliminate code duplication
 *
 * Architecture:
 * - Composable: Can be instantiated in any container
 * - Mode-agnostic: Supports local-only (welcome) and IPC-sync (chat) modes
 * - Event-driven: Emits onChange callback for parent components
 */

import { MODEL_METADATA, REASONING_DESCRIPTIONS } from "../../config/model-metadata.js";
import { ComponentLifecycle } from "../../core/component-lifecycle.js";
import { globalLifecycleManager } from "../../core/lifecycle-manager.js";

export class ModelSelector {
  /**
   * @param {HTMLElement} container - Container element for model selector
   * @param {Object} options - Configuration options
   * @param {Function} options.onChange - Callback when selection changes (model, reasoningEffort) => void
   * @param {Object} options.ipcAdapter - Optional IPC adapter for backend sync (chat page mode)
   * @param {Object} options.sessionState - Optional session state for backend sync (chat page mode)
   * @param {boolean} options.autoSyncBackend - If true, automatically update backend on change (default: false)
   */
  constructor(container, options = {}) {
    if (!container) {
      throw new Error("ModelSelector requires a container element");
    }

    this.container = container;
    this.models = [];
    this.reasoningLevels = [];
    this.onChange = options.onChange || null;
    this.ipcAdapter = options.ipcAdapter || null;
    this.sessionState = options.sessionState || null;
    this.autoSyncBackend = options.autoSyncBackend || false;

    // Track if listeners are attached to prevent duplication
    this.listenersAttached = false;

    // Mount component with lifecycle management
    ComponentLifecycle.mount(this, "ModelSelector", globalLifecycleManager);
  }

  /**
   * Initialize model selector with data from backend
   * @param {Array} models - Available models [{value, isDefault, supportsReasoning}, ...]
   * @param {Array} reasoningLevels - Available reasoning levels [{value, label, isDefault}, ...]
   */
  async initialize(models, reasoningLevels) {
    this.models = models || [];
    this.reasoningLevels = reasoningLevels || [];

    // Inject HTML structure
    this.injectHTML();

    // Populate model cards
    this.populateModelCards();

    // Setup event listeners (once)
    if (!this.listenersAttached) {
      await this.setupDropdownToggle();
      this.setupMoreModelsToggle();
      this.setupModelCardHandlers();
      this.setupReasoningHandlers();
      this.listenersAttached = true;
    }

    // Update initial label
    this.updateSelectedLabel();

    console.log("✅ ModelSelector initialized with", this.models.length, "models");
  }

  /**
   * Inject HTML structure into container
   * @private
   */
  injectHTML() {
    // Smooth replacement of skeleton with real UI
    this.container.style.opacity = "0";
    this.container.style.transition = "opacity 150ms ease-in";

    this.container.innerHTML = `
      <div class="model-config-inline">
        <button id="model-selector-trigger" class="model-selector-trigger">
          <span id="selected-model-label">GPT-5</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 6L8 10L12 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div id="model-selector-dropdown" class="model-selector-dropdown" style="display: none;">
          <div class="model-selector-content">
            <div id="main-models" class="model-cards">
              <!-- Populated by populateModelCards() -->
            </div>
            <button id="more-models-toggle" class="more-models-toggle">
              <span>More models</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div id="more-models-section" class="more-models-section" style="display: none;">
              <!-- Populated by populateModelCards() -->
            </div>
          </div>
        </div>
      </div>
    `;

    // Fade in after DOM update
    requestAnimationFrame(() => {
      this.container.style.opacity = "1";
    });
  }

  /**
   * Populate model cards in main and "more models" sections
   * @private
   */
  populateModelCards() {
    const mainModelsContainer = this.container.querySelector("#main-models");
    const moreModelsSection = this.container.querySelector("#more-models-section");

    if (!mainModelsContainer || !moreModelsSection) {
      console.error("⚠️ Model containers not found");
      return;
    }

    // Separate primary and secondary models
    const primaryModels = this.models.filter((m) => MODEL_METADATA[m.value]?.isPrimary);
    const secondaryModels = this.models.filter((m) => !MODEL_METADATA[m.value]?.isPrimary);

    // Populate main models
    mainModelsContainer.innerHTML = "";
    primaryModels.forEach(({ value, isDefault, supportsReasoning }) => {
      const cardWrapper = this.createModelCard(value, isDefault, supportsReasoning);
      mainModelsContainer.appendChild(cardWrapper);
    });

    // Populate secondary models
    moreModelsSection.innerHTML = "";
    secondaryModels.forEach(({ value, isDefault, supportsReasoning }) => {
      const cardWrapper = this.createModelCard(value, isDefault, supportsReasoning);
      moreModelsSection.appendChild(cardWrapper);
    });

    // Populate reasoning options for all reasoning panels
    this.populateReasoningOptions();
  }

  /**
   * Create a model card element
   * @private
   */
  createModelCard(model, isDefault, supportsReasoning) {
    const metadata = MODEL_METADATA[model] || {
      displayName: model,
      description: "OpenAI language model",
    };

    const wrapper = document.createElement("div");
    wrapper.className = "model-card-wrapper";
    wrapper.dataset.model = model;

    const card = document.createElement("button");
    card.className = "model-card";
    if (isDefault) {
      card.classList.add("selected");
    }

    card.innerHTML = `
      <div class="model-card-header">
        <span class="model-card-name">${metadata.displayName}</span>
        <div class="model-card-icons">
          ${
            supportsReasoning
              ? `<button class="reasoning-expand-btn" data-model="${model}" title="Configure reasoning effort">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                     <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
                   </svg>
                 </button>`
              : ""
          }
          <svg class="model-card-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
      <div class="model-card-description">${metadata.description}</div>
    `;

    wrapper.appendChild(card);

    // Add reasoning panel if model supports reasoning
    if (supportsReasoning) {
      const reasoningPanel = document.createElement("div");
      reasoningPanel.className = "reasoning-panel";
      reasoningPanel.dataset.model = model;
      reasoningPanel.style.display = "none";

      reasoningPanel.innerHTML = `
        <div class="reasoning-panel-content">
          <div class="reasoning-panel-label">Reasoning effort</div>
          <div class="reasoning-options" data-model="${model}"></div>
        </div>
      `;

      wrapper.appendChild(reasoningPanel);
    }

    return wrapper;
  }

  /**
   * Populate reasoning options for all reasoning panels
   * @private
   */
  populateReasoningOptions() {
    if (this.reasoningLevels.length === 0) return;

    this.container.querySelectorAll(".reasoning-options").forEach((container) => {
      const model = container.dataset.model;
      container.innerHTML = "";

      this.reasoningLevels.forEach(({ value, label, isDefault }) => {
        const option = document.createElement("button");
        option.className = "reasoning-option";
        option.dataset.value = value;
        option.dataset.model = model;

        if (isDefault) {
          option.classList.add("selected");
        }

        const description = REASONING_DESCRIPTIONS[value] || label;

        option.innerHTML = `
          <div class="reasoning-option-header">
            <span class="reasoning-option-value">${value.charAt(0).toUpperCase() + value.slice(1)}</span>
            <svg class="reasoning-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="reasoning-option-description">${description}</div>
        `;

        container.appendChild(option);
      });
    });
  }

  /**
   * Setup dropdown toggle functionality
   * @private
   */
  async setupDropdownToggle() {
    return new Promise((resolve) => {
      const attempt = () => {
        const trigger = this.container.querySelector("#model-selector-trigger");
        const dropdown = this.container.querySelector("#model-selector-dropdown");

        if (!trigger || !dropdown) {
          this.setTimeout(attempt, 50);
          return;
        }

        // Prevent duplicate listeners
        if (trigger.dataset.listenerAttached) {
          resolve();
          return;
        }
        trigger.dataset.listenerAttached = "true";

        trigger.addEventListener("click", (e) => {
          e.stopPropagation();
          const isVisible = dropdown.style.display !== "none";

          if (isVisible) {
            dropdown.style.display = "none";
          } else {
            // Intelligent positioning (above or below)
            const triggerRect = trigger.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;

            const preferredMaxHeight = 500;
            const minHeight = 200;

            if (spaceBelow >= minHeight) {
              // Position below
              const maxHeight = Math.max(minHeight, Math.min(preferredMaxHeight, spaceBelow - 20));
              dropdown.style.maxHeight = `${maxHeight}px`;
              dropdown.style.top = "calc(100% + 4px)";
              dropdown.style.bottom = "auto";
            } else {
              // Position above
              const maxHeight = Math.max(minHeight, Math.min(preferredMaxHeight, spaceAbove - 20));
              dropdown.style.maxHeight = `${maxHeight}px`;
              dropdown.style.bottom = "calc(100% + 4px)";
              dropdown.style.top = "auto";
            }

            dropdown.style.display = "block";
          }
        });

        // Close on outside click
        const closeOnOutsideClick = (e) => {
          if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.style.display = "none";
          }
        };
        document.addEventListener("click", closeOnOutsideClick);

        resolve();
      };

      attempt();
    });
  }

  /**
   * Setup "More models" toggle
   * @private
   */
  setupMoreModelsToggle() {
    const toggle = this.container.querySelector("#more-models-toggle");
    const section = this.container.querySelector("#more-models-section");

    if (!toggle || !section) return;

    if (toggle.dataset.listenerAttached) return;
    toggle.dataset.listenerAttached = "true";

    toggle.addEventListener("click", () => {
      const isExpanded = section.style.display !== "none";
      section.style.display = isExpanded ? "none" : "block";
      const svg = toggle.querySelector("svg");
      if (svg) {
        svg.style.transform = isExpanded ? "rotate(0deg)" : "rotate(90deg)";
      }
    });
  }

  /**
   * Setup model card click handlers
   * @private
   */
  setupModelCardHandlers() {
    const modelCards = this.container.querySelectorAll(".model-card");

    modelCards.forEach((card) => {
      card.addEventListener("click", async () => {
        // Remove selection from all cards
        this.container.querySelectorAll(".model-card").forEach((c) => {
          c.classList.remove("selected");
        });

        // Select clicked card
        card.classList.add("selected");

        // Update label
        this.updateSelectedLabel();

        // Get selected model and reasoning effort
        const wrapper = card.closest(".model-card-wrapper");
        const selectedModel = wrapper?.dataset.model;
        const reasoningPanel = wrapper?.querySelector(".reasoning-panel");
        let reasoningEffort = "medium"; // default

        if (reasoningPanel) {
          const selectedReasoning = reasoningPanel.querySelector(".reasoning-option.selected");
          if (selectedReasoning) {
            reasoningEffort = selectedReasoning.dataset.value;
          }
        }

        // Emit onChange callback
        if (this.onChange) {
          this.onChange(selectedModel, reasoningEffort);
        }

        // Auto-sync to backend if enabled (chat page mode)
        if (this.autoSyncBackend && this.ipcAdapter && this.sessionState) {
          await this.syncToBackend(selectedModel, reasoningEffort);
        }

        // DON'T close dropdown - let user explore other options
      });
    });
  }

  /**
   * Setup reasoning expand button and option handlers
   * @private
   */
  setupReasoningHandlers() {
    // Expand button handlers
    const expandBtns = this.container.querySelectorAll(".reasoning-expand-btn");
    expandBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // Don't trigger card selection

        const wrapper = btn.closest(".model-card-wrapper");
        const panel = wrapper.querySelector(".reasoning-panel");
        const expandBtn = wrapper.querySelector(".reasoning-expand-btn");

        if (!panel) return;

        const isVisible = panel.style.display !== "none";

        // Close all other reasoning panels
        this.container.querySelectorAll(".reasoning-panel").forEach((p) => {
          p.style.display = "none";
          const otherBtn = p.closest(".model-card-wrapper").querySelector(".reasoning-expand-btn svg");
          if (otherBtn) {
            otherBtn.style.transform = "rotate(0deg)";
          }
        });

        // Toggle current panel
        if (isVisible) {
          panel.style.display = "none";
          expandBtn.querySelector("svg").style.transform = "rotate(0deg)";
        } else {
          panel.style.display = "block";
          expandBtn.querySelector("svg").style.transform = "rotate(90deg)";
        }
      });
    });

    // Reasoning option handlers
    const reasoningOptions = this.container.querySelectorAll(".reasoning-option");
    reasoningOptions.forEach((option) => {
      option.addEventListener("click", async (e) => {
        e.stopPropagation(); // Don't trigger card selection

        const panel = option.closest(".reasoning-panel");
        const model = panel?.dataset.model;
        const reasoningValue = option.dataset.value;

        // Update UI selection
        panel.querySelectorAll(".reasoning-option").forEach((o) => {
          o.classList.remove("selected");
        });
        option.classList.add("selected");

        // Emit onChange callback
        if (this.onChange) {
          this.onChange(model, reasoningValue);
        }

        // Auto-sync to backend if enabled (chat page mode)
        if (this.autoSyncBackend && this.ipcAdapter && this.sessionState) {
          await this.syncToBackend(model, reasoningValue);
        }
      });
    });
  }

  /**
   * Update selected model label in trigger button
   * @private
   */
  updateSelectedLabel() {
    const selectedCard = this.container.querySelector(".model-card.selected");
    const label = this.container.querySelector("#selected-model-label");

    if (selectedCard && label) {
      const wrapper = selectedCard.closest(".model-card-wrapper");
      const model = wrapper?.dataset.model;
      const metadata = MODEL_METADATA[model] || { displayName: model };
      label.textContent = metadata.displayName;
    }
  }

  /**
   * Sync selection to backend (chat page mode)
   * @private
   */
  async syncToBackend(model, reasoningEffort) {
    const currentSessionId = this.sessionState?.currentSessionId;
    if (!currentSessionId) {
      console.log("⚠️ No active session, model change ignored");
      return;
    }

    console.log("🔄 Updating session config:", { model, reasoning_effort: reasoningEffort });

    try {
      const response = await this.ipcAdapter.sendSessionCommand("update_config", {
        session_id: currentSessionId,
        model: model,
        reasoning_effort: reasoningEffort,
      });

      if (response?.session_id) {
        console.log("✅ Session config updated:", { model, reasoning_effort: reasoningEffort });
      } else {
        console.error("❌ Failed to update config:", response?.error);
      }
    } catch (error) {
      console.error("❌ Error updating config:", error);
    }
  }

  /**
   * Get current selection
   * @returns {{model: string, reasoning_effort: string}} Current selection
   */
  getSelection() {
    const selectedCard = this.container.querySelector(".model-card.selected");
    const selectedWrapper = selectedCard?.closest(".model-card-wrapper");

    const model = selectedWrapper?.dataset.model || "gpt-5";
    const config = { model };

    // Check if model has reasoning panel with selected option
    if (selectedWrapper) {
      const reasoningOption = selectedWrapper.querySelector(".reasoning-option.selected");
      if (reasoningOption) {
        config.reasoning_effort = reasoningOption.dataset.value || "medium";
      }
    }

    return config;
  }

  /**
   * Update selection programmatically (for session sync)
   * @param {string} model - Model to select
   * @param {string} reasoningEffort - Reasoning effort to select
   */
  updateSelection(model, reasoningEffort) {
    console.log("📝 Updating ModelSelector:", { model, reasoning_effort: reasoningEffort });

    // Update model card selection
    const modelCards = this.container.querySelectorAll(".model-card");
    modelCards.forEach((card) => {
      const wrapper = card.closest(".model-card-wrapper");
      if (wrapper && wrapper.dataset.model === model) {
        card.classList.add("selected");
      } else {
        card.classList.remove("selected");
      }
    });

    // Update reasoning effort selection
    if (reasoningEffort) {
      const reasoningPanels = this.container.querySelectorAll(".reasoning-panel");
      reasoningPanels.forEach((panel) => {
        if (panel.dataset.model === model) {
          const options = panel.querySelectorAll(".reasoning-option");
          options.forEach((option) => {
            if (option.dataset.value === reasoningEffort) {
              option.classList.add("selected");
            } else {
              option.classList.remove("selected");
            }
          });
        }
      });
    }

    // Update label
    this.updateSelectedLabel();

    console.log("✅ ModelSelector updated");
  }
}
