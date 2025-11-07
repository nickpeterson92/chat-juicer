"""
File operation tools for Chat Juicer.
Provides directory listing and file reading capabilities.
"""

from __future__ import annotations

from pathlib import Path

import aiofiles

from core.constants import (
    CONVERTIBLE_EXTENSIONS,
    DEFAULT_SEARCH_MAX_RESULTS,
    DOCUMENT_SUMMARIZATION_THRESHOLD,
    MAX_FILE_SIZE,
)
from models.api_models import DirectoryListResponse, FileInfo, FileReadResponse
from utils.document_processor import get_markitdown_converter, summarize_content
from utils.file_utils import get_relative_path, read_file_content, validate_directory_path, validate_file_path
from utils.logger import logger
from utils.token_utils import count_tokens


def _create_file_info(file_path: Path) -> FileInfo:
    """Create FileInfo model from Path object.

    Helper function to standardize file metadata extraction across tools.

    Args:
        file_path: Path object to extract metadata from

    Returns:
        FileInfo model with standardized metadata
    """
    return FileInfo(
        name=file_path.name,
        type="folder" if file_path.is_dir() else "file",
        size=file_path.stat().st_size if file_path.is_file() else 0,
        modified=str(file_path.stat().st_mtime),
        file_count=len(list(file_path.iterdir())) if file_path.is_dir() else None,
        extension=file_path.suffix if file_path.is_file() else None,
    )


def list_directory(path: str = ".", session_id: str | None = None, show_hidden: bool = False) -> str:
    """
    List contents of a directory for project discovery.

    Security: When session_id is provided, path is restricted to session workspace.
    Agent works with relative paths (sources/, templates/, output/) - tool handles full resolution.

    Args:
        path: Directory path to list (relative to session workspace if session_id provided)
        session_id: Session ID for workspace isolation (enforces chroot jail)
        show_hidden: Whether to include hidden files/folders

    Returns:
        JSON string with directory contents and metadata
    """
    try:
        # Validate directory path (with session sandbox if session_id provided)
        target_path, error = validate_directory_path(path, check_exists=True, session_id=session_id)
        if error:
            return DirectoryListResponse(success=False, path=path, items=[], error=error).to_json()  # type: ignore[no-any-return]

        items = []
        for item in target_path.iterdir():
            # Skip hidden files unless requested
            if item.name.startswith(".") and not show_hidden:
                continue

            # Create FileInfo model for each item
            file_info = _create_file_info(item)
            items.append(file_info)

        # Sort directories first, then files
        items.sort(key=lambda x: (x.type != "folder", x.name.lower()))

        # Log metadata for humans
        dirs = sum(1 for i in items if i.type == "folder")
        files = sum(1 for i in items if i.type == "file")
        total_size = sum(i.size for i in items if i.type == "file")
        # Note: for list_directory, bytes make more sense than tokens
        logger.info(
            f"Listed {target_path.name}: {dirs} dirs, {files} files, {total_size:,} bytes total",
            functions="list_directory",
        )

        # Return validated response
        return DirectoryListResponse(success=True, path=str(target_path), items=items).to_json()  # type: ignore[no-any-return]

    except Exception as e:
        return DirectoryListResponse(  # type: ignore[no-any-return]
            success=False, path=path, items=[], error=f"Failed to list directory: {e!s}"
        ).to_json()


