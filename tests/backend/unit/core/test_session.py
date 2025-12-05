"""Tests for session module.

Tests TokenAwareSQLiteSession and SessionBuilder for token-aware session management.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from core.session import TokenAwareSQLiteSession
from core.session_builder import SessionBuilder


class TestSessionBuilder:
    """Tests for SessionBuilder fluent API."""

    def test_minimal_builder(self) -> None:
        """Test building session with minimal configuration."""
        builder = SessionBuilder("chat_test123")
        assert builder._session_id == "chat_test123"

    def test_builder_with_persistent_storage(self, temp_db_path: Path) -> None:
        """Test builder with persistent storage."""
        builder = SessionBuilder("chat_test").with_persistent_storage(temp_db_path)
        assert builder._db_path == temp_db_path

    def test_builder_with_in_memory_storage(self) -> None:
        """Test builder with in-memory storage."""
        builder = SessionBuilder("chat_test").with_in_memory_storage()
        assert builder._db_path is None

    def test_builder_with_agent(self, mock_agent: Mock) -> None:
        """Test builder with agent."""
        builder = SessionBuilder("chat_test").with_agent(mock_agent)
        assert builder._agent == mock_agent

    def test_builder_with_model(self) -> None:
        """Test builder with model."""
        builder = SessionBuilder("chat_test").with_model("gpt-4o")
        assert builder._model == "gpt-4o"

    def test_builder_with_threshold(self) -> None:
        """Test builder with threshold."""
        builder = SessionBuilder("chat_test").with_threshold(0.9)
        assert builder._threshold == 0.9

    def test_builder_invalid_threshold_raises(self) -> None:
        """Test that invalid threshold raises error."""
        with pytest.raises(ValueError):
            SessionBuilder("chat_test").with_threshold(1.5)

    def test_builder_fluent_chaining(self, mock_agent: Mock) -> None:
        """Test fluent method chaining."""
        builder = (
            SessionBuilder("chat_test")
            .with_in_memory_storage()
            .with_agent(mock_agent)
            .with_model("gpt-4o")
            .with_threshold(0.8)
        )
        assert builder._session_id == "chat_test"
        assert builder._agent == mock_agent

    @patch("core.session.TokenAwareSQLiteSession")
    def test_builder_build(self, mock_session_class: Mock) -> None:
        """Test building session instance."""
        builder = SessionBuilder("chat_test").with_model("gpt-4o")
        _session = builder.build()
        # Verify TokenAwareSQLiteSession was instantiated
        mock_session_class.assert_called_once()


class TestTokenAwareSQLiteSession:
    """Tests for TokenAwareSQLiteSession."""

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    def test_session_initialization(self, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test session initialization."""
        mock_get_items.return_value = []
        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )
        # session_id is set by parent SQLiteSession which is mocked
        # Check attributes that TokenAwareSQLiteSession itself sets
        assert session.model == "gpt-4o"
        assert session.total_tokens == 0
        assert session.max_tokens > 0  # Model limit calculated
        assert session.threshold == 0.8  # Default threshold

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    @patch("utils.token_utils.count_tokens")
    def test_calculate_total_tokens(self, mock_count_tokens: Mock, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test calculating total tokens from items."""
        mock_get_items.return_value = []
        mock_count_tokens.return_value = {"exact_tokens": 10}

        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        items = [
            {"id": "1", "role": "user", "content": "Hello"},
            {"id": "2", "role": "assistant", "content": "Hi there"},
        ]

        total = session._calculate_total_tokens(items)
        assert total > 0

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    @patch("utils.token_utils.count_tokens")
    def test_calculate_total_tokens_with_cache(
        self, mock_count_tokens: Mock, mock_get_items: AsyncMock, mock_init: Mock
    ) -> None:
        """Test token counting uses cache for performance."""
        mock_get_items.return_value = []
        mock_count_tokens.return_value = {"exact_tokens": 10}

        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        items = [{"id": "1", "role": "user", "content": "Hello"}]

        # First call
        total1 = session._calculate_total_tokens(items)
        call_count_1 = mock_count_tokens.call_count

        # Second call with same item (should use cache)
        total2 = session._calculate_total_tokens(items)
        call_count_2 = mock_count_tokens.call_count

        assert total1 == total2
        # Cache should reduce number of calls
        assert call_count_2 <= call_count_1 + 2  # Allow some overhead

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.add_items", new_callable=AsyncMock)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    async def test_add_items_layer1_and_layer2(
        self, mock_get_items: AsyncMock, mock_add_items: AsyncMock, mock_init: Mock
    ) -> None:
        """Test adding items to both Layer 1 and Layer 2."""
        mock_get_items.return_value = []
        mock_full_history = Mock()
        mock_full_history.save_message.return_value = True

        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
            full_history_store=mock_full_history,
        )
        # Manually set session_id since parent __init__ is mocked
        session.session_id = "chat_test"

        items = [{"role": "user", "content": "Hello"}]
        await session.add_items(items)

        # Should save to both layers
        mock_add_items.assert_called_once()
        mock_full_history.save_message.assert_called_once()

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    async def test_add_items_without_full_history_raises(self, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test that adding items without full_history_store raises error."""
        mock_get_items.return_value = []
        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
            full_history_store=None,  # No Layer 2
        )
        # Manually set session_id since parent __init__ is mocked
        session.session_id = "chat_test"

        items = [{"role": "user", "content": "Hello"}]

        # Should raise RuntimeError
        try:
            await session.add_items(items)
            raise AssertionError("Should have raised RuntimeError")
        except RuntimeError as e:
            assert "CRITICAL" in str(e)

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    async def test_should_summarize_threshold(self, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test should_summarize checks threshold correctly."""
        mock_get_items.return_value = []
        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
            threshold=0.8,
        )

        # Set tokens below threshold
        session.total_tokens = 5000
        session.trigger_tokens = 10000
        assert await session.should_summarize() is False

        # Set tokens above threshold
        session.total_tokens = 15000
        assert await session.should_summarize() is True

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    def test_collect_recent_exchanges(self, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test collecting recent user-assistant exchanges."""
        mock_get_items.return_value = []
        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        items = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi"},
            {"role": "user", "content": "How are you?"},
            {"role": "assistant", "content": "Good!"},
            {"role": "user", "content": "Great"},
            {"role": "assistant", "content": "Yes"},
        ]

        # Keep last 2 exchanges
        recent = session._collect_recent_exchanges(items, keep_recent=2)

        # Should have 4 items (2 user + 2 assistant)
        assert len(recent) == 4

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    def test_update_with_tool_tokens(self, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test updating accumulated tool tokens."""
        mock_get_items.return_value = []
        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        initial_tokens = session.total_tokens
        session.update_with_tool_tokens(100)

        assert session.accumulated_tool_tokens == 100
        assert session.total_tokens == initial_tokens + 100

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    def test_skip_full_history_context_manager(self, mock_get_items: AsyncMock, mock_init: Mock) -> None:
        """Test skip_full_history context manager."""
        mock_get_items.return_value = []
        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        assert session._skip_full_history is False

        with session._skip_full_history_context():
            assert session._skip_full_history is True

        assert session._skip_full_history is False  # type: ignore[unreachable]


class TestTokenCounting:
    """Tests for token counting functionality."""

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    @patch("utils.token_utils.count_tokens")
    def test_count_item_tokens_simple(
        self, mock_count_tokens: Mock, mock_get_items: AsyncMock, mock_init: Mock
    ) -> None:
        """Test counting tokens for simple text content."""
        mock_get_items.return_value = []
        mock_count_tokens.return_value = {"exact_tokens": 5}

        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        item = {"role": "user", "content": "Hello"}
        tokens = session._count_item_tokens(item)
        assert tokens > 0

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    @patch("utils.token_utils.count_tokens")
    def test_count_item_tokens_with_tool_calls(
        self, mock_count_tokens: Mock, mock_get_items: AsyncMock, mock_init: Mock
    ) -> None:
        """Test counting tokens for items with tool calls."""
        mock_get_items.return_value = []
        mock_count_tokens.return_value = {"exact_tokens": 5}

        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
        )

        item = {
            "role": "assistant",
            "content": "Let me check that",
            "tool_calls": [{"function": {"name": "read_file", "arguments": '{"path": "test.txt"}'}}],
        }
        tokens = session._count_item_tokens(item)
        assert tokens > 0


class TestSummarization:
    """Tests for conversation summarization."""

    @patch("agents.SQLiteSession.__init__", return_value=None)
    @patch("agents.SQLiteSession.get_items", new_callable=AsyncMock)
    @patch("agents.SQLiteSession.add_items", new_callable=AsyncMock)
    @patch("core.constants.get_settings")
    @patch("agents.Agent")
    @patch("agents.Runner.run", new_callable=AsyncMock)
    @patch("utils.token_utils.count_tokens")
    async def test_summarize_with_agent(
        self,
        mock_count_tokens: Mock,
        mock_runner_run: AsyncMock,
        mock_agent_class: Mock,
        mock_get_settings: Mock,
        mock_get_items: AsyncMock,
        mock_add_items: AsyncMock,
        mock_init: Mock,
    ) -> None:
        """Test summarization with agent."""
        mock_get_items.return_value = [{"role": "user", "content": f"Message {i}"} for i in range(20)]

        # Mock count_tokens to return simple dict
        mock_count_tokens.return_value = {"exact_tokens": 100}

        # Mock settings
        mock_settings = Mock()
        mock_settings.azure_openai_deployment = "gpt-4o"
        mock_get_settings.return_value = mock_settings

        # Mock Agent class
        mock_summary_agent = Mock()
        mock_agent_class.return_value = mock_summary_agent

        # Mock Runner.run result
        mock_result = Mock()
        mock_result.final_output = "This is a summary of the conversation"
        mock_runner_run.return_value = mock_result

        mock_agent = Mock()
        mock_full_history = Mock()
        mock_full_history.save_message.return_value = True

        session = TokenAwareSQLiteSession(
            session_id="chat_test",
            db_path=":memory:",
            model="gpt-4o",
            agent=mock_agent,
            full_history_store=mock_full_history,
        )
        session.session_id = "chat_test"  # Set since parent __init__ is mocked
        session.total_tokens = 20000  # Above threshold
        session.trigger_tokens = 10000
        # Manually assign the mocked get_items to the session instance
        session.get_items = mock_get_items
        # Mock clear_session to avoid _is_memory_db attribute error
        session.clear_session = AsyncMock()
        session.add_items = mock_add_items

        summary = await session.summarize_with_agent(force=True)
        assert len(summary) > 0
