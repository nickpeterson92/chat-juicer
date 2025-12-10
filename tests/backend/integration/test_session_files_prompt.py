"""Integration test for dynamic session file/template injection into system prompt."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from app.runtime import ensure_session_exists
from app.state import AppState


class TestSessionFilesPrompt:
    """Ensure file names are injected into system instructions on session creation."""

    @pytest.mark.asyncio
    async def test_session_files_in_prompt_on_creation(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Create session, add file, and verify instructions include filename."""
        assert mock_app_state.session_manager is not None

        # Create a session with a known ID and workspace
        session_meta = mock_app_state.session_manager.create_session(title="With files")
        session_id = session_meta.session_id

        # Add a file to the session sources directory
        sources_dir = integration_test_env / "data" / "files" / session_id / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)
        (sources_dir / "example.txt").write_text("hello")
        templates_dir = integration_test_env / "data" / "files" / session_id / "templates"
        if not templates_dir.exists():
            templates_dir.mkdir(parents=True, exist_ok=True)
        (templates_dir / "template.md").write_text("# template")

        mock_session_instance = Mock()
        mock_session_instance.session_id = session_id
        mock_session_instance.get_items = AsyncMock(return_value=[])
        mock_session_instance.total_tokens = 0
        mock_session_instance._calculate_total_tokens.return_value = 0

        with (
            patch("app.runtime.create_session_aware_tools", return_value=[]),
            patch("app.runtime.filter_mcp_servers", return_value=[]),
            patch("app.runtime.TokenAwareSQLiteSession", return_value=mock_session_instance),
            patch("app.runtime.connect_session"),
            patch("core.agent.create_agent") as mock_create_agent,
        ):
            mock_create_agent.return_value = Mock()

            _session_ctx, is_new = await ensure_session_exists(mock_app_state, session_id=session_id)

            assert is_new is False
            mock_create_agent.assert_called_once()

            # Instructions passed to create_agent should include the uploaded filename
            _deployment, instructions, _tools, _mcp_servers = mock_create_agent.call_args[0]
            assert "example.txt" in instructions
            assert "Current Session Files" in instructions
            assert "template.md" in instructions
            assert "Available Templates" in instructions
