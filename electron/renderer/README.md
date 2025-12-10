Chat Juicer Renderer
====================

This directory contains the Electron renderer for Chat Juicer. The renderer is organized as a set of small, single-purpose modules wired together by a 7-phase bootstrap. `AppState` is the single source of truth, and `EventBus` is used only for cross-component events—not for primary state.

Structure (top-level modules)
-----------------------------
- `bootstrap/` — 7-phase startup orchestrator (phase1 adapters → phase7 data), validators, and error recovery.
- `core/` — foundational primitives: `AppState`, `EventBus`, lifecycle manager.
- `services/` — business logic (message, session, file, function-call, streaming/queue); consume `AppState`, no DOM access.
- `handlers/` — event wiring from EventBus/IPC into services and UI updates.
- `managers/` — DOM/view/file managers; coordinate UI mounting and cleanup.
- `ui/` — view layer components, renderers, titlebar, chat UI, welcome page; state-driven rendering.
- `plugins/` — plugin registry and core plugins; defines plugin interface and lifecycle hooks.
- `adapters/` — DOM, IPC, and Storage adapters used by phase1 bootstrap.
- `config/` — shared renderer constants (colors, metadata).
- `utils/` — shared helpers (analytics, markdown, toast, uploads, migrations, etc.).
- `viewmodels/` — transforms state/service data for UI consumption.

Key flows
---------
- Bootstrap: `bootstrap.js` runs phases 1–7 in order, validating readiness and enabling degraded-mode recovery.
- State: `core/state.js` holds connection/session/message/file/ui/function namespaces; modules subscribe via pub/sub.
- Messaging: `services/message-service.js` + `handlers/message-handlers-v2.js` stream messages/tools to UI; `services/function-call-service.js` manages tool cards.
- Files: `services/file-service.js` + `managers/file-manager.js` handle file list rendering and handle cleanup prior to deletion.

Working guidelines
------------------
- Keep business logic in services; UI components stay presentation-only.
- Update UI through `AppState` subscriptions; avoid ad-hoc DOM mutations.
- Clean up listeners/handles in lifecycle hooks; use `ComponentLifecycle` where applicable.
- When adding modules, document purpose, dependencies, and cleanup expectations in the module README.
