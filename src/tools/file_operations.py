"""
File operation tools for Chat Juicer.
Provides directory listing and file reading capabilities.
"""

from __future__ import annotations

from pathlib import Path

from core.constants import CONVERTIBLE_EXTENSIONS, DOCUMENT_SUMMARIZATION_THRESHOLD
from infrastructure.document_processor import get_markitdown_converter, summarize_content
from infrastructure.file_utils import read_file_content, validate_directory_path, validate_file_path
from infrastructure.logger import logger
from infrastructure.utils import count_tokens
from models.api_models import DirectoryListResponse, FileInfo, FileReadResponse


def list_directory(path: str = ".", show_hidden: bool = False) -> str:
    """
    List contents of a directory for project discovery.

    Args:
        path: Directory path to list (relative or absolute)
        show_hidden: Whether to include hidden files/folders

    Returns:
        JSON string with directory contents and metadata
    """
    try:
        # Validate directory path
        target_path, error = validate_directory_path(path, check_exists=True)
        if error:
            return DirectoryListResponse(success=False, path=path, items=[], error=error).to_json()  # type: ignore[no-any-return]

        items = []
        for item in target_path.iterdir():
            # Skip hidden files unless requested
            if item.name.startswith(".") and not show_hidden:
                continue

            # Create FileInfo model for each item
            file_info = FileInfo(
                name=item.name,
                type="folder" if item.is_dir() else "file",
                size=item.stat().st_size if item.is_file() else 0,
                modified=str(item.stat().st_mtime),
                file_count=len(list(item.iterdir())) if item.is_dir() else None,
                extension=item.suffix if item.is_file() else None,
            )
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


async def read_file(file_path: str, max_size: int | None = None) -> str:
    """
    Read a file's contents for documentation processing.
    Automatically converts non-markdown formats to markdown for token efficiency.

    Args:
        file_path: Path to the file to read
        max_size: Maximum file size in bytes (None = no limit)

    Returns:
        JSON string with file contents and metadata
    """
    # Validate path with optional size check
    target_file, error = validate_file_path(file_path, check_exists=True, max_size=max_size)
    if error:
        return FileReadResponse(success=False, file_path=file_path, error=error).to_json()  # type: ignore[no-any-return]

    try:
        extension = target_file.suffix.lower()
        needs_conversion = extension in CONVERTIBLE_EXTENSIONS
        content = None
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
                content = None

        # If no conversion or conversion failed, try direct read
        if not content:
            content, error = await read_file_content(target_file)
            if error:
                return FileReadResponse(success=False, file_path=str(target_file), error=error).to_json()  # type: ignore[no-any-return]

            conversion_method = "direct_read"

        # Token counting for logging and summarization check
        token_count = count_tokens(content)
        exact_tokens = token_count["exact_tokens"]

        # Get relative path
        cwd = Path.cwd()
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
            file_path=str(target_file.relative_to(cwd) if cwd in target_file.parents else target_file),
            size=file_size,
            format=extension if extension else "text",
        ).to_json()

    except Exception as e:
        return FileReadResponse(success=False, file_path=file_path, error=f"Failed to read file: {e!s}").to_json()  # type: ignore[no-any-return]
