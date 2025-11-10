/**
 * Model Metadata Configuration
 * Shared constants for model display names, descriptions, and reasoning levels
 */

/**
 * Model metadata with display names and descriptions
 */
export const MODEL_METADATA = {
  "gpt-5-pro": {
    displayName: "GPT-5 Pro",
    description: "Most capable for complex tasks",
    isPrimary: true,
  },
  "gpt-5": {
    displayName: "GPT-5",
    description: "Deep reasoning for hard problems",
    isPrimary: true,
  },
  "gpt-5-mini": {
    displayName: "GPT-5 Mini",
    description: "Smart and fast for everyday use",
    isPrimary: true,
  },
  "gpt-5-codex": {
    displayName: "GPT-5 Codex",
    description: "Optimized for code generation",
    isPrimary: false,
  },
  "gpt-4.1": {
    displayName: "GPT-4.1",
    description: "Previous generation, still capable",
    isPrimary: false,
  },
  "gpt-4.1-mini": {
    displayName: "GPT-4.1 Mini",
    description: "Faster responses for simple tasks",
    isPrimary: false,
  },
};

/**
 * Reasoning effort descriptions
 */
export const REASONING_DESCRIPTIONS = {
  minimal: "Fastest responses, less thorough",
  low: "Quick thinking for simpler tasks",
  medium: "Balanced speed and quality",
  high: "Most thorough, slower responses",
};
