Bootstrap Module
================

Purpose
-------
Coordinates 7-phase startup of the renderer with validation and degraded-mode recovery. This is the entry path after `bootstrap.js` is invoked from the renderer root.

Key files
---------
- `bootstrap.js` (root): runs the phase sequence and handles fatal overlay.
- `phases/phase1-7-*.js`: phased orchestration (adapters → state/DOM → services → components → handlers/subscriptions → plugins → data loading).
- `validators.js`: readiness checks between phases.
- `error-recovery.js`: degraded-mode handling and overlay rendering.
- `types.js`: shared phase contracts.

Phase outline
-------------
1. Adapters (`phase1-adapters`) — create IPC/DOM/Storage adapters, validate environment.
2. State + DOM (`phase2-state-dom`) — initialize `AppState`, base DOM scaffolding.
3. Services (`phase3-services`) — instantiate business services with `AppState`.
4. Components (`phase4-components`) — mount UI components using lifecycle manager.
5. Event handlers (`phase5-event-handlers`) — wire EventBus/IPC events to services/UI.
6. Subscriptions (`phase5a-subscriptions`) — subscribe UI to `AppState` namespaces.
7. Plugins (`phase6-plugins`) — register/load plugins.
8. Data loading (`phase7-data-loading`) — hydrate initial data (sessions, files, models).

Working notes
-------------
- Keep heavy logic inside services or managers, not in phases.
- Each phase should be idempotent where possible and validate preconditions.
- Prefer explicit inputs/outputs per phase; avoid implicit globals.
- Add new phases only when the responsibility does not fit existing ones and update `phases/index.js` accordingly.
