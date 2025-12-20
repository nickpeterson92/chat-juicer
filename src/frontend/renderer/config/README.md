Config Module
=============

Purpose
-------
Holds renderer configuration constants and metadata used across UI and services.

Key files
---------
- `constants.js`: shared constants.
- `colors.js`: semantic color tokens for UI.
- `model-metadata.js`: model capability metadata for selectors/renderers.

Conventions
-----------
- Keep values presentation-agnostic where possible; prefer semantic names over raw values.
- When adding config, document intended consumers and defaults.
