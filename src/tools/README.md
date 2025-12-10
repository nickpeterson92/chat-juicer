# Tools Module (Function-Calling Surface)

Purpose: defines native tools exposed to the agent and handles session-aware file/text/document operations. Registry wires tool metadata for the Agent/Runner.

## Files
- `registry.py` – collects and exports native tools for agent configuration.
- `wrappers.py` – session-aware wrappers ensuring paths stay under `data/files/{session_id}`.
- `file_operations.py` – list/read/search/edit session files.
- `document_generation.py` – create/format documents within session storage.
- `text_editing.py` – structured text edits.
- `code_interpreter.py` – code execution wrapper with safety rails.

## Patterns
- All tool functions are async and accept `AppState` plus validated params.
- Use session-aware wrappers for any file I/O; never write outside session root.
- Log via shared logger with contextual extras; avoid prints.

## Extending
- Add the tool implementation in a focused module; surface via `registry.py`.
- Validate inputs with Pydantic models where possible; return structured results.
- Include tests covering success/error paths and session path constraints.
