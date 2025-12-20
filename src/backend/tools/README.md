# Tools Module (Function-Calling Surface)

Purpose: defines native tools exposed to the agent and handles session-aware file/text/document operations. Registry wires tool metadata for the Agent/Runner.

## Files

- `registry.py` - Collects and exports native tools for agent configuration.
- `wrappers.py` - Session-aware wrappers ensuring paths stay under `data/files/{session_id}`.
- `file_operations.py` - List/read/search/edit session files.
- `document_generation.py` - Create/format documents within session storage.
- `text_editing.py` - Structured text edits.
- `code_interpreter.py` - Code execution wrapper with safety rails.

## Patterns

- All tool functions are async and accept validated parameters.
- Session context is passed via `wrappers.py` which binds session_id at agent creation time.
- Use session-aware wrappers for any file I/O; never write outside session root.
- Log via shared logger with contextual extras; avoid prints.

## Extending

- Add the tool implementation in a focused module; surface via `registry.py`.
- Wrap with session context in `wrappers.py` using `create_session_aware_tools()`.
- Validate inputs with Pydantic models where possible; return structured results.
- Include tests covering success/error paths and session path constraints.
