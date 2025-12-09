Core Module
===========

Purpose
-------
Provides foundational primitives for renderer state, events, and component lifecycle management. `AppState` is the single source of truth; `EventBus` is only for cross-component events, not primary state.

Key files
---------
- `state.js`: `AppState` namespaces (connection, session, message, file, ui, function); pub/sub helpers for state-driven rendering.
- `event-bus.js`: global event emitter for cross-cutting events.
- `component-lifecycle.js`: helper to mount/unmount components and clean up listeners.
- `lifecycle-manager.js`: orchestrates component lifecycle across views.

Usage guidelines
----------------
- Derive UI from `AppState` subscriptions; avoid direct DOM mutations without going through state-driven renderers/managers.
- Keep EventBus usage minimal and explicit—state updates should flow through `AppState`.
- Always pair component mounts with teardown via lifecycle helpers to prevent leaks.
