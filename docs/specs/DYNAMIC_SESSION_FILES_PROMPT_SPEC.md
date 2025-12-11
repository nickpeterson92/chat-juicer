# Dynamic Session Files in System Prompt – Implementation Spec

## Overview

Inject uploaded file names into the agent's system prompt so the LLM knows what files are available in the current session. The prompt updates dynamically as files are added, taking effect on the next conversation turn.

---

## Design Principles

1. **Never mutate during streaming** – Agent refresh happens only before `Runner.run_streamed`, not mid-stream.
2. **Single source of truth** – File list derived from filesystem (`data/files/{session_id}/sources`), not cached state.
3. **Atomic updates** – Both `SessionContext.agent` and `session.agent` updated together.
4. **Graceful degradation** – If file listing fails, fall back to base prompt (log warning, don't crash).
5. **Bounded output** – Cap file list to prevent prompt bloat (e.g., 50 files, truncate with "...and N more").

---

## Phase 1: Prompt Builder Infrastructure

**Goal:** Create utilities to list session files and build dynamic system instructions.

### 1.1 Add `get_session_files()` helper

**File:** `src/utils/file_utils.py`

```python
async def get_session_files(session_id: str, subdir: str = "sources") -> list[str]:
    """List filenames in a session's subdirectory.

    Args:
        session_id: Session identifier
        subdir: Subdirectory to list (default: "sources")

    Returns:
        List of filenames (not full paths), sorted alphabetically.
        Empty list if directory doesn't exist or on error.
    """
```

- Returns only filenames, not paths (e.g., `["report.pdf", "data.csv"]`)
- Filters out hidden files (`.` prefix)
- Sorts alphabetically for deterministic prompt
- Returns empty list on missing dir or error (logs warning)

### 1.2 Add `build_dynamic_instructions()` helper

**File:** `src/core/prompts.py`

```python
MAX_FILES_IN_PROMPT = 50  # Cap to prevent prompt bloat

def build_dynamic_instructions(
    base_instructions: str,
    session_files: list[str] | None = None,
) -> str:
    """Build system instructions with optional session file context.

    Args:
        base_instructions: Base SYSTEM_INSTRUCTIONS constant
        session_files: List of filenames in session (None = no files section)

    Returns:
        Complete system instructions with file context appended
    """
```

**Appended section format:**
```
## Current Session Files

The following files have been uploaded to this session and are available via `read_file` in the `sources/` directory:

- report.pdf
- data.csv
- screenshot.png

Use these files when relevant to the user's requests. You can read them with `read_file("sources/filename")`.
```

**Edge cases:**
- Empty list → No section appended (clean prompt)
- `None` → No section appended
- Over 50 files → Show first 50 + "...and N more files"

### 1.3 Unit Tests

**File:** `tests/backend/unit/test_prompts.py`

- `test_build_dynamic_instructions_no_files` – Returns base unchanged
- `test_build_dynamic_instructions_with_files` – Appends section correctly
- `test_build_dynamic_instructions_truncates_long_list` – Caps at 50
- `test_build_dynamic_instructions_empty_list` – No section for `[]`

**File:** `tests/backend/unit/test_file_utils.py`

- `test_get_session_files_returns_sorted_list`
- `test_get_session_files_missing_dir_returns_empty`
- `test_get_session_files_filters_hidden_files`

---

## Phase 2: Session Bootstrap Integration

**Goal:** New sessions and session switches include current files in initial prompt.

### 2.1 Update `ensure_session_exists()`

**File:** `src/app/runtime.py`

Before creating the agent, fetch files and build dynamic instructions:

```python
# Existing code creates session_tools and session_mcp_servers...

# NEW: Build dynamic instructions with current session files
from utils.file_utils import get_session_files
from core.prompts import build_dynamic_instructions, SYSTEM_INSTRUCTIONS

session_files = await get_session_files(session_meta.session_id)
dynamic_instructions = build_dynamic_instructions(SYSTEM_INSTRUCTIONS, session_files)

# Pass dynamic_instructions instead of SYSTEM_INSTRUCTIONS
session_agent = create_agent(
    app_state.deployment,
    dynamic_instructions,  # Changed from SYSTEM_INSTRUCTIONS
    session_tools,
    session_mcp_servers
)
```

### 2.2 Integration Test

**File:** `tests/backend/integration/test_session_files_prompt.py`

- Create session → upload file → verify `session.agent.instructions` contains filename
- Switch to existing session with files → verify instructions include them

---

## Phase 3: Dynamic Refresh Before Each Turn

**Goal:** Uploaded files appear in prompt on the next conversation turn.

### 3.1 Add `refresh_session_agent()` helper

**File:** `src/app/runtime.py`

```python
async def refresh_session_agent(
    app_state: AppState,
    session_ctx: SessionContext,
) -> None:
    """Refresh session agent with current file list.

    Called before each turn to ensure prompt reflects uploaded files.
    Updates both SessionContext.agent and session.agent atomically.

    Args:
        app_state: Application state
        session_ctx: Session context to refresh
    """
```

**Implementation:**
1. Get `session_id` from `session_ctx.session`
2. Fetch current files: `await get_session_files(session_id)`
3. Build instructions: `build_dynamic_instructions(SYSTEM_INSTRUCTIONS, files)`
4. Get session tools from existing agent (they're session-specific, don't rebuild)
5. Get MCP servers from app_state filtered by session config
6. Create new agent with updated instructions
7. Atomically update both references:
   ```python
   session_ctx.agent = new_agent
   session_ctx.session.agent = new_agent
   ```

### 3.2 Call refresh before streaming in `process_messages()`

**File:** `src/app/runtime.py`

At the start of `process_messages()`, before any streaming:

```python
async def process_messages(app_state: AppState, session_ctx: SessionContext, messages: list[str]) -> None:
    session = session_ctx.session
    if not messages:
        return

    # NEW: Refresh agent with current files before this turn
    await refresh_session_agent(app_state, session_ctx)

    # ... rest of existing code
```

This ensures:
- Files uploaded between turns are reflected
- No mid-stream mutation
- Consistent behavior across all message processing

### 3.3 Unit Tests

**File:** `tests/backend/unit/test_runtime.py`

- `test_refresh_session_agent_updates_both_references`
- `test_refresh_session_agent_includes_new_files`
- `test_process_messages_calls_refresh`

---

## Phase 4: Edge Cases & Hardening

### 4.1 Handle refresh failures gracefully

In `refresh_session_agent()`:
```python
try:
    session_files = await get_session_files(session_id)
except Exception as e:
    logger.warning(f"Failed to get session files for prompt: {e}")
    session_files = []  # Fall back to no files section
```

### 4.2 Handle file deletion

When files are deleted (via `delete_file` tool or frontend), the next turn automatically picks up the change since we rebuild from filesystem each time. No additional code needed.

### 4.3 Performance consideration

`get_session_files()` is a simple `os.listdir()` – sub-millisecond for typical session sizes. No caching needed unless sessions routinely have 1000+ files.

### 4.4 Logging

Add debug logging:
```python
logger.debug(f"Refreshed agent with {len(session_files)} files for session {session_id}")
```

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/utils/file_utils.py` | Add `get_session_files()` |
| `src/core/prompts.py` | Add `MAX_FILES_IN_PROMPT`, `build_dynamic_instructions()` |
| `src/app/runtime.py` | Add `refresh_session_agent()`, update `ensure_session_exists()`, call refresh in `process_messages()` |
| `tests/backend/unit/test_prompts.py` | New tests for prompt builder |
| `tests/backend/unit/test_file_utils.py` | New tests for file listing |
| `tests/backend/unit/test_runtime.py` | New tests for refresh logic |
| `tests/backend/integration/test_session_files_prompt.py` | Integration test |

---

## Rollout Plan

1. **Phase 1** – Merge prompt builder + file utils (no behavior change, just new helpers)
2. **Phase 2** – Integrate into session bootstrap (files appear on session create/switch)
3. **Phase 3** – Add per-turn refresh (full dynamic behavior)
4. **Phase 4** – Harden edge cases, add observability

Each phase is independently deployable and testable.

---

## Rollback

If issues arise:
- **Quick fix:** Remove `await refresh_session_agent()` call from `process_messages()` – reverts to static prompt
- **Full rollback:** Revert to `SYSTEM_INSTRUCTIONS` in `ensure_session_exists()` and remove refresh call

---

## Estimated LOE

| Phase | Hours |
|-------|-------|
| Phase 1: Infrastructure | 1.5 |
| Phase 2: Bootstrap | 1 |
| Phase 3: Dynamic refresh | 1.5 |
| Phase 4: Hardening | 1 |
| **Total** | **5 hours** |

