"""
Function handlers for Chat Juicer.
Separate module for all tool/function implementations.
"""

from __future__ import annotations

import json
import shutil

from pathlib import Path

# Optional dependency: MarkItDown for document conversion
try:
    from markitdown import MarkItDown  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    MarkItDown = None  # type: ignore

from constants import (
    CONVERTIBLE_EXTENSIONS,
    DEFAULT_MAX_FILE_SIZE,
    MAX_BACKUP_VERSIONS,
)
from logger import logger
from utils import estimate_tokens, optimize_content_for_tokens


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
        target_path = Path(path).resolve()

        # Security check - ensure we're not going outside project bounds
        cwd = Path.cwd()
        if not (target_path == cwd or cwd in target_path.parents or target_path in cwd.parents):
            return json.dumps({"error": "Access denied: Path outside project scope"})

        items = []
        for item in target_path.iterdir():
            # Skip hidden files unless requested
            if item.name.startswith(".") and not show_hidden:
                continue

            item_info = {
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "path": str(item.relative_to(cwd) if cwd in item.parents or item == cwd else item),
            }

            # Add file size for files
            if item.is_file():
                item_info["size"] = str(item.stat().st_size)  # Convert to string for JSON
                item_info["extension"] = item.suffix

            items.append(item_info)

        # Sort directories first, then files
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))

        # Log metadata for humans
        # logger already imported from logger.py
        dirs = sum(1 for i in items if i["type"] == "directory")
        files = sum(1 for i in items if i["type"] == "file")
        total_size = sum(int(i.get("size", "0")) for i in items if i["type"] == "file")
        logger.info(f"Listed {target_path.name}: {dirs} dirs, {files} files, {total_size:,} bytes total")

        # Return minimal data to model - just items, no counts or stats
        result = {
            "items": items,
        }

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": f"Failed to list directory: {e!s}"})


def read_file(file_path: str, max_size: int = DEFAULT_MAX_FILE_SIZE) -> str:
    """
    Read a file's contents for documentation processing.
    Automatically converts non-markdown formats to markdown for token efficiency.

    Args:
        file_path: Path to the file to read
        max_size: Maximum file size in bytes (default 1MB)

    Returns:
        JSON string with file contents and metadata
    """
    # Initialize result dict that will be returned at the end
    result = {}

    try:
        target_file = Path(file_path).resolve()
        cwd = Path.cwd()

        # Validation checks - collect any errors
        if not (cwd in target_file.parents or target_file in cwd.parents):
            result = {"error": "Access denied: File outside project scope"}
        elif not target_file.exists():
            result = {"error": f"File not found: {file_path}"}
        elif not target_file.is_file():
            result = {"error": f"Not a file: {file_path}"}
        else:
            # File is valid, check size
            file_size = target_file.stat().st_size
            if file_size > max_size:
                result = {
                    "error": f"File too large: {file_size} bytes (max: {max_size} bytes)",
                    "file_size": str(file_size),
                }
            else:
                # Process the file
                extension = target_file.suffix.lower()
                needs_conversion = extension in CONVERTIBLE_EXTENSIONS
                content = None
                conversion_method = "none"
                optimization_stats = None

                if needs_conversion:
                    # Try conversion
                    if MarkItDown is None:
                        result = {
                            "error": f"MarkItDown is required for reading {extension} files. Install with: pip install markitdown",
                            "file_path": str(target_file),
                        }
                    else:
                        try:
                            # Initialize MarkItDown with plugin support for better format handling
                            converter = MarkItDown(enable_plugins=True)
                            conversion_result = converter.convert(str(target_file))
                            content = conversion_result.text_content
                            conversion_method = "markitdown"

                            # Check if conversion actually produced content
                            if not content or content.strip() == "":
                                raise ValueError(f"MarkItDown returned empty content for {extension} file")

                            # Apply optimization
                            content, optimization_stats = optimize_content_for_tokens(
                                content,
                                format_type="markdown",
                            )
                        except ImportError as ie:
                            result = {
                                "error": f"Missing dependencies for {extension}: {ie!s}. Try: pip install 'markitdown[all]'",
                                "file_path": str(target_file),
                                "extension": extension,
                            }
                            logger.error(f"Import error during conversion: {ie}")
                        except Exception as conv_error:
                            result = {
                                "error": f"Conversion failed for {extension}: {conv_error!s}",
                                "file_path": str(target_file),
                                "extension": extension,
                                "error_type": type(conv_error).__name__,
                            }
                            logger.error(f"Conversion error: {conv_error}", exc_info=True)

                # If no conversion or conversion failed, try direct read
                if not result and not content:
                    try:
                        content = target_file.read_text(encoding="utf-8")
                        conversion_method = "direct_read"

                        # Determine format type for optimization
                        format_type = {
                            ".md": "markdown",
                            ".markdown": "markdown",
                            ".json": "json",
                            ".csv": "csv",
                            ".docx": "text",
                        }.get(extension, "text")

                        # Apply optimization
                        content, optimization_stats = optimize_content_for_tokens(
                            content,
                            format_type=format_type,
                        )
                    except UnicodeDecodeError:
                        result = {
                            "error": "File is not text/UTF-8 encoded",
                            "file_path": str(target_file),
                        }

                # If we successfully got content, prepare final result
                if not result and content:
                    # Token counting for logging
                    token_count = estimate_tokens(content)
                    exact_tokens = token_count.get("exact_tokens") or token_count.get("estimated_tokens", "?")

                    # Log metadata
                    # logger already imported from logger.py
                    logger.info(
                        f"Read {target_file.name}: {file_size} bytes → {len(content)} chars, "
                        f"{len(content.splitlines())} lines, {exact_tokens} tokens (exact)"
                    )

                    if optimization_stats:
                        logger.info(
                            f"Optimization: saved {optimization_stats['percentage_saved']}% "
                            f"({optimization_stats['bytes_saved']} bytes)"
                        )

                    if needs_conversion:
                        logger.info(f"Converted from {extension} to markdown via {conversion_method}")

                    # Build successful result
                    result = {
                        "content": content,
                        "file_path": str(target_file.relative_to(cwd) if cwd in target_file.parents else target_file),
                    }

    except Exception as e:
        result = {"error": f"Failed to read file: {e!s}"}

    # Single return point
    return json.dumps(result, indent=2)


