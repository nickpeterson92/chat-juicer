"""Tests for text editing tools.

Tests agent tools for text manipulation.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from tools.text_editing import (
    EditOperation,
    edit_file,
    find_text_with_flexible_whitespace,
    generate_diff,
    normalize_whitespace_for_matching,
    resolve_edit_path,
)


class TestResolveEditPath:
    """Tests for resolve_edit_path function."""

    def test_resolve_plain_filename(self) -> None:
        """Test that plain filenames get output/ prepended."""
        assert resolve_edit_path("report.md") == "output/report.md"

    def test_resolve_relative_path(self) -> None:
        """Test that relative paths get output/ prepended."""
        assert resolve_edit_path("drafts/v2.md") == "output/drafts/v2.md"

    def test_resolve_output_prefix_not_doubled(self) -> None:
        """Test that output/ prefix is not doubled."""
        assert resolve_edit_path("output/report.md") == "output/report.md"

    def test_resolve_sources_prefix_unchanged(self) -> None:
        """Test that sources/ paths remain unchanged."""
        assert resolve_edit_path("sources/input.txt") == "sources/input.txt"

    def test_resolve_templates_prefix_unchanged(self) -> None:
        """Test that templates/ paths remain unchanged."""
        assert resolve_edit_path("templates/base.md") == "templates/base.md"

    def test_resolve_absolute_path_unchanged(self) -> None:
        """Test that absolute paths remain unchanged."""
        assert resolve_edit_path("/absolute/path.md") == "/absolute/path.md"

    def test_resolve_parent_relative_unchanged(self) -> None:
        """Test that ../ paths remain unchanged."""
        assert resolve_edit_path("../other/file.md") == "../other/file.md"


class TestNormalizeWhitespaceForMatching:
    """Tests for normalize_whitespace_for_matching function."""

    def test_normalize_single_line(self) -> None:
        """Test normalizing whitespace on single line."""
        text = "hello    world"
        result = normalize_whitespace_for_matching(text)
        assert result == "hello world"

    def test_normalize_preserves_newlines(self) -> None:
        """Test that newlines are preserved."""
        text = "line 1\nline  2\nline   3"
        result = normalize_whitespace_for_matching(text)
        assert result == "line 1\nline 2\nline 3"

    def test_normalize_tabs_to_spaces(self) -> None:
        """Test that tabs are normalized to spaces."""
        text = "hello\t\tworld"
        result = normalize_whitespace_for_matching(text)
        assert result == "hello world"

    def test_normalize_mixed_whitespace(self) -> None:
        """Test normalizing mixed whitespace."""
        text = "  indented\t  text  "
        result = normalize_whitespace_for_matching(text)
        assert result == "indented text"

    def test_normalize_empty_lines(self) -> None:
        """Test that empty lines become empty strings."""
        text = "line1\n\nline3"
        result = normalize_whitespace_for_matching(text)
        assert result == "line1\n\nline3"


class TestFindTextWithFlexibleWhitespace:
    """Tests for find_text_with_flexible_whitespace function."""

    def test_find_exact_match(self) -> None:
        """Test finding exact match."""
        content = "Hello world\nThis is a test"
        search = "Hello world"
        result = find_text_with_flexible_whitespace(content, search)
        assert result == 0

    def test_find_with_different_whitespace(self) -> None:
        """Test finding text with different whitespace."""
        content = "Hello    world\nThis is a test"
        search = "Hello world"
        result = find_text_with_flexible_whitespace(content, search)
        assert result >= 0  # Should find it with normalized matching

    def test_find_not_found(self) -> None:
        """Test when text is not found."""
        content = "Hello world"
        search = "Goodbye"
        result = find_text_with_flexible_whitespace(content, search)
        assert result == -1

    def test_find_multiline_text(self) -> None:
        """Test finding multiline text."""
        content = "Line 1\nLine 2\nLine 3"
        search = "Line 2"
        result = find_text_with_flexible_whitespace(content, search)
        assert result > 0


class TestGenerateDiff:
    """Tests for generate_diff function."""

    def test_generate_diff_with_changes(self) -> None:
        """Test generating diff with changes."""
        original = "Line 1\nLine 2\nLine 3"
        new = "Line 1\nModified Line 2\nLine 3"

        diff = generate_diff(original, new, "test.txt")

        assert "test.txt" in diff
        assert "-Line 2" in diff or "Line 2" in diff
        assert "+Modified Line 2" in diff or "Modified Line 2" in diff

    def test_generate_diff_no_changes(self) -> None:
        """Test generating diff with no changes."""
        content = "Line 1\nLine 2"

        diff = generate_diff(content, content, "test.txt")

        # Empty diff or minimal header
        assert len(diff) < 100  # Minimal diff

    def test_generate_diff_addition(self) -> None:
        """Test diff with added lines."""
        original = "Line 1\nLine 2"
        new = "Line 1\nLine 2\nLine 3"

        diff = generate_diff(original, new, "test.txt")

        assert "Line 3" in diff


class TestEditFile:
    """Tests for edit_file function."""

    @pytest.mark.asyncio
    async def test_edit_file_single_replacement(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test editing file with single replacement."""
        # Create test file with output directory
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        test_file = output_dir / "test.txt"
        test_file.write_text("Hello world\nThis is a test")

        monkeypatch.chdir(tmp_path)

        edits = [EditOperation(oldText="world", newText="universe")]
        result = await edit_file(
            file_path="test.txt",  # Will be resolved to output/test.txt
            edits=edits,
            session_id=None
        )

        data = json.loads(result)
        assert data["success"] is True
        assert data["changes_made"] == 1
        assert data["file_path"] is not None
        assert "universe" in test_file.read_text()

    @pytest.mark.asyncio
    async def test_edit_file_multiple_replacements(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test editing file with multiple replacements."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        test_file = output_dir / "test.txt"
        test_file.write_text("Hello world\nVersion 1.0\nGoodbye")

        monkeypatch.chdir(tmp_path)

        edits = [
            EditOperation(oldText="world", newText="universe"),
            EditOperation(oldText="1.0", newText="2.0")
        ]
        result = await edit_file(
            file_path="test.txt",
            edits=edits,
            session_id=None
        )

        data = json.loads(result)
        assert data["success"] is True
        assert data["changes_made"] == 2
        content = test_file.read_text()
        assert "universe" in content
        assert "2.0" in content

    @pytest.mark.asyncio
    async def test_edit_file_text_not_found(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test editing when old text is not found."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        test_file = output_dir / "test.txt"
        test_file.write_text("Hello world")

        monkeypatch.chdir(tmp_path)

        edits = [EditOperation(oldText="missing text", newText="replacement")]
        result = await edit_file(
            file_path="test.txt",
            edits=edits,
            session_id=None
        )

        data = json.loads(result)
        assert data["success"] is False
        assert "not found" in data["error"].lower()

    @pytest.mark.asyncio
    async def test_edit_file_empty_edits(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test editing with no edits provided."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        test_file = output_dir / "test.txt"
        test_file.write_text("Hello world")

        monkeypatch.chdir(tmp_path)

        result = await edit_file(
            file_path="test.txt",
            edits=[],
            session_id=None
        )

        data = json.loads(result)
        assert data["success"] is False
        assert "no edits" in data["error"].lower()

    @pytest.mark.asyncio
    async def test_edit_file_with_flexible_whitespace(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test editing with flexible whitespace matching."""
        output_dir = tmp_path / "output"
        output_dir.mkdir()
        test_file = output_dir / "test.txt"
        test_file.write_text("Hello    world")  # Multiple spaces

        monkeypatch.chdir(tmp_path)

        edits = [EditOperation(oldText="Hello world", newText="Hello universe")]  # Single space
        result = await edit_file(
            file_path="test.txt",
            edits=edits,
            session_id=None
        )

        data = json.loads(result)
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_edit_file_with_session(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """Test editing with session workspace."""
        # Create session workspace
        session_workspace = tmp_path / "data" / "files" / "chat_test" / "output"
        session_workspace.mkdir(parents=True)
        test_file = session_workspace / "test.txt"
        test_file.write_text("Original text")

        monkeypatch.chdir(tmp_path)

        edits = [EditOperation(oldText="Original", newText="Modified")]
        result = await edit_file(
            file_path="test.txt",
            edits=edits,
            session_id="chat_test"
        )

        data = json.loads(result)
        assert data["success"] is True
