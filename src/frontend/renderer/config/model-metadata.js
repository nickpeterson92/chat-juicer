/**
 * Model Metadata Configuration
 *
 * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY!
 *
 * This file is generated from src/core/constants.py MODEL_CONFIGS.
 * To modify model configuration, edit MODEL_CONFIGS in constants.py
 * and run: make generate-model-metadata
 */

/**
 * Model metadata with display names, descriptions, and family grouping
 */
export const MODEL_METADATA = {
  "gpt-5.2": {
    displayName: "GPT-5.2",
    description: "Latest and most capable model",
    isPrimary: true,
    modelFamily: null,
  },
  "gpt-5.1": {
    displayName: "GPT-5.1",
    description: "Advanced reasoning model",
    isPrimary: true,
    modelFamily: null,
  },
  "gpt-5.1-codex-max": {
    displayName: "GPT-5.1 Codex Max",
    description: "Maximum capability code generation",
    isPrimary: false,
    modelFamily: "gpt-5.1",
  },
  "gpt-5": {
    displayName: "GPT-5",
    description: "Deep reasoning for hard problems",
    isPrimary: false,
    modelFamily: "gpt-5",
  },
  "gpt-5-mini": {
    displayName: "GPT-5 Mini",
    description: "Smart and fast for everyday use",
    isPrimary: false,
    modelFamily: "gpt-5",
  },
  "gpt-5-codex": {
    displayName: "GPT-5 Codex",
    description: "Optimized for code generation",
    isPrimary: false,
    modelFamily: "gpt-5",
  },
  "gpt-4.1": {
    displayName: "GPT-4.1",
    description: "Previous generation, still capable",
    isPrimary: false,
    modelFamily: "gpt-4.1",
  },
  "gpt-4.1-mini": {
    displayName: "GPT-4.1 Mini",
    description: "Faster responses for simple tasks",
    isPrimary: false,
    modelFamily: "gpt-4.1",
  },
};

/**
 * Model family display names for sub-dropdown headers
 */
export const MODEL_FAMILY_LABELS = {
  "gpt-5.1": "GPT-5.1 Models",
  "gpt-5": "GPT-5 Models",
  "gpt-4.1": "GPT-4.1 Models",
};

/**
 * Reasoning effort descriptions
 */
export const REASONING_DESCRIPTIONS = {
  none: "No reasoning; fastest responses",
  low: "Light reasoning; quick responses for simple tasks",
  medium: "Balanced reasoning; good quality and speed",
  high: "Maximum reasoning; slowest but most thorough",
};