def generate_document(
    content: str,
    output_file: str,
    create_backup: bool = False,
) -> str:
    """
    Generate and save documentation to a file.
    Unified function that handles document generation output.

    Args:
        content: The generated document content to save
        output_file: Path where to save the document
        create_backup: Whether to backup existing file if it exists

    Returns:
        JSON string with operation result and metadata
    """
    try:
        output_path = Path(output_file).resolve()
        cwd = Path.cwd()

        # Security check - ensure we're not going outside project bounds
        if not (cwd in output_path.parents or output_path == cwd):
            return json.dumps({"error": "Access denied: Path outside project scope"})

        # Create parent directories if needed
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Backup existing file if requested and exists
        backup_created: str | bool = False
        if output_path.exists() and create_backup:
            backup_path = output_path.with_suffix(output_path.suffix + ".backup")
            counter = 1
            while backup_path.exists() and counter < MAX_BACKUP_VERSIONS:
                backup_path = output_path.with_suffix(f"{output_path.suffix}.backup{counter}")
                counter += 1

            shutil.copy2(output_path, backup_path)
            backup_created = str(backup_path.relative_to(cwd))
            logger.info(f"Created backup: {backup_created}")

        # Write the content
        output_path.write_text(content, encoding="utf-8")

        # Calculate stats for logging
        byte_count = len(content.encode("utf-8"))
        line_count = len(content.splitlines())
        char_count = len(content)

        # Log the operation with meaningful stats
        logger.info(
            f"Generated document: {output_path.name}, {char_count:,} chars, {line_count} lines, {byte_count} bytes"
        )

        # Build result with useful metadata
        result = {
            "success": True,
            "file_path": str(output_path.relative_to(cwd)),
            "bytes_written": byte_count,
            "lines_written": line_count,
            "chars_written": char_count,
        }

        if backup_created:
            result["backup_created"] = backup_created

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": f"Failed to generate document: {e!s}"})


# Function removed - functionality merged into generate_document


# Tool definitions for Azure OpenAI Responses API
# Note: The Responses API uses a simpler format than Chat Completions API
TOOLS = [
    {
        "type": "function",
        "name": "list_directory",
        "description": "List contents of a directory for project discovery. Returns files and subdirectories with metadata.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list (default: current directory)",
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Whether to include hidden files/folders (default: false)",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "read_file",
        "description": "Read a file's contents for documentation processing. Returns file content and metadata.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file to read",
                },
                "max_size": {
                    "type": "integer",
                    "description": "Maximum file size in bytes (default: 1MB)",
                },
            },
            "required": ["file_path"],
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "generate_document",
        "description": "Generate and save documentation to a file. Takes the complete document content and saves it to the specified location.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The complete document content to save",
                },
                "output_file": {
                    "type": "string",
                    "description": "Path where to save the generated document",
                },
                "create_backup": {
                    "type": "boolean",
                    "description": "Whether to backup existing file if it exists (default: false)",
                },
            },
            "required": ["content", "output_file"],
            "additionalProperties": False,
        },
    },
]


# Function registry for execution
FUNCTION_REGISTRY = {
    "list_directory": list_directory,
    "read_file": read_file,
    "generate_document": generate_document,
}

# Agent/Runner tools - wrap functions with function_tool decorator
try:
    from agents import function_tool

    # Wrap existing functions as Agent tools
    list_directory_tool = function_tool(list_directory)
    read_file_tool = function_tool(read_file)
    generate_document_tool = function_tool(generate_document)

    # List of tools for Agent
    AGENT_TOOLS = [
        list_directory_tool,
        read_file_tool,
        generate_document_tool,
    ]
except ImportError:
    # If agents module not available, provide empty tools list
    AGENT_TOOLS = []
