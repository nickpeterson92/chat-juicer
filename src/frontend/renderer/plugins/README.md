Plugins Module
==============

Purpose
-------
Defines renderer plugin interface, registry, and core plugin set. Plugins extend functionality without changing core services/components.

Key files
---------
- `plugin-interface.js`: contract for plugin shape and lifecycle hooks.
- `index.js`: registration and loading utilities.
- `core-plugins.js`: built-in plugins.

Conventions
-----------
- Plugins receive explicit dependencies (AppState, services) rather than importing globally.
- Keep plugin side effects scoped and reversible; ensure teardown hooks clean listeners/resources.
- Document required hooks when adding new plugin types.
