from unittest.mock import ANY, AsyncMock, Mock, patch
from uuid import uuid4

import pytest

from api.services.token_aware_session import PostgresTokenAwareSession


@pytest.fixture
def token_session(mock_db_pool: Mock) -> PostgresTokenAwareSession:
    session_uuid = uuid4()
    return PostgresTokenAwareSession(
        session_id="chat_123",
        session_uuid=session_uuid,
        pool=mock_db_pool,
        model="gpt-4o",  # 128k limit
        threshold=0.8,
    )


def test_initialization(token_session: PostgresTokenAwareSession) -> None:
    """Verify correct initialization of token limits."""
    assert token_session.max_tokens == 128000
    assert token_session.trigger_tokens == int(128000 * 0.8)
    assert token_session.total_tokens == 0


@pytest.mark.asyncio
async def test_should_summarize(token_session: PostgresTokenAwareSession) -> None:
    """Test summarization trigger logic."""
    # Below threshold
    token_session.total_tokens = 1000
    assert not await token_session.should_summarize()

    # Above threshold
    token_session.total_tokens = token_session.trigger_tokens + 1
    assert await token_session.should_summarize()


@pytest.mark.asyncio
async def test_add_items_updates_tokens(token_session: PostgresTokenAwareSession) -> None:
    """Test that adding items updates token counts."""
    # Mock token counting
    # We'll mock the internal _count_item_tokens or the imported count_tokens

    with patch("api.services.token_aware_session.count_tokens") as mock_count:
        mock_count.return_value = {"exact_tokens": 10}

        items = [{"role": "user", "content": "hello"}]
        await token_session.add_items(items)

        # 10 tokens + overhead depending on structure
        # Implementation adds overhead in _count_item_tokens
        assert token_session.total_tokens > 0


@pytest.mark.asyncio
async def test_update_db_token_count(token_session: PostgresTokenAwareSession, mock_db_pool: Mock) -> None:
    """Test persisting token count to DB."""
    token_session.total_tokens = 500
    token_session.accumulated_tool_tokens = 50

    await token_session.update_db_token_count()

    conn = mock_db_pool.acquire.return_value.__aenter__.return_value
    conn.execute.assert_called_with(ANY, 500, 50, token_session.session_uuid)


@pytest.mark.asyncio
async def test_summarize_with_agent_skipped(token_session: PostgresTokenAwareSession) -> None:
    """Test summarization skipped if below threshold."""
    token_session.total_tokens = 100

    result = await token_session.summarize_with_agent()
    assert result == ""


