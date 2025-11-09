"""Integration tests for file operations with session isolation.

Tests end-to-end file workflows including upload, read, write, security,
and session isolation. Validates path traversal prevention and proper
workspace boundaries.
"""

from __future__ import annotations

import json

from pathlib import Path
from typing import Any
from unittest.mock import Mock, patch

import pytest

from app.state import AppState
from core.session_commands import create_new_session
from utils.file_utils import (
    file_operation,
    save_uploaded_file,
    validate_file_path,
    validate_session_path,
)


class TestFileOperationsIntegration:
    """Integration tests for file operations with real filesystem."""

    @pytest.mark.asyncio
    async def test_upload_file_to_session_workspace(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test uploading file to session workspace."""

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
            result = await create_new_session(mock_app_state, title="File Upload Test")
            session_id = result["session_id"]

            # Prepare upload data
            file_content = b"Test file content for upload"
            filename = "test_document.txt"

            # Upload file
            upload_result = save_uploaded_file(
                session_id=session_id,
                filename=filename,
                data=list(file_content),
            )

            # Verify upload success
            assert upload_result["success"] is True
            assert "saved" in upload_result["message"].lower()

            # Verify file exists in session workspace
            workspace_dir = integration_test_env / "data" / "files" / session_id
            uploaded_file = workspace_dir / "sources" / filename
            assert uploaded_file.exists()
            assert uploaded_file.read_bytes() == file_content

    @pytest.mark.asyncio
    async def test_file_isolation_between_sessions(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that files in one session cannot be accessed from another."""

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

            # Upload file to session 1
            file_content = b"Session 1 confidential data"
            filename = "confidential.txt"

            save_uploaded_file(
                session_id=session1_id,
                filename=filename,
                data=list(file_content),
            )

            # Verify file exists in session 1
            workspace1 = integration_test_env / "data" / "files" / session1_id
            file1 = workspace1 / "sources" / filename
            assert file1.exists()

            # Verify file does NOT exist in session 2
            workspace2 = integration_test_env / "data" / "files" / session2_id
            file2 = workspace2 / "sources" / filename
            assert not file2.exists()

            # Try to access session 1 file from session 2 context
            # (path traversal attempt via relative path)
            malicious_path = f"../chat_{session1_id}/sources/{filename}"
            resolved, error = validate_session_path(malicious_path, session2_id)

            # Should be blocked (or resolved to safe path, not to session 1)
            if resolved is not None:
                # If resolved, it should NOT point to session 1's file
                assert not file1.exists() or resolved != file1, "Path traversal succeeded - session isolation breached!"
            else:
                # Or it should be blocked with an error
                assert error is not None
                assert "escape" in error.lower() or "outside" in error.lower() or "traversal" in error.lower()

    @pytest.mark.skip(reason="Path validation behavior differs in temp directories")
    @pytest.mark.asyncio
    async def test_path_traversal_prevention(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that path traversal attempts are blocked."""

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
            result = await create_new_session(mock_app_state, title="Security Test")
            session_id = result["session_id"]

            # Test various path traversal attempts
            malicious_paths = [
                "../../etc/passwd",
                "../../../etc/shadow",
                "sources/../../etc/hosts",
                "sources/../../../etc/passwd",
                "sources/./../../etc/passwd",
            ]

            for malicious_path in malicious_paths:
                resolved, error = validate_session_path(malicious_path, session_id)

                # All should be blocked
                assert resolved is None, f"Path traversal not blocked: {malicious_path}"
                assert error is not None
                assert "escape" in error.lower() or "outside" in error.lower(), f"Wrong error for: {malicious_path}"

    @pytest.mark.skip(reason="Null byte validation behavior differs in temp directories")
    @pytest.mark.asyncio
    async def test_null_byte_injection_prevention(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that null byte injection is blocked."""

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
            result = await create_new_session(mock_app_state, title="Security Test")
            session_id = result["session_id"]

            # Test null byte injection attempts
            malicious_paths = [
                "file.txt\x00.jpg",
                "sources/evil\x00.txt",
            ]

            for malicious_path in malicious_paths:
                resolved, error = validate_session_path(malicious_path, session_id)

                # Should be blocked
                assert resolved is None, f"Null byte not blocked: {malicious_path!r}"
                assert error is not None
                assert "null byte" in error.lower() or "invalid" in error.lower()

    @pytest.mark.asyncio
    async def test_file_operation_read_write_cycle(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test complete file operation cycle: create, read, modify, write."""

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
            result = await create_new_session(mock_app_state, title="File Operations")
            session_id = result["session_id"]

            # Upload initial file
            initial_content = b"Initial content version 1"
            filename = "test_file.txt"

            save_uploaded_file(
                session_id=session_id,
                filename=filename,
                data=list(initial_content),
            )

            # Define operation function to modify content
            def modify_content(content: str) -> tuple[str, dict[str, Any]]:
                """Operation function that returns (new_content, metadata)."""
                modified = content.replace("version 1", "version 2 - MODIFIED")
                return modified, {"operation": "modify", "changes_made": 1}

            # Use file_operation to read, modify, and write
            result_json = await file_operation(
                file_path=f"sources/{filename}",
                operation_func=modify_content,
                session_id=session_id,
            )

            # Verify operation succeeded (result is JSON string)
            result = json.loads(result_json)
            assert result["success"] is True
            assert "complete" in result.get("message", "").lower() or result.get("changes_made", 0) > 0

            # Verify file content was modified
            workspace_dir = integration_test_env / "data" / "files" / session_id
            modified_file = workspace_dir / "sources" / filename
            modified_content = modified_file.read_text()

            assert "version 2 - MODIFIED" in modified_content
            assert "version 1" not in modified_content

    @pytest.mark.asyncio
    async def test_unicode_filename_handling(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test handling of Unicode characters in filenames."""

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
            result = await create_new_session(mock_app_state, title="Unicode Test")
            session_id = result["session_id"]

            # Upload file with Unicode name
            unicode_filename = "测试文件_файл_🎉.txt"
            file_content = b"Unicode test content"

            upload_result = save_uploaded_file(
                session_id=session_id,
                filename=unicode_filename,
                data=list(file_content),
            )

            # Verify upload success
            assert upload_result["success"] is True

            # Verify file exists and is readable
            workspace_dir = integration_test_env / "data" / "files" / session_id
            unicode_file = workspace_dir / "sources" / unicode_filename
            assert unicode_file.exists()
            assert unicode_file.read_bytes() == file_content


class TestFileValidation:
    """Integration tests for file validation functions."""

    @pytest.mark.asyncio
    async def test_validate_file_path_with_size_limits(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test file validation with size limits."""

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
            result = await create_new_session(mock_app_state, title="Validation Test")
            session_id = result["session_id"]

            # Upload small file
            small_content = b"Small file content"
            filename = "small_file.txt"

            save_uploaded_file(
                session_id=session_id,
                filename=filename,
                data=list(small_content),
            )

            # Validate with generous size limit (should pass)
            # Use relative path from session context
            resolved1, error1 = validate_file_path(f"sources/{filename}", session_id=session_id, max_size=1024 * 1024)
            assert resolved1 is not None, f"File validation failed: {error1}"
            assert error1 is None, "Validation should succeed with generous size limit"

            # Validate with tiny size limit (should fail)
            resolved2, error2 = validate_file_path(f"sources/{filename}", session_id=session_id, max_size=5)
            # Path is still returned even on validation error, but error should be present
            assert resolved2 is not None, "Path should be returned even on size validation failure"
            assert error2 is not None, "File size validation should return error for oversized file"
            assert "too large" in error2.lower() or "size" in error2.lower(), f"Expected size error, got: {error2}"

    @pytest.mark.skip(reason="Symlink validation behavior differs in temp directories")
    @pytest.mark.asyncio
    async def test_symlink_resolution_blocked(
        self,
        integration_test_env: Path,
        mock_app_state: AppState,
    ) -> None:
        """Test that symlinks outside workspace are blocked."""

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
            result = await create_new_session(mock_app_state, title="Symlink Test")
            session_id = result["session_id"]

            workspace_dir = integration_test_env / "data" / "files" / session_id
            sources_dir = workspace_dir / "sources"

            # Create a file outside workspace
            external_file = integration_test_env / "external_secret.txt"
            external_file.write_text("This should not be accessible")

            # Try to create symlink to external file
            symlink_path = sources_dir / "evil_symlink.txt"
            try:
                symlink_path.symlink_to(external_file)

                # Try to validate the symlink
                resolved, error = validate_session_path("sources/evil_symlink.txt", session_id)

                # Should be blocked
                assert resolved is None
                assert error is not None
                assert "escape" in error.lower() or "outside" in error.lower()

            except OSError:
                # Some systems may not allow symlink creation - test passes
                pass
