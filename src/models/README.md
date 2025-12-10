# Models Module (Pydantic Schemas)

Purpose: single source of validation/serialization for API, IPC, SDK, events, and session shapes. All schemas are strict, fully annotated, and use `Field`/validators for constraints.

## Files
- `api_models.py` – HTTP/API payloads.
- `event_models.py` – internal/agent event shapes.
- `ipc_models.py` – Electron IPC protocol models.
- `sdk_models.py` – SDK-facing types.
- `session_models.py` – session metadata and persistence records.

## Conventions
- Enable strict typing: no implicit optionals; complete annotations on every field.
- Use `Field` for defaults/descriptions; `@field_validator` for complex checks.
- Serialize with `model_dump()`/`model_dump_json()`; avoid `dict()`/`json()`.
- Keep backward compatibility in mind; version fields explicitly where needed.

## Extending
- Add a new schema in the appropriate file; prefer reusing shared submodels.
- Mirror IPC/API contract changes here first; update handlers to consume validated models.
- Add tests for edge cases and validation failures.
