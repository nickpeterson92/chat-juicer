Viewmodels Module
=================

Purpose
-------
Transforms state/service data into shapes the UI can render directly. Viewmodels should stay pure and presentation-focused.

Key files
---------
- `message-viewmodel.js`: maps messages/tool calls to UI-friendly structures.
- `session-viewmodel.js`: shapes session data for lists and selectors.

Conventions
-----------
- Keep functions pure (no side effects); accept plain data and return render-ready objects.
- Avoid DOM or IPC access; defer to services/handlers for I/O.
- Document input and output shapes when adding new viewmodels.
