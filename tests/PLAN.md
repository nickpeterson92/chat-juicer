# Test Coverage & Integration Plan

**Quick Answer: Yes, this plan covers both unit tests (85% coverage) AND critical integration tests.**

## Current Status
- Coverage: 81.87% (547 unit tests passing)
- Need: +3.13% for 85% target
- Integration tests: 0 (need to implement)

## Unit Tests to 85% (Phases 1-3: ~4-5 hours)

1. **session_commands.py** tests - add 15-20 edge case tests (+2.22%)
2. **logger.py** tests - create new file with 8-10 tests (+1.05%)
3. **file_utils.py** edge cases - add 10-12 tests (+1.05%)

Result: 85-86% coverage

## Integration Tests (Phases 4-6: ~10-13 hours)

### Phase 4: Session Lifecycle (~3-4 hours)
**File**: `tests/integration/test_session_lifecycle.py`

Tests:
- ✅ Create → add messages → summarize → switch → delete workflow
- ✅ Session persistence across restarts
- ✅ Concurrent session operations
- ✅ Layer 1 (token-aware) vs Layer 2 (full history) interaction
- ✅ Workspace isolation and cleanup

### Phase 5: File Operations (~3-4 hours)
**File**: `tests/integration/test_file_operations_integration.py`

Tests:
- ✅ File operations respect session boundaries
- ✅ Upload, convert, summarize workflow
- ✅ Search across workspace files
- ✅ Path traversal security
- ✅ Unicode and large file handling

### Phase 6: Agent & Tools (~4-5 hours)
**File**: `tests/integration/test_agent_tool_execution.py`

Tests:
- ✅ Agent with native Python tools
- ✅ Agent with MCP server tools (sequential-thinking, fetch)
- ✅ Token tracking during streaming
- ✅ Tool call → result → agent response flow
- ✅ Error handling when tools fail

## Detailed Integration Test Examples

### Example 1: Complete Session Lifecycle
```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_complete_session_lifecycle():
    """Test full session workflow without mocks."""

    # 1. Create session
    session_id = await create_session_command(title="Test")
    assert await session_exists(session_id)

    # 2. Add 100 message pairs (trigger summarization)
    for i in range(100):
        await add_message(session_id, f"User: {i}", role="user")
        await add_message(session_id, f"AI: {i}", role="assistant")

    # 3. Verify dual-layer history
    layer1 = await get_layer1_items(session_id)  # May be summarized
    layer2 = await get_layer2_items(session_id)  # Full 200 items
    assert len(layer2) == 200

    # 4. Switch session
    session_id_2 = await create_session_command(title="Second")
    await switch_session_command(session_id_2)

    # 5. Verify workspace isolation
    workspace_1 = get_session_workspace(session_id)
    workspace_2 = get_session_workspace(session_id_2)
    assert workspace_1 != workspace_2

    # 6. Delete and verify cleanup
    await delete_session_command(session_id)
    assert not workspace_1.exists()
    assert not await session_exists(session_id)
```

### Example 2: File Operations with Security
```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_file_operations_security():
    """Test workspace isolation prevents cross-session access."""

    session_1 = await create_session_command(title="Session 1")
    session_2 = await create_session_command(title="Session 2")

    # Write secret file in session 1
    workspace_1 = get_session_workspace(session_1)
    (workspace_1 / "secret.txt").write_text("Secret data")

    # Switch to session 2
    await switch_session_command(session_2)

    # Try to list files - should NOT see session 1's files
    files = await list_directory_tool(".")
    assert "secret.txt" not in [f["name"] for f in files]

    # Try path traversal - should FAIL
    with pytest.raises(SecurityError):
        await read_file_tool("../session_1/secret.txt")
```

### Example 3: Agent with MCP Tools
```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_with_mcp_servers():
    """Test Agent using real MCP server tools."""

    # Initialize MCP servers
    await initialize_all_mcp_servers()

    session_id = await create_session_command(title="MCP Test")

    # Verify MCP tools available
    tools = get_all_tools()
    assert "sequential_thinking" in [t["name"] for t in tools]
    assert "fetch" in [t["name"] for t in tools]

    # Use sequential thinking tool
    await process_user_input(
        session_id,
        "Think step by step: How to implement OAuth?"
    )

    # Verify tool was called
    messages = await get_all_messages(session_id)
    tool_calls = [m for m in messages if m.get("tool") == "sequential_thinking"]
    assert len(tool_calls) > 0
```

## Time Estimates

| Phase | Task | Time |
|-------|------|------|
| 1-3 | Unit tests to 85% | 4-5 hours |
| 4 | Session lifecycle integration | 3-4 hours |
| 5 | File operations integration | 3-4 hours |
| 6 | Agent & tools integration | 4-5 hours |
| **Total** | **Complete test suite** | **14-18 hours** |

## Quick Start

```bash
cd /Users/nick.peterson/Developer/chat-juicer
git checkout test-suite
make setup
make test-coverage  # Should show 81.87%, 547 tests

# Start with Phase 1
# Edit: tests/unit/core/test_session_commands.py
# Add 15-20 edge case tests
```

## Success Criteria

- ✅ Unit test coverage ≥ 85%
- ✅ 3 integration test files covering critical paths
- ✅ All tests passing consistently
- ✅ Tests run in < 60 seconds total
- ✅ All quality checks passing (make quality)

---
*Last updated: 2025-11-09*
*Status: 81.87% coverage, 547 unit tests, 0 integration tests*
