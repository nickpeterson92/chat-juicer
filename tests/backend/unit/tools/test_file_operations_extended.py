"""Extended tests for file_operations to increase coverage.

Covers error paths, edge cases, and conversion failures.
"""

from __future__ import annotations

import json

from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest

from tools.file_operations import read_file, search_files


class TestReadFileErrorPaths:
    """Test error paths in read_file function."""

    @pytest.mark.asyncio
    async def test_read_file_unicode_decode_error_partial(self, temp_dir: Path) -> None:
        """Test read_file handles UnicodeDecodeError in partial read."""
        # Create a binary file with non-UTF-8 data in project directory
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        binary_file = sources_dir / "binary.dat"
        binary_file.write_bytes(b"\x80\x81\x82\x83")

        try:
            result_json = await read_file(str(binary_file), head=2)
            result = json.loads(result_json)

            assert result["success"] is False
            assert "not text/UTF-8" in result["error"]
        finally:
            # Clean up
            if binary_file.exists():
                binary_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_exception_during_partial_read(self, temp_dir: Path) -> None:
        """Test read_file handles exceptions during partial read."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        test_file = sources_dir / "test.txt"
        test_file.write_text("Line 1\nLine 2\nLine 3\n")

        try:
            # Mock aiofiles.open to raise an exception
            with patch("tools.file_operations.aiofiles.open", side_effect=OSError("Disk error")):
                result_json = await read_file(str(test_file), head=1)
                result = json.loads(result_json)

                assert result["success"] is False
                assert "Failed to read file" in result["error"]
        finally:
            if test_file.exists():
                test_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_markitdown_not_available(self, temp_dir: Path) -> None:
        """Test read_file when markitdown is not available."""
        # Create a PDF file (needs conversion)
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        pdf_file = sources_dir / "document.pdf"
        pdf_file.write_text("Fake PDF content")

        try:
            with patch("tools.file_operations.get_markitdown_converter", return_value=None):
                result_json = await read_file(str(pdf_file))
                result = json.loads(result_json)

                assert result["success"] is False
                assert "MarkItDown is required" in result["error"]
                assert "pip install markitdown" in result["error"]
        finally:
            if pdf_file.exists():
                pdf_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_markitdown_import_error(self, temp_dir: Path) -> None:
        """Test read_file handles ImportError from markitdown."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        xlsx_file = sources_dir / "data.xlsx"
        xlsx_file.write_text("Fake Excel content")

        try:
            mock_converter = Mock()
            mock_converter.convert.side_effect = ImportError("openpyxl not installed")

            with patch("tools.file_operations.get_markitdown_converter", return_value=mock_converter):
                result_json = await read_file(str(xlsx_file))
                result = json.loads(result_json)

                assert result["success"] is False
                assert "Missing dependencies" in result["error"]
                assert "openpyxl" in result["error"]
                assert "pip install 'markitdown[all]'" in result["error"]
        finally:
            if xlsx_file.exists():
                xlsx_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_markitdown_empty_content(self, temp_dir: Path) -> None:
        """Test read_file handles empty markitdown conversion result."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        pdf_file = sources_dir / "empty.pdf"
        pdf_file.write_text("Fake PDF")

        try:
            mock_converter = Mock()
            mock_result = Mock()
            mock_result.text_content = ""  # Empty conversion
            mock_converter.convert.return_value = mock_result

            with (
                patch("tools.file_operations.get_markitdown_converter", return_value=mock_converter),
                patch("tools.file_operations.read_file_content", return_value=("fallback content", None)),
            ):
                result_json = await read_file(str(pdf_file))
                result = json.loads(result_json)

                # Should fall back to direct read
                assert result["success"] is True
                assert result["content"] == "fallback content"
        finally:
            if pdf_file.exists():
                pdf_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_markitdown_conversion_exception(self, temp_dir: Path) -> None:
        """Test read_file handles conversion exceptions gracefully."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        pdf_file = sources_dir / "corrupt.pdf"
        pdf_file.write_text("Fake corrupt PDF")

        try:
            mock_converter = Mock()
            mock_converter.convert.side_effect = Exception("Conversion failed")

            with (
                patch("tools.file_operations.get_markitdown_converter", return_value=mock_converter),
                patch("tools.file_operations.read_file_content", return_value=("fallback content", None)),
            ):
                result_json = await read_file(str(pdf_file))
                result = json.loads(result_json)

                # Should fall back to direct read
                assert result["success"] is True
                assert result["content"] == "fallback content"
        finally:
            if pdf_file.exists():
                pdf_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_direct_read_error(self, temp_dir: Path) -> None:
        """Test read_file handles direct read errors."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        pdf_file = sources_dir / "test.pdf"
        pdf_file.write_text("Fake PDF")

        try:
            mock_converter = Mock()
            mock_converter.convert.side_effect = Exception("Conversion failed")

            with (
                patch("tools.file_operations.get_markitdown_converter", return_value=mock_converter),
                patch("tools.file_operations.read_file_content", return_value=(None, "Permission denied")),
            ):
                result_json = await read_file(str(pdf_file))
                result = json.loads(result_json)

                assert result["success"] is False
                assert "Permission denied" in result["error"]
        finally:
            if pdf_file.exists():
                pdf_file.unlink()

    @pytest.mark.asyncio
    @patch("tools.file_operations.summarize_content")
    @patch("tools.file_operations.count_tokens")
    async def test_read_file_triggers_summarization(
        self,
        mock_count_tokens: Mock,
        mock_summarize: AsyncMock,
        temp_dir: Path,
    ) -> None:
        """Test read_file triggers summarization for large documents."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        large_file = sources_dir / "large.txt"
        large_content = "x" * 100000  # Large file
        large_file.write_text(large_content)

        try:
            # Mock token counting to exceed threshold
            mock_count_tokens.side_effect = [
                {"exact_tokens": 200000},  # First count (exceeds threshold)
                {"exact_tokens": 50000},  # After summarization
            ]

            # Mock summarization
            mock_summarize.return_value = "Summarized content"

            result_json = await read_file(str(large_file))
            result = json.loads(result_json)

            assert result["success"] is True
            assert "automatically summarized" in result["content"]
            assert "Summarized content" in result["content"]
            mock_summarize.assert_called_once()
        finally:
            if large_file.exists():
                large_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_tail_parameter(self, temp_dir: Path) -> None:
        """Test read_file with tail parameter."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        test_file = sources_dir / "lines.txt"
        test_file.write_text("Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n")

        try:
            result_json = await read_file(str(test_file), tail=2)
            result = json.loads(result_json)

            assert result["success"] is True
            assert "Line 4" in result["content"]
            assert "Line 5" in result["content"]
            assert "Line 1" not in result["content"]
        finally:
            if test_file.exists():
                test_file.unlink()

    @pytest.mark.asyncio
    async def test_read_file_tail_exceeds_file_lines(self, temp_dir: Path) -> None:
        """Test read_file with tail exceeding file lines."""
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        test_file = sources_dir / "short.txt"
        test_file.write_text("Line 1\nLine 2\n")

        try:
            result_json = await read_file(str(test_file), tail=10)
            result = json.loads(result_json)

            assert result["success"] is True
            # Should return all lines when tail exceeds file length
            assert "Line 1" in result["content"]
            assert "Line 2" in result["content"]
        finally:
            if test_file.exists():
                test_file.unlink()


class TestSearchFilesExtended:
    """Extended tests for search_files function."""

    @pytest.mark.asyncio
    async def test_search_files_validates_base_path(self) -> None:
        """Test search_files validates base path."""
        result_json = await search_files("*.txt", base_path="/nonexistent/path")
        result = json.loads(result_json)

        assert result["success"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_search_files_with_session_isolation(self, temp_dir: Path) -> None:
        """Test search_files respects session isolation."""
        # Create session directory structure in temp_dir (not real data/files/)
        session_id = "chat_test123"
        session_dir = temp_dir / "files" / session_id / "sources"
        session_dir.mkdir(parents=True, exist_ok=True)

        # Create test files
        (session_dir / "test1.txt").write_text("Test 1")
        (session_dir / "test2.txt").write_text("Test 2")

        with patch("tools.file_operations.validate_directory_path") as mock_validate:
            mock_validate.return_value = (session_dir, None)

            result_json = await search_files(
                "*.txt",
                base_path="sources",
                session_id=session_id,
            )
            result = json.loads(result_json)

            assert result["success"] is True
            assert result["count"] == 2

    @pytest.mark.asyncio
    async def test_search_files_non_recursive(self, temp_dir: Path) -> None:
        """Test search_files with recursive=False."""
        # Create nested structure in sources
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)
        subdir = sources_dir / "subdir"
        subdir.mkdir(exist_ok=True)

        try:
            (sources_dir / "root.txt").write_text("Root file")
            (subdir / "nested.txt").write_text("Nested file")

            result_json = await search_files(
                "*.txt",
                base_path="sources",
                recursive=False,
            )
            result = json.loads(result_json)

            assert result["success"] is True
            # Should only find root.txt, not nested.txt
            assert result["count"] == 1
            assert result["items"][0]["name"] == "root.txt"
        finally:
            # Cleanup
            if (sources_dir / "root.txt").exists():
                (sources_dir / "root.txt").unlink()
            if (subdir / "nested.txt").exists():
                (subdir / "nested.txt").unlink()
            if subdir.exists():
                subdir.rmdir()

    @pytest.mark.asyncio
    async def test_search_files_max_results_truncation(self, temp_dir: Path) -> None:
        """Test search_files truncates results at max_results."""
        # Create many files in sources
        sources_dir = Path("sources")
        sources_dir.mkdir(exist_ok=True)

        try:
            for i in range(15):
                (sources_dir / f"file{i}.txt").write_text(f"Content {i}")

            result_json = await search_files(
                "*.txt",
                base_path="sources",
                max_results=10,
            )
            result = json.loads(result_json)

            assert result["success"] is True
            assert result["count"] == 10
            assert result["truncated"] is True
        finally:
            # Cleanup
            for i in range(15):
                file_path = sources_dir / f"file{i}.txt"
                if file_path.exists():
                    file_path.unlink()

    @pytest.mark.asyncio
    async def test_search_files_exception_handling(self) -> None:
        """Test search_files handles exceptions gracefully."""
        with patch("tools.file_operations.validate_directory_path") as mock_validate:
            mock_validate.side_effect = Exception("Unexpected error")

            result_json = await search_files("*.txt", base_path=".")
            result = json.loads(result_json)

            assert result["success"] is False
            assert "Search failed" in result["error"]