async def search_files(
    pattern: str,
    base_path: str = ".",
    session_id: str | None = None,
    recursive: bool = True,
    max_results: int = DEFAULT_SEARCH_MAX_RESULTS,
) -> str:
    """
    Search for files matching a glob pattern.

    Security: When session_id is provided, search restricted to session workspace.
    Agent works with relative paths - tool handles full resolution.

    Args:
        pattern: Glob pattern (e.g., "*.md", "**/*.py", "report_*.txt")
        base_path: Directory to start search (default: current directory)
        session_id: Session ID for workspace isolation (enforces chroot jail)
        recursive: Search subdirectories (default: True)
        max_results: Maximum number of results to return (default: 100)

    Returns:
        JSON string with SearchFilesResponse containing matching files
    """
    from models.api_models import SearchFilesResponse

    try:
        # Validate base directory path
        base_dir, error = validate_directory_path(base_path, check_exists=True, session_id=session_id)
        if error:
            return SearchFilesResponse(  # type: ignore[no-any-return]
                success=False, pattern=pattern, base_path=base_path, items=[], count=0, error=error
            ).to_json()

        # Use rglob for recursive, glob for non-recursive
        matches: list[FileInfo] = []
        file_iter = base_dir.rglob(pattern) if recursive else base_dir.glob(pattern)

        # Collect matches up to max_results
        for file_path in file_iter:
            if len(matches) >= max_results:
                break

            # Create FileInfo for each match
            file_info = _create_file_info(file_path)
            matches.append(file_info)

        truncated = len(matches) >= max_results
        count = len(matches)

        # Log search operation
        logger.info(
            f"Searched '{pattern}' in {base_dir.name}: found {count} matches{' (truncated)' if truncated else ''}",
            functions="search_files",
        )

        # Get relative path for response
        relative_base = get_relative_path(base_dir)

        return SearchFilesResponse(  # type: ignore[no-any-return]
            success=True,
            pattern=pattern,
            base_path=str(relative_base),
            items=matches,
            count=count,
            truncated=truncated,
        ).to_json()

    except Exception as e:
        return SearchFilesResponse(  # type: ignore[no-any-return]
            success=False, pattern=pattern, base_path=base_path, items=[], count=0, error=f"Search failed: {e!s}"
        ).to_json()


