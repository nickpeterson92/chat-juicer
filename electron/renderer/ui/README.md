UI Module
=========

Purpose
-------
Presentation layer: components, renderers, and UI utilities. UI derives from `AppState` subscriptions and uses lifecycle helpers for mounting/cleanup.

Key areas
---------
- `components/`: ChatContainer, ConnectionStatus, FilePanel, InputArea, ModelSelector; state-driven rendering.
- `renderers/`: session list renderer and index composition.
- `chat-ui.js`, `function-card-ui.js`, `welcome-page.js`, `titlebar.js`: higher-level UI assembly.
- `utils/`: welcome animations; shared UI helpers.

Conventions
-----------
- Components stay presentation-focused; no business logic inside.
- Use lifecycle helpers to attach/detach listeners; ensure teardown when unmounting.
- Use semantic styling tokens (see `utils/css-variables` at root) instead of hardcoded colors.
- Update UI by subscribing to `AppState`; avoid direct DOM mutation when a state-driven update is possible.
