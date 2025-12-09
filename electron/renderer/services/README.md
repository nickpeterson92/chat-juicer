Services Module
===============

Purpose
-------
Holds renderer business logic. Services consume `AppState`, orchestrate IPC/EventBus interactions, and stay DOM-free.

Key services
------------
- `message-service.js`: outbound/inbound message orchestration; streaming to UI.
- `function-call-service.js`: manages tool cards and function call lifecycle.
- `session-service.js`: session CRUD and selection.
- `file-service.js`: file metadata loading, uploads, and cleanup coordination with managers.
- `stream-manager.js`: wraps streaming pipelines.
- `message-queue-service.js`: queues outbound messages for sequencing/retry.

Conventions
-----------
- Services should not mutate DOM; return data or emit events/state updates.
- Accept `AppState` explicitly; avoid module-level state.
- Keep side effects logged via renderer logging (error-focused).
- When adding a service, document inputs/outputs and any subscriptions/emitters.
