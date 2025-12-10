Handlers Module
===============

Purpose
-------
Wires events from IPC/EventBus into services and UI updates. Handlers translate low-level events into state changes, service calls, and renderer actions.

Key files
---------
- `message-handlers-v2.js`: streaming message/tool events to UI.
- `session-list-handlers.js`: session list interactions.
- `chat-events.js`, `file-events.js`, `session-events.js`: feature-specific wiring.
- `index.js`: handler registration entry.

Conventions
-----------
- Keep handlers thin: validate inputs, delegate to services/managers, emit state updates.
- Avoid embedding business logic; push it into services.
- Clean up listeners via lifecycle hooks when views change.
