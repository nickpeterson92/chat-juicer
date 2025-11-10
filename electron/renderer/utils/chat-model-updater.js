/**
 * Chat Model Selector Updater
 * Updates the chat model selector to reflect the current session's configuration
 */

/**
 * Update chat model selector with session config
 * @param {Object} session - Session metadata with model and reasoning_effort
 */
export function updateChatModelSelector(session) {
  if (!session) {
    console.log("⚠️ No session provided to updateChatModelSelector");
    return;
  }

  const { model, reasoning_effort } = session;
  console.log("📝 Updating chat model selector:", { model, reasoning_effort });

  // Update model card selection
  const modelCards = document.querySelectorAll("#chat-model-selector .model-card");
  modelCards.forEach((card) => {
    const wrapper = card.closest(".model-card-wrapper");
    if (wrapper && wrapper.dataset.model === model) {
      card.classList.add("selected");

      // Update trigger label (scoped to chat selector)
      const label = document.querySelector("#chat-model-selector #selected-model-label");
      if (label) {
        const displayName = card.querySelector(".model-card-name")?.textContent || model;
        label.textContent = displayName;
      }
    } else {
      card.classList.remove("selected");
    }
  });

  // Update reasoning effort selection
  if (reasoning_effort) {
    const reasoningPanels = document.querySelectorAll("#chat-model-selector .reasoning-panel");
    reasoningPanels.forEach((panel) => {
      if (panel.dataset.model === model) {
        const options = panel.querySelectorAll(".reasoning-option");
        options.forEach((option) => {
          if (option.dataset.value === reasoning_effort) {
            option.classList.add("selected");
          } else {
            option.classList.remove("selected");
          }
        });
      }
    });
  }

  console.log("✅ Chat model selector updated");
}
