/**
 * InputArea - UI component for message input
 * Wraps existing DOM elements and manages input behavior
 */

import { MODEL_METADATA, REASONING_DESCRIPTIONS } from "../../config/model-metadata.js";

export class InputArea {
  /**
   * @param {HTMLElement} textarea - Existing textarea element (#user-input)
   * @param {HTMLElement} sendButton - Existing send button element (#send-btn)
   * @param {Function} onSendCallback - Callback for send action
   * @param {Object} options - Optional configuration
   * @param {HTMLElement} options.modelSelectorContainer - Container for model selector
   * @param {Object} options.ipcAdapter - IPC adapter for backend communication
   * @param {Object} options.sessionState - Session state object
   * @param {Function} options.getModelConfig - Function to get current model config
   */
  constructor(textarea, sendButton, onSendCallback, options = {}) {
    if (!textarea || !sendButton) {
      throw new Error("InputArea requires existing textarea and button elements");
    }
    this.textarea = textarea;
    this.sendButton = sendButton;
    this.onSendCallback = onSendCallback;
    this.isEnabled = true;

    // Model selector optional dependencies
    this.modelSelectorContainer = options.modelSelectorContainer;
    this.ipcAdapter = options.ipcAdapter;
    this.sessionState = options.sessionState;
    this.getModelConfig = options.getModelConfig;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  setupEventListeners() {
    // Send button click
    this.sendButton.addEventListener("click", () => {
      this.handleSend();
    });

    // Enter key (Shift+Enter for new line)
    this.textarea.addEventListener("keydown", (e) => {
      this.handleKeyDown(e);
    });

    // Auto-resize on input + update send button state
    this.textarea.addEventListener("input", () => {
      this.adjustHeight();
      this.updateSendButtonState();
    });

    // Initial state
    this.updateSendButtonState();
  }

  /**
   * Update send button state (.ready class) based on textarea content
   * @private
   */
  updateSendButtonState() {
    if (!this.sendButton) return;

    const hasValue = this.getValue().trim().length > 0;
    this.sendButton.disabled = !hasValue;

    if (hasValue) {
      this.sendButton.classList.add("ready");
    } else {
      this.sendButton.classList.remove("ready");
    }
  }

  /**
   * Handle send action
   */
  handleSend() {
    if (!this.isEnabled) return;

    const message = this.getValue().trim();
    if (!message) return;

    if (this.onSendCallback) {
      this.onSendCallback(message);
    }

    this.clear();
  }

  /**
   * Handle keydown events
   *
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.handleSend();
    }
  }

  /**
   * Adjust textarea height based on content
   */
  adjustHeight() {
    if (!this.textarea) return;

    // Reset height to recalculate
    this.textarea.style.height = "auto";

    // Get scroll height and apply constraints
    const scrollHeight = this.textarea.scrollHeight || 40;
    const minHeight = 40;
    const maxHeight = 200;
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

    this.textarea.style.height = `${newHeight}px`;
  }

  /**
   * Get current value
   *
   * @returns {string} Current input value
   */
  getValue() {
    return this.textarea ? this.textarea.value || "" : "";
  }

  /**
   * Set input value
   *
   * @param {string} value - New value
   */
  setValue(value) {
    if (this.textarea) {
      this.textarea.value = value;
      this.adjustHeight();
      this.updateSendButtonState();
    }
  }

  /**
   * Clear input
   */
  clear() {
    this.setValue("");
    this.updateSendButtonState();
  }

  /**
   * Focus the textarea
   */
  focus() {
    if (this.textarea) {
      this.textarea.focus();
    }
  }

  /**
   * Enable input
   */
  enable() {
    this.isEnabled = true;

    if (this.textarea) {
      this.textarea.removeAttribute("disabled");
    }

    if (this.sendButton) {
      this.sendButton.removeAttribute("disabled");
    }
  }

  /**
   * Disable input
   */
  disable() {
    this.isEnabled = false;

    if (this.textarea) {
      this.textarea.setAttribute("disabled", "true");
    }

    if (this.sendButton) {
      this.sendButton.setAttribute("disabled", "true");
    }
  }

  /**
   * Set placeholder text
   *
   * @param {string} text - Placeholder text
   */
  setPlaceholder(text) {
    if (this.textarea) {
      this.textarea.setAttribute("placeholder", text);
    }
  }

  /**
   * Get textarea element
   *
   * @returns {HTMLElement} The textarea element
   */
  getTextarea() {
    return this.textarea;
  }

  /**
   * Get send button element
   *
   * @returns {HTMLElement} The send button element
   */
  getSendButton() {
    return this.sendButton;
  }

  /**
   * Initialize model selector (if dependencies provided)
   *
   * @param {Array} models - Available models from backend
   * @param {Array} reasoningLevels - Available reasoning levels from backend
   * @param {Function} createModelSelector - Function to create selector HTML
   * @param {Function} initializeModelConfig - Function to initialize model config
   */
  async initializeModelSelector(models, reasoningLevels, createModelSelector, initializeModelConfig) {
    if (!this.modelSelectorContainer || !this.ipcAdapter || !this.sessionState || !this.getModelConfig) {
      console.warn("⚠️ Model selector dependencies not provided, skipping initialization");
      return;
    }

    // Inject model selector HTML
    this.modelSelectorContainer.innerHTML = createModelSelector();
    console.log("✅ Model selector HTML injected");

    // Populate model cards manually (scoped to our container)
    this.populateModelCards(models, reasoningLevels);
    console.log("✅ Model cards populated");

    // Setup dropdown toggle
    await this.setupModelDropdown();

    // Setup "More models" toggle
    this.setupMoreModelsToggle();

    // Setup change handlers
    await this.setupModelChangeHandlers();
  }

  /**
   * Populate model cards (scoped to our container) - FULL VERSION with reasoning panels
   * @private
   */
  populateModelCards(models, reasoningLevels) {
    const mainModelsContainer = this.modelSelectorContainer.querySelector("#main-models");
    const moreModelsSection = this.modelSelectorContainer.querySelector("#more-models-section");

    if (!mainModelsContainer || !moreModelsSection) {
      console.error("⚠️ Model containers not found");
      return;
    }

    const primaryModels = models.filter((m) => MODEL_METADATA[m.value]?.isPrimary);
    const secondaryModels = models.filter((m) => !MODEL_METADATA[m.value]?.isPrimary);

    // Helper to create full model card with reasoning panel
    const createModelCard = (model, isDefault, supportsReasoning) => {
      const metadata = MODEL_METADATA[model] || { displayName: model, description: "" };
      const card = document.createElement("div");
      card.className = "model-card-wrapper";
      card.dataset.model = model;

      const cardButton = document.createElement("button");
      cardButton.className = "model-card";
      if (isDefault) cardButton.classList.add("selected");

      cardButton.innerHTML = `
        <div class="model-card-header">
          <span class="model-card-name">${metadata.displayName}</span>
          <div class="model-card-icons">
            ${supportsReasoning ? `<button class="reasoning-expand-btn" data-model="${model}" title="Configure reasoning effort"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
            <svg class="model-card-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
        </div>
        <div class="model-card-description">${metadata.description}</div>
      `;

      card.appendChild(cardButton);

      // Add reasoning panel if supported
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

        card.appendChild(reasoningPanel);
      }

      return card;
    };

    // Populate main models
    mainModelsContainer.innerHTML = "";
    primaryModels.forEach(({ value, isDefault, supportsReasoning }) => {
      const cardWrapper = createModelCard(value, isDefault, supportsReasoning);
      mainModelsContainer.appendChild(cardWrapper);
    });

    // Populate more models
    moreModelsSection.innerHTML = "";
    secondaryModels.forEach(({ value, isDefault, supportsReasoning }) => {
      const cardWrapper = createModelCard(value, isDefault, supportsReasoning);
      moreModelsSection.appendChild(cardWrapper);
    });

    // Populate reasoning options for all reasoning panels
    if (reasoningLevels.length > 0) {
      this.modelSelectorContainer.querySelectorAll(".reasoning-options").forEach((container) => {
        const model = container.dataset.model;
        container.innerHTML = "";

        reasoningLevels.forEach(({ value, label, isDefault }) => {
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

    // Update selected label
    const selectedCard = this.modelSelectorContainer.querySelector(".model-card.selected");
    if (selectedCard) {
      const wrapper = selectedCard.closest(".model-card-wrapper");
      const model = wrapper?.dataset.model;
      const metadata = MODEL_METADATA[model] || { displayName: model };
      const label = this.modelSelectorContainer.querySelector("#selected-model-label");
      if (label) {
        label.textContent = metadata.displayName;
      }
    }
  }

  /**
   * Setup "More models" toggle
   * @private
   */
  setupMoreModelsToggle() {
    const moreModelsToggle = this.modelSelectorContainer.querySelector("#more-models-toggle");
    const moreModelsSection = this.modelSelectorContainer.querySelector("#more-models-section");

    if (!moreModelsToggle || !moreModelsSection) return;

    // Only attach once
    if (moreModelsToggle.dataset.chatListenerAttached) return;
    moreModelsToggle.dataset.chatListenerAttached = "true";

    moreModelsToggle.addEventListener("click", () => {
      const isExpanded = moreModelsSection.style.display !== "none";
      moreModelsSection.style.display = isExpanded ? "none" : "block";
      const svg = moreModelsToggle.querySelector("svg");
      if (svg) {
        svg.style.transform = isExpanded ? "rotate(0deg)" : "rotate(90deg)";
      }
    });

    console.log("✅ More models toggle attached");
  }

  /**
   * Setup model selector dropdown toggle
   * @private
   */
  async setupModelDropdown() {
    return new Promise((resolve) => {
      const attempt = () => {
        const trigger = this.modelSelectorContainer.querySelector("#model-selector-trigger");
        const dropdown = this.modelSelectorContainer.querySelector("#model-selector-dropdown");

        if (!trigger || !dropdown) {
          console.log("⏳ Model selector DOM not ready, retrying...");
          setTimeout(attempt, 50);
          return;
        }

        // Only attach once
        if (trigger.dataset.chatListenerAttached) {
          resolve();
          return;
        }
        trigger.dataset.chatListenerAttached = "true";

        trigger.addEventListener("click", (e) => {
          e.stopPropagation();
          const isVisible = dropdown.style.display !== "none";

          if (isVisible) {
            dropdown.style.display = "none";
          } else {
            // Position dropdown intelligently (above or below)
            const triggerRect = trigger.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;

            // Determine if we should show above or below
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

        console.log("✅ Model selector dropdown toggle attached");
        resolve();
      };

      attempt();
    });
  }

  /**
   * Setup model selector change handlers - FULL VERSION with reasoning
   * @private
   */
  async setupModelChangeHandlers() {
    return new Promise((resolve) => {
      const attempt = () => {
        const modelCards = this.modelSelectorContainer.querySelectorAll(".model-card");
        const reasoningExpandBtns = this.modelSelectorContainer.querySelectorAll(".reasoning-expand-btn");
        const reasoningOptions = this.modelSelectorContainer.querySelectorAll(".reasoning-option");

        // Only model cards are required
        if (modelCards.length === 0) {
          setTimeout(attempt, 50);
          return;
        }

        // Model card click handlers (NO dropdown close - stays open!)
        modelCards.forEach((card) => {
          card.addEventListener("click", async () => {
            // Remove selection from all cards
            this.modelSelectorContainer.querySelectorAll(".model-card").forEach((c) => {
              c.classList.remove("selected");
            });

            // Select clicked card
            card.classList.add("selected");

            // Update label
            const wrapper = card.closest(".model-card-wrapper");
            const selectedModel = wrapper?.dataset.model;

            const metadata = MODEL_METADATA[selectedModel] || { displayName: selectedModel };
            const label = this.modelSelectorContainer.querySelector("#selected-model-label");
            if (label) {
              label.textContent = metadata.displayName;
            }

            // NO dropdown close - dropdown stays open!
            // (User clicks outside to close, just like welcome page)

            // Update backend if in session
            const currentSessionId = this.sessionState.currentSessionId;
            if (!currentSessionId) {
              console.log("⚠️ No active session, model change ignored");
              return;
            }

            // Get current reasoning effort from selected panel (if any)
            const reasoningPanel = wrapper?.querySelector(".reasoning-panel");
            let reasoning_effort = "medium"; // default
            if (reasoningPanel) {
              const selectedReasoning = reasoningPanel.querySelector(".reasoning-option.selected");
              if (selectedReasoning) {
                reasoning_effort = selectedReasoning.dataset.value;
              }
            }

            console.log("🔄 Updating session config:", { model: selectedModel, reasoning_effort });

            try {
              const response = await this.ipcAdapter.sendSessionCommand("update_config", {
                session_id: currentSessionId,
                model: selectedModel,
                reasoning_effort: reasoning_effort,
              });

              if (response?.session_id) {
                console.log("✅ Session config updated:", { model: selectedModel, reasoning_effort });
              } else {
                console.error("❌ Failed to update config:", response?.error);
              }
            } catch (error) {
              console.error("❌ Error updating config:", error);
            }
          });
        });

        // Reasoning expand button handlers
        reasoningExpandBtns.forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation(); // Don't trigger card selection

            // Find the reasoning panel for this model
            const wrapper = btn.closest(".model-card-wrapper");
            const panel = wrapper.querySelector(".reasoning-panel");
            const expandBtn = wrapper.querySelector(".reasoning-expand-btn");

            if (!panel) return;

            // Toggle panel visibility
            const isVisible = panel.style.display !== "none";

            // Close all other reasoning panels
            this.modelSelectorContainer.querySelectorAll(".reasoning-panel").forEach((p) => {
              p.style.display = "none";
              const otherBtn = p.closest(".model-card-wrapper").querySelector(".reasoning-expand-btn svg");
              if (otherBtn) {
                otherBtn.style.transform = "rotate(0deg)";
              }
            });

            if (isVisible) {
              panel.style.display = "none";
              expandBtn.querySelector("svg").style.transform = "rotate(0deg)";
            } else {
              panel.style.display = "block";
              expandBtn.querySelector("svg").style.transform = "rotate(90deg)";
            }
          });
        });

        // Reasoning option click handlers
        reasoningOptions.forEach((option) => {
          option.addEventListener("click", async (e) => {
            e.stopPropagation(); // Don't trigger card selection

            const panel = option.closest(".reasoning-panel");
            const model = panel?.dataset.model;
            const reasoningValue = option.dataset.value;

            // Update UI - remove all selected in this panel, add to clicked
            panel.querySelectorAll(".reasoning-option").forEach((o) => {
              o.classList.remove("selected");
            });
            option.classList.add("selected");

            // Update backend if in session
            const currentSessionId = this.sessionState.currentSessionId;
            if (!currentSessionId) {
              console.log("⚠️ No active session, reasoning change ignored");
              return;
            }

            console.log("🔄 Updating session config:", { model, reasoning_effort: reasoningValue });

            try {
              const response = await this.ipcAdapter.sendSessionCommand("update_config", {
                session_id: currentSessionId,
                model: model, // Include model in case it changed
                reasoning_effort: reasoningValue,
              });

              if (response?.session_id) {
                console.log("✅ Session config updated:", { model, reasoning_effort: reasoningValue });
              } else {
                console.error("❌ Failed to update config:", response?.error);
              }
            } catch (error) {
              console.error("❌ Error updating config:", error);
            }
          });
        });

        console.log("✅ Model selector handlers attached (cards, expand, reasoning)");
        resolve();
      };

      attempt();
    });
  }
}