async def read_file(  # noqa: PLR0911
    file_path: str,
    session_id: str | None = None,
    head: int | None = None,
    tail: int | None = None,
) -> str:
    """
    Read a file's contents for documentation processing.
    Automatically converts non-markdown formats to markdown for token efficiency.
    Protected with 100MB size limit.

    Security: When session_id is provided, path is restricted to session workspace.
    Agent works with relative paths (sources/, templates/, output/) - tool handles full resolution.

    Args:
        file_path: Path to the file to read (relative to session workspace if session_id provided)
        session_id: Session ID for workspace isolation (enforces chroot jail)
        head: Read only first N lines (raw text only, skips conversion)
        tail: Read only last N lines (raw text only, skips conversion)

    Returns:
        JSON string with file contents and metadata
    """
    # Validate path with size check (100MB limit) and session sandbox if session_id provided
    target_file, error = validate_file_path(file_path, check_exists=True, max_size=MAX_FILE_SIZE, session_id=session_id)
    if error:
        return FileReadResponse(success=False, file_path=file_path, error=error).to_json()  # type: ignore[no-any-return]

    try:
        # Handle partial reads (head/tail) - raw text only, skip conversion
        if head is not None or tail is not None:
            try:
                async with aiofiles.open(target_file, encoding="utf-8") as f:
                    if head is not None:
                        # Read first N lines
                        lines = []
                        async for line in f:
                            lines.append(line)
                            if len(lines) >= head:
                                break
                        content = "".join(lines)
                    elif tail is not None:
                        # Read last N lines (read all, take last N)
                        all_lines = await f.readlines()
                        content = "".join(all_lines[-tail:] if len(all_lines) > tail else all_lines)

                # Token counting for partial read
                token_count = count_tokens(content)
                exact_tokens = token_count["exact_tokens"]
                file_size = target_file.stat().st_size

                logger.info(
                    f"Partial read {target_file.name} ({'head' if head else 'tail'}={head or tail}): "
                    f"{len(content)} chars, {len(content.splitlines())} lines, {exact_tokens} tokens",
                    tokens=exact_tokens,
                    functions="read_file",
                    func="partial_read",
                )

                return FileReadResponse(  # type: ignore[no-any-return]
                    success=True,
                    content=content,
                    file_path=str(get_relative_path(target_file)),
                    size=file_size,
                    format="text (partial)",
                ).to_json()

            except UnicodeDecodeError:
                return FileReadResponse(  # type: ignore[no-any-return]
                    success=False, file_path=file_path, error="File is not text/UTF-8 encoded"
                ).to_json()
            except Exception as e:
                return FileReadResponse(  # type: ignore[no-any-return]
                    success=False, file_path=file_path, error=f"Failed to read file: {e!s}"
                ).to_json()

        # Full read with optional conversion
        extension = target_file.suffix.lower()
        needs_conversion = extension in CONVERTIBLE_EXTENSIONS
        content = None  # type: ignore[assignment]
        conversion_method = "none"

        if needs_conversion:
            # Try conversion with MarkItDown
            markitdown_converter = get_markitdown_converter()
            if markitdown_converter is None:
                return FileReadResponse(  # type: ignore[no-any-return]
                    success=False,
                    file_path=str(target_file),
                    error=f"MarkItDown is required for reading {extension} files. Install with: pip install markitdown",
                ).to_json()
            try:
                # Use singleton converter instance
                conversion_result = markitdown_converter.convert(str(target_file))
                content = conversion_result.text_content
                conversion_method = "markitdown"

                # Check if conversion actually produced content
                if not content or content.strip() == "":
                    raise ValueError(f"MarkItDown returned empty content for {extension} file")
            except ImportError as ie:
                return FileReadResponse(  # type: ignore[no-any-return]
                    success=False,
                    file_path=str(target_file),
                    format=extension,
                    error=f"Missing dependencies for {extension}: {ie!s}. Try: pip install 'markitdown[all]'",
                ).to_json()
            except Exception as conv_error:
                logger.error(f"Conversion error: {conv_error}", exc_info=True)
                # Fall back to direct read
                content = None  # type: ignore[assignment]

        # If no conversion or conversion failed, try direct read
        if not content:
            content, error = await read_file_content(target_file)
            if error:
                return FileReadResponse(success=False, file_path=str(target_file), error=error).to_json()  # type: ignore[no-any-return]

            conversion_method = "direct_read"

        # Token counting for logging and summarization check
        token_count = count_tokens(content)
        exact_tokens = token_count["exact_tokens"]
        file_size = target_file.stat().st_size

        # Check if content needs summarization
        if exact_tokens > DOCUMENT_SUMMARIZATION_THRESHOLD:
            logger.info(f"Document {target_file.name} has {exact_tokens:,} tokens, summarizing for efficiency...")
            # Summarize the content
            content = await summarize_content(content, target_file.name)

            # Add note about summarization to the beginning of content
            content = f"[Note: This document was automatically summarized from {exact_tokens:,} tokens to improve processing efficiency]\n\n{content}"

            # Recalculate token count after summarization
            new_token_count = count_tokens(content)
            new_exact_tokens = new_token_count["exact_tokens"]

            logger.info(
                f"Read {target_file.name}: {file_size} bytes → summarized from {exact_tokens:,} to {new_exact_tokens:,} tokens"
            )
        else:
            # Log metadata for non-summarized content
            logger.info(
                f"Read {target_file.name}: {file_size} bytes → {len(content)} chars, "
                f"{len(content.splitlines())} lines, {exact_tokens} tokens",
                tokens=exact_tokens,
                functions="read_file",
                func="read_file",
            )

        if needs_conversion:
            logger.info(
                f"Converted from {extension} to markdown via {conversion_method}",
                tokens=exact_tokens,
                functions="read_file",
                func=conversion_method,
            )

        # Build successful result with Pydantic model
        return FileReadResponse(  # type: ignore[no-any-return]
            success=True,
            content=content,
            file_path=str(get_relative_path(target_file)),
            size=file_size,
            format=extension if extension else "text",
        ).to_json()

    except Exception as e:
        return FileReadResponse(success=False, file_path=file_path, error=f"Failed to read file: {e!s}").to_json()  # type: ignore[no-any-return]
