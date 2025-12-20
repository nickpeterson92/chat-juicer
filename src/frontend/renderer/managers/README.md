Managers Module
===============

Purpose
-------
Manages DOM/view orchestration and file-related lifecycle tasks. Managers sit between services and UI components, coordinating rendering and cleanup.

Key files
---------
- `dom-manager.js`: centralizes DOM queries and updates.
- `view-manager.js`: controls view transitions (welcome ↔ chat) and seeds selectors.
- `file-manager.js`: renders file list via AppState data; ensures file handle cleanup before deletion.

Conventions
-----------
- Perform DOM operations here rather than inside services.
- Ensure cleanup of listeners/handles when switching views or deleting files.
- Keep functions pure relative to inputs except for scoped DOM effects.
