# Utils Module (Shared Helpers)

Purpose: cross-cutting utilities used by multiple modules; contains no business logic. Prefer keeping logic within owning modules unless clearly reusable.

## Files

- `logger.py` - JSON logger singleton (use instead of prints).
- `token_utils.py` - Token counting with LRU caching.
- `file_utils.py` - File helpers; do not bypass session-aware wrappers in `tools/`.
- `document_processor.py` - Document parsing/formatting helpers.
- `json_utils.py` - JSON encode/decode helpers.
- `client_factory.py` - OpenAI/HTTP client construction.
- `http_logger.py` - HTTP request/response logging utilities.

## Guidelines

- Keep functions pure and small; avoid hidden state or side effects.
- Add only widely reused helpers; prefer module-local helpers otherwise.
- Maintain import hygiene: `from __future__ import annotations`, ordered groups, full annotations.
- Use the shared logger for any diagnostic output; never use print().
