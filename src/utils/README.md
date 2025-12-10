# Utils Module (Shared Helpers)

Purpose: cross-cutting utilities used by multiple modules; contains no business logic. Prefer keeping logic within owning modules unless clearly reusable.

## Files
- `logger.py` – JSON logger singleton (use instead of prints).
- `ipc.py` – IPC helpers.
- `token_utils.py` – token counting/LRU caching.
- `file_utils.py` / `binary_io.py` – file helpers; do not bypass session-aware wrappers in `tools/`.
- `document_processor.py` – document parsing/formatting helpers.
- `json_utils.py` – JSON encode/decode helpers.
- `validation.py` – validation helpers.
- `client_factory.py` – client construction helpers.
- `http_logger.py` – HTTP logging utilities.

## Guidelines
- Keep functions pure and small; avoid hidden state or side effects.
- Add only widely reused helpers; prefer module-local helpers otherwise.
- Maintain import hygiene: `from __future__ import annotations`, ordered groups, full annotations.
