"""Tests for SessionFileContext."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.services.file_context import SessionFileContext, session_file_context


class TestSessionFileContext:
    """Tests for SessionFileContext class."""

    def test_init(self) -> None:
        """Test SessionFileContext initialization."""
        mock_file_service = MagicMock()
        mock_file_service.base_path = "data/files"

        ctx = SessionFileContext(
            file_service=mock_file_service,
            session_id="test-session",
            base_folder="sources",
        )

        assert ctx.session_id == "test-session"
        assert ctx.base_folder == "sources"
        assert ctx.file_service is mock_file_service
        assert "test-session" in str(ctx.base_path)

    def test_init_default_base_path(self) -> None:
        """Test initialization when file_service has no base_path."""
        mock_file_service = MagicMock(spec=[])  # No base_path attribute

        ctx = SessionFileContext(
            file_service=mock_file_service,
            session_id="session-123",
        )

        # Should use default "data/files"
        assert "data/files" in str(ctx.base_path)

    @pytest.mark.asyncio
    async def test_aenter(self, tmp_path: Path) -> None:
        """Test async context manager entry creates directory."""
        mock_file_service = MagicMock()
        mock_file_service.base_path = str(tmp_path)

        ctx = SessionFileContext(
            file_service=mock_file_service,
            session_id="test-session",
        )
        ctx.base_path = tmp_path / "test-session"

        result = await ctx.__aenter__()

        assert result is ctx
        assert ctx.base_path.exists()

    @pytest.mark.asyncio
    async def test_aexit(self) -> None:
        """Test async context manager exit returns None."""
        mock_file_service = MagicMock()
        ctx = SessionFileContext(mock_file_service, "session")

        result = await ctx.__aexit__(None, None, None)

        assert result is None

    def test_resolve_path(self, tmp_path: Path) -> None:
        """Test path resolution within session workspace."""
        mock_file_service = MagicMock()
        ctx = SessionFileContext(mock_file_service, "session")
        ctx.base_path = tmp_path

        resolved = ctx.resolve_path("output", "file.txt")

        assert resolved == tmp_path / "output" / "file.txt"

    @pytest.mark.asyncio
    async def test_save_file(self) -> None:
        """Test save_file delegates to file service."""
        mock_file_service = MagicMock()
        mock_file_service.save_file = AsyncMock(return_value={"path": "test/file.txt"})

        ctx = SessionFileContext(mock_file_service, "session-123")

        result = await ctx.save_file(
            folder="output",
            filename="doc.pdf",
            content=b"PDF content",
            content_type="application/pdf",
        )

        assert result == {"path": "test/file.txt"}
        mock_file_service.save_file.assert_called_once_with(
            session_id="session-123",
            folder="output",
            filename="doc.pdf",
            content=b"PDF content",
            content_type="application/pdf",
        )


class TestSessionFileContextManager:
    """Tests for session_file_context async context manager."""

    @pytest.mark.asyncio
    async def test_context_manager(self, tmp_path: Path) -> None:
        """Test session_file_context yields SessionFileContext."""
        mock_file_service = MagicMock()
        mock_file_service.base_path = str(tmp_path)

        async with session_file_context(
            file_service=mock_file_service,
            session_id="test-session",
            base_folder="sources",
        ) as ctx:
            assert isinstance(ctx, SessionFileContext)
            assert ctx.session_id == "test-session"
            assert ctx.base_folder == "sources"
