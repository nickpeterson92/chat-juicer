Utils Module
============

Purpose
-------
Shared helpers for renderer features: analytics, rendering, uploads, migrations, and misc utilities.

Key areas
---------
- `analytics/`: adapter + index for analytics plumbing.
- Rendering helpers: `markdown-renderer.js`, `lottie-color.js`, `css-variables.js`, `file-icon-colors.js`.
- State/data helpers: `state-migration.js`, `json-cache.js`, `chat-model-updater.js`.
- UX helpers: `toast.js`, `upload-progress.js`, `scroll-utils.js`, `file-utils.js`.

Conventions
-----------
- Keep helpers side-effect free where possible; document caches/mutations.
- Avoid embedding business logic; utilities should be reusable and narrowly scoped.
- Log only on error paths; leave normal flow logging to services/handlers.
