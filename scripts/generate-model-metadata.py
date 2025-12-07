#!/usr/bin/env python3
"""Generate model-metadata.js from Python MODEL_CONFIGS.

This script ensures frontend and backend model configurations stay in sync
by generating the JavaScript file from the single source of truth in
src/core/constants.py.

Usage:
    python scripts/generate-model-metadata.py

Or via make:
    make generate-model-metadata
"""

from __future__ import annotations

import sys

from pathlib import Path

# Add src to path for imports
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from core.constants import MODEL_CONFIGS, REASONING_EFFORT_OPTIONS  # noqa: E402

# Output path for generated JS file
OUTPUT_PATH = PROJECT_ROOT / "electron" / "renderer" / "config" / "model-metadata.js"


def generate_model_metadata_js() -> str:
    """Generate the model-metadata.js content from MODEL_CONFIGS."""

    # Build MODEL_METADATA object (only UI models)
    model_metadata = {}
    model_families = set()
    for m in MODEL_CONFIGS:
        if m.is_ui_model:
            model_metadata[m.id] = {
                "displayName": m.display_name,
                "description": m.description,
                "isPrimary": m.is_primary,
                "modelFamily": m.model_family,
            }
            if m.model_family:
                model_families.add(m.model_family)

    # Build REASONING_DESCRIPTIONS from REASONING_EFFORT_OPTIONS
    # Map the effort levels to user-friendly descriptions
    reasoning_descriptions = {
        "minimal": "Fastest responses, less thorough",
        "low": "Quick thinking for simpler tasks",
        "medium": "Balanced speed and quality",
        "high": "Most thorough, slower responses",
    }

    # Build MODEL_FAMILY_LABELS mapping
    family_labels = {
        "gpt-5": "GPT-5 Models",
        "gpt-4.1": "GPT-4.1 Models",
    }

    # Generate JavaScript content
    lines = [
        "/**",
        " * Model Metadata Configuration",
        " *",
        " * AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY!",
        " *",
        " * This file is generated from src/core/constants.py MODEL_CONFIGS.",
        " * To modify model configuration, edit MODEL_CONFIGS in constants.py",
        " * and run: make generate-model-metadata",
        " */",
        "",
        "/**",
        " * Model metadata with display names, descriptions, and family grouping",
        " */",
        "export const MODEL_METADATA = {",
    ]

    # Add each model entry
    model_items = list(model_metadata.items())
    for i, (model_id, meta) in enumerate(model_items):
        is_last = i == len(model_items) - 1
        family_value = f'"{meta["modelFamily"]}"' if meta["modelFamily"] else "null"
        lines.append(f'  "{model_id}": {{')
        lines.append(f'    displayName: "{meta["displayName"]}",')
        lines.append(f'    description: "{meta["description"]}",')
        lines.append(f"    isPrimary: {'true' if meta['isPrimary'] else 'false'},")
        lines.append(f"    modelFamily: {family_value},")
        lines.append("  },")

    lines.append("};")
    lines.append("")
    lines.append("/**")
    lines.append(" * Model family display names for sub-dropdown headers")
    lines.append(" */")
    lines.append("export const MODEL_FAMILY_LABELS = {")

    # Add family labels for families that exist in model metadata
    family_items = [(k, v) for k, v in family_labels.items() if k in model_families]
    for i, (family_id, label) in enumerate(family_items):
        is_last = i == len(family_items) - 1
        comma = "," if not is_last else ","
        lines.append(f'  "{family_id}": "{label}"{comma}')

    lines.append("};")
    lines.append("")
    lines.append("/**")
    lines.append(" * Reasoning effort descriptions")
    lines.append(" */")
    lines.append("export const REASONING_DESCRIPTIONS = {")

    # Add reasoning descriptions
    desc_items = list(reasoning_descriptions.items())
    for i, (level, desc) in enumerate(desc_items):
        lines.append(f'  {level}: "{desc}",')

    lines.append("};")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    """Generate model-metadata.js and write to output path."""
    try:
        content = generate_model_metadata_js()

        # Write the file
        OUTPUT_PATH.write_text(content, encoding="utf-8")

        # Count models for verification
        ui_model_count = sum(1 for m in MODEL_CONFIGS if m.is_ui_model)

        print(f"Generated {OUTPUT_PATH.relative_to(PROJECT_ROOT)}")
        print(f"  - {ui_model_count} UI models exported")
        print(f"  - {len(REASONING_EFFORT_OPTIONS)} reasoning levels exported")

        return 0

    except Exception as e:
        print(f"Error generating model metadata: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
