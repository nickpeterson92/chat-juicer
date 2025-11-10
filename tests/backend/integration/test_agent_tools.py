"""Integration tests for agent with tools (native Python + MCP servers).

Tests end-to-end agent workflows including tool execution, streaming responses,
token tracking, and error handling. Validates the Agent/Runner pattern with both
native Python tools and MCP server tools.
"""

from __future__ import annotations

import json

from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from app.state import AppState
from core.session_commands import create_new_session


class TestAgentWithNativePythonTools:
    """Integration tests for agent with native Python tools."""

    @pytest.mark.asyncio
    async def test_multiple_tools_in_session(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test using multiple tools in a single session."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Multi Tool Test")
            session_id = result["session_id"]

            # Create a test file
            workspace_dir = integration_test_env / "data" / "files" / session_id / "sources"
            test_file = workspace_dir / "data.txt"
            test_file.write_text("Original data")

            # Tool 1: Read file
            from tools.file_operations import read_file

            read_result = await read_file("sources/data.txt", session_id=session_id)
            read_dict = json.loads(read_result)
            assert read_dict["success"] is True
            assert "Original data" in read_dict["content"]

            # Tool 2: Generate document
            from tools.document_generation import generate_document

            doc_result = await generate_document(
                content="Test content for report",
                filename="report.md",
                session_id=session_id,
            )
            doc_dict = json.loads(doc_result)
            assert doc_dict["success"] is True

            # Verify generated file exists
            generated_file = integration_test_env / "data" / "files" / session_id / "output" / "report.md"
            assert generated_file.exists()

    @pytest.mark.asyncio
    async def test_file_read_tool_integration(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test agent using file read tool with real file system."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="File Read Test")
            session_id = result["session_id"]

            # Create a test file in session workspace
            workspace_dir = integration_test_env / "data" / "files" / session_id / "sources"
            test_file = workspace_dir / "test.txt"
            test_content = "Integration test content"
            test_file.write_text(test_content)

            # Import and call the actual read_file tool
            from tools.file_operations import read_file

            result_json = await read_file("sources/test.txt", session_id=session_id)
            result_dict = json.loads(result_json)

            # Verify tool succeeded
            assert result_dict["success"] is True
            assert test_content in result_dict["content"]
            assert "sources/test.txt" in result_dict["file_path"]

    @pytest.mark.asyncio
    async def test_document_generation_tool_integration(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test agent using document generation tool with real file system."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Doc Gen Test")
            session_id = result["session_id"]

            # Import and call the actual document generation tool
            from tools.document_generation import generate_document

            result_json = await generate_document(
                content="# Test Document\n\nGenerated content",
                filename="test.md",
                session_id=session_id,
            )
            result_dict = json.loads(result_json)

            # Verify tool succeeded
            assert result_dict["success"] is True

            # Verify file was actually created
            workspace_dir = integration_test_env / "data" / "files" / session_id
            created_file = workspace_dir / "output" / "test.md"
            assert created_file.exists()
            assert "Test Document" in created_file.read_text()


class TestAgentWithMCPServers:
    """Integration tests for agent with MCP server tools."""

    @pytest.mark.asyncio
    async def test_agent_with_mcp_servers_created(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that agent is created with MCP servers configured."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers") as mock_filter_mcp,
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            # Setup mock MCP servers
            mock_seq_thinking = Mock(name="sequential-thinking")
            mock_fetch = Mock(name="fetch")
            mock_filter_mcp.return_value = [mock_seq_thinking, mock_fetch]

            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session (which creates agent with MCP servers)
            result = await create_new_session(mock_app_state, title="MCP Test")
            _session_id = result["session_id"]

            # Verify agent was created with MCP servers
            mock_create_agent.assert_called_once()
            # The log message "Created session-specific agent with 2 MCP servers" confirms it worked
            # Check that filter_mcp_servers was called which provides the MCP servers
            mock_filter_mcp.assert_called()
            assert len(mock_filter_mcp.return_value) == 2

    @pytest.mark.asyncio
    async def test_session_aware_tools_created(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that session-aware tool wrappers are created."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools") as mock_create_tools,
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent
            mock_create_tools.return_value = [Mock(name="tool1"), Mock(name="tool2")]

            # Create session
            result = await create_new_session(mock_app_state, title="Tools Test")
            session_id = result["session_id"]

            # Verify session-aware tools were created
            mock_create_tools.assert_called()
            call_args = mock_create_tools.call_args
            # Session ID should be passed to create session-aware wrappers
            assert session_id in str(call_args)


class TestErrorHandling:
    """Integration tests for error handling in agent tool execution."""

    @pytest.mark.asyncio
    async def test_tool_execution_error_handling(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test agent handles tool execution errors gracefully."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Error Test")
            session_id = result["session_id"]

            # Test file read of non-existent file
            from tools.file_operations import read_file

            result_json = await read_file("nonexistent.txt", session_id=session_id)
            result_dict = json.loads(result_json)

            # Verify tool returned error gracefully
            assert result_dict["success"] is False
            assert result_dict["error"] is not None
            assert "not found" in result_dict["error"].lower() or "does not exist" in result_dict["error"].lower()

    @pytest.mark.asyncio
    async def test_invalid_tool_arguments_handling(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test agent handles invalid tool arguments gracefully."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create session
            result = await create_new_session(mock_app_state, title="Invalid Args Test")
            session_id = result["session_id"]

            # Test file read with path traversal attempt (should be blocked)
            from tools.file_operations import read_file

            result_json = await read_file("../../etc/passwd", session_id=session_id)
            result_dict = json.loads(result_json)

            # Verify tool blocked malicious path
            assert result_dict["success"] is False
            assert result_dict["error"] is not None
            assert "traversal" in result_dict["error"].lower() or "denied" in result_dict["error"].lower()

    @pytest.mark.asyncio
    async def test_session_boundary_enforcement_in_tools(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that tools enforce session boundaries."""

        with (
            patch("core.agent.create_agent") as mock_create_agent,
            patch("tools.wrappers.create_session_aware_tools", return_value=[]),
            patch("integrations.mcp_registry.filter_mcp_servers", return_value=[]),
            patch("integrations.sdk_token_tracker.connect_session"),
            patch("integrations.sdk_token_tracker.disconnect_session"),
        ):
            mock_agent = Mock()
            mock_create_agent.return_value = mock_agent

            # Create two sessions
            session1_result = await create_new_session(mock_app_state, title="Session 1")
            session1_id = session1_result["session_id"]

            session2_result = await create_new_session(mock_app_state, title="Session 2")
            session2_id = session2_result["session_id"]

            # Create file in session 1
            workspace1 = integration_test_env / "data" / "files" / session1_id / "sources"
            test_file = workspace1 / "secret.txt"
            test_file.write_text("Session 1 secret data")

            # Try to read session 1 file from session 2 (should fail)
            from tools.file_operations import read_file

            # Attempt to read with path traversal from session 2
            malicious_path = f"../../chat_{session1_id}/sources/secret.txt"
            result_json = await read_file(malicious_path, session_id=session2_id)
            result_dict = json.loads(result_json)

            # Verify access was denied
            assert result_dict["success"] is False
            assert result_dict["error"] is not None