@pytest.mark.asyncio
async def test_summarize_with_agent_execution(
    token_session: PostgresTokenAwareSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test successful execution of summarization workflow."""
    # 1. Setup Validation State
    token_session.total_tokens = 200000  # Way above threshold

    # 2. Mock Dependencies
    # Mock get_items to return enough items
    items = [{"role": "user", "content": f"msg {i}"} for i in range(10)]
    # Ensure they have IDs for cache logic if needed, but dicts ok

    # We need to mock get_items on the superclass (PostgresSession) or on the instance
    # Since we can't easily patch the super call method directly on instance without side effects,
    # let's patch the class method or use AsyncMock on the instance method if it wasn't inherited
    # But it IS inherited.
    # Best way: patch PostgresSession.get_items

    monkeypatch.setattr("api.services.postgres_session.PostgresSession.get_items", AsyncMock(return_value=items))

    # Mock Runner.run
    mock_result = Mock()
    mock_result.final_output = "Summary of conversation"
    monkeypatch.setattr("api.services.token_aware_session.Runner.run", AsyncMock(return_value=mock_result))

    # Mock _repopulate_session to avoid complex DB interactions
    token_session._repopulate_session = AsyncMock()

    # 3. Execute
    result = await token_session.summarize_with_agent(force=True)

    # 4. Verify
    assert result == "Summary of conversation"
    token_session._repopulate_session.assert_called_once()


@pytest.mark.asyncio
async def test_summarize_lock(token_session: PostgresTokenAwareSession) -> None:
    """Test that concurrent summarization requests are locked."""
    # Acquire lock manually
    await token_session._summarization_lock.acquire()

    # Attempt summarize
    result = await token_session.summarize_with_agent(force=True)

    assert result == ""  # Should skip because locked

    token_session._summarization_lock.release()


@pytest.mark.asyncio
async def test_count_item_tokens_complex_structure(
    token_session: PostgresTokenAwareSession,
) -> None:
    # Test text tokens
    with patch("api.services.token_aware_session.count_tokens") as mock_count:
        mock_count.return_value = {"exact_tokens": 5}

        # Test 1: Content as list of dicts (text)
        item1 = {"content": [{"type": "text", "text": "hello"}]}
        c1 = token_session._count_item_tokens(item1)
        assert c1 > 0

        # Test 2: Content as list of dicts (output - for tool results?)
        # Although output usually not in content list dict but ... code supports it
        item2 = {"content": [{"type": "text", "output": "result"}]}
        c2 = token_session._count_item_tokens(item2)
        assert c2 > 0

        # Test 3: Content as list of strings
        item3 = {"content": ["hello", "world"]}
        c3 = token_session._count_item_tokens(item3)
        assert c3 > 0


@pytest.mark.asyncio
async def test_count_item_tokens_with_tools(token_session: PostgresTokenAwareSession) -> None:
    with patch("api.services.token_aware_session.count_tokens") as mock_count:
        mock_count.return_value = {"exact_tokens": 5}

        item = {
            "role": "assistant",
            "content": None,
            "tool_calls": [{"function": {"name": "search", "arguments": "{'algo': 'test'}"}}],
        }
        count = token_session._count_item_tokens(item)
        assert count > 0


@pytest.mark.asyncio
async def test_summarize_agent_failure_empty_summary(
    token_session: PostgresTokenAwareSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_session.total_tokens = 999999

    # Mock items
    items = [{"role": "user", "content": "msg"}] * 10
    monkeypatch.setattr("api.services.postgres_session.PostgresSession.get_items", AsyncMock(return_value=items))

    # Mock Runner returning empty
    mock_res = Mock()
    mock_res.final_output = ""
    monkeypatch.setattr("api.services.token_aware_session.Runner.run", AsyncMock(return_value=mock_res))

    res = await token_session.summarize_with_agent(force=True)
    assert res == ""


@pytest.mark.asyncio
async def test_summarize_agent_exception(
    token_session: PostgresTokenAwareSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    token_session.total_tokens = 999999

    monkeypatch.setattr(
        "api.services.postgres_session.PostgresSession.get_items",
        AsyncMock(return_value=[{"role": "u", "content": "c"}]),
    )
    monkeypatch.setattr("api.services.token_aware_session.Runner.run", AsyncMock(side_effect=Exception("Boom")))

    res = await token_session.summarize_with_agent(force=True)
    assert res == ""


@pytest.mark.asyncio
async def test_repopulate_session(token_session: PostgresTokenAwareSession, monkeypatch: pytest.MonkeyPatch) -> None:
    # Setup
    token_session._count_text_tokens = Mock(return_value=50)
    token_session._calculate_total_tokens = Mock(return_value=20)

    # Mock DB methods
    token_session._clear_llm_context = AsyncMock()
    # Mock super().add_items - we need to patch PostgresSession.add_items
    monkeypatch.setattr("api.services.postgres_session.PostgresSession.add_items", AsyncMock())

    summary = "Previously on chat..."
    recent = [{"role": "user", "content": "recent msg"}]

    await token_session._repopulate_session(summary, recent)

    token_session._clear_llm_context.assert_called_once()
    token_session._calculate_total_tokens.assert_called_with(recent)
    # Total = 50 (summary) + 20 (recent) = 70
    assert token_session.total_tokens == 70
    assert token_session.accumulated_tool_tokens == 0
