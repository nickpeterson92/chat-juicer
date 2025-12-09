Adapters Module
===============

Purpose
-------
Provides adapter layer for platform-specific primitives used in bootstrap phase1: DOM access, IPC bridge, and storage.

Key files
---------
- `DOMAdapter.js`: encapsulates DOM queries/manipulations.
- `IPCAdapter.js`: renderer IPC bridge.
- `StorageAdapter.js`: local storage abstraction.
- `index.js`: adapter factory/export barrel.

Conventions
-----------
- Keep adapters thin and deterministic; no business logic.
- Validate availability of required APIs during bootstrap.
- When extending adapters, document capabilities so later phases can rely on them without direct platform calls.
