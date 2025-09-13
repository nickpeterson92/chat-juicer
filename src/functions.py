"""
Function handlers for Chat Juicer.
Separate module for all tool/function implementations.
"""

from __future__ import annotations

import json
import re
import shutil

from pathlib import Path
from typing import Any

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


def validate_file_path(
    file_path: str, check_exists: bool = True, max_size: int | None = None
) -> tuple[Path, str | None]:
    """
    Validate a file path for safety and accessibility.

    Args:
        file_path: Path to validate
        check_exists: Whether to check if file exists (default: True)
        max_size: Maximum allowed file size in bytes (optional)

    Returns:
        Tuple of (resolved_path, error_message)
        If error_message is None, validation passed
    """
    try:
        cwd = Path.cwd()
        target_path = Path(file_path).resolve()

        # Security check: ensure path is within project scope
        if not (cwd in target_path.parents or target_path == cwd):
            return target_path, "Access denied: Path outside project scope"

        if check_exists:
            # Check if file exists
            if not target_path.exists():
                return target_path, f"File not found: {file_path}"

            # Check if it's a file (not directory)
            if not target_path.is_file():
                return target_path, f"Not a file: {file_path}"

            # Optional size check
            if max_size is not None:
                file_size = target_path.stat().st_size
                if file_size > max_size:
                    return target_path, f"File too large: {file_size} bytes (max: {max_size})"

        return target_path, None

    except Exception as e:
        return Path(), f"Path validation failed: {e!s}"


def read_file_content(target_path: Path) -> tuple[str, str | None]:
    """
    Read text content from a file.

    Args:
        target_path: Path object to read from

    Returns:
        Tuple of (content, error_message)
        If error_message is None, read was successful
    """
    try:
        content = target_path.read_text(encoding="utf-8")
        return content, None
    except UnicodeDecodeError:
        return "", "File is not text/UTF-8 encoded"
    except Exception as e:
        return "", f"Failed to read file: {e!s}"


def write_file_content(target_path: Path, content: str) -> str | None:
    """
    Write text content to a file.

    Args:
        target_path: Path object to write to
        content: Text content to write

    Returns:
        Error message if failed, None if successful
    """
    try:
        target_path.write_text(content, encoding="utf-8")
        return None
    except Exception as e:
        return f"Failed to write file: {e!s}"


def validate_directory_path(dir_path: str, check_exists: bool = True) -> tuple[Path, str | None]:
    """
    Validate a directory path for safety and accessibility.

    Args:
        dir_path: Path to validate
        check_exists: Whether to check if directory exists (default: True)

    Returns:
        Tuple of (resolved_path, error_message)
        If error_message is None, validation passed
    """
    try:
        cwd = Path.cwd()
        target_path = Path(dir_path).resolve()

        # Security check: ensure path is within project scope
        if not (target_path == cwd or cwd in target_path.parents or target_path in cwd.parents):
            return target_path, "Access denied: Path outside project scope"

        if check_exists:
            # Check if directory exists
            if not target_path.exists():
                return target_path, f"Directory not found: {dir_path}"

            # Check if it's a directory (not file)
            if not target_path.is_dir():
                return target_path, f"Not a directory: {dir_path}"

        return target_path, None

    except Exception as e:
        return Path(), f"Path validation failed: {e!s}"


def json_response(success: bool = True, error: str | None = None, **kwargs) -> str:
    """
    Build a consistent JSON response.

    Args:
        success: Whether the operation succeeded
        error: Error message if failed
        **kwargs: Additional fields to include in response

    Returns:
        JSON string with consistent structure
    """
    if error:
        return json.dumps({"error": error}, indent=2)

    response = {"success": success} if success else {}
    response.update(kwargs)
    return json.dumps(response, indent=2)


def file_operation(file_path: str, operation_func, **kwargs):
    """
    Common pattern for file operations: validate, read, operate, write.

    Args:
        file_path: Path to file
        operation_func: Function that takes (content, **kwargs) and returns (new_content, result_data)
        **kwargs: Additional arguments for the operation

    Returns:
        JSON response string
    """
    # Validate path
    target_path, error = validate_file_path(file_path)
    if error:
        return json_response(error=error)

    # Read content
    content, error = read_file_content(target_path)
    if error:
        return json_response(error=error)

    # Perform operation
    try:
        new_content, result_data = operation_func(content, **kwargs)

        # If operation returned an error/warning without new content
        if new_content is None:
            return json_response(success=True, **result_data)

        # Write back
        error = write_file_content(target_path, new_content)
        if error:
            return json_response(error=error)

        # Add file path to result
        result_data["file"] = str(target_path)
        return json_response(success=True, **result_data)

    except Exception as e:
        return json_response(error=str(e))


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
            return json_response(error=error)

        items = []
        for item in target_path.iterdir():
            # Skip hidden files unless requested
            if item.name.startswith(".") and not show_hidden:
                continue

            item_info = {
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "path": str(item.relative_to(Path.cwd()) if Path.cwd() in item.parents or item == Path.cwd() else item),
            }

            # Add file size for files
            if item.is_file():
                item_info["size"] = str(item.stat().st_size)  # Convert to string for JSON
                item_info["extension"] = item.suffix

            items.append(item_info)

        # Sort directories first, then files
        items.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))

        # Log metadata for humans
        dirs = sum(1 for i in items if i["type"] == "directory")
        files = sum(1 for i in items if i["type"] == "file")
        total_size = sum(int(i.get("size", "0")) for i in items if i["type"] == "file")
        logger.info(f"Listed {target_path.name}: {dirs} dirs, {files} files, {total_size:,} bytes total")

        # Return minimal data to model - just items, no counts or stats
        return json_response(items=items)

    except Exception as e:
        return json_response(error=f"Failed to list directory: {e!s}")


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
    # Validate path with size check
    target_file, error = validate_file_path(file_path, check_exists=True, max_size=max_size)
    if error:
        return json_response(error=error)

    try:
        extension = target_file.suffix.lower()
        needs_conversion = extension in CONVERTIBLE_EXTENSIONS
        content = None
        conversion_method = "none"
        optimization_stats = None

        if needs_conversion:
            # Try conversion with MarkItDown
            if MarkItDown is None:
                return json_response(
                    error=f"MarkItDown is required for reading {extension} files. Install with: pip install markitdown",
                    file_path=str(target_file),
                )

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
                return json_response(
                    error=f"Missing dependencies for {extension}: {ie!s}. Try: pip install 'markitdown[all]'",
                    file_path=str(target_file),
                    extension=extension,
                )
            except Exception as conv_error:
                logger.error(f"Conversion error: {conv_error}", exc_info=True)
                # Fall back to direct read
                content = None

        # If no conversion or conversion failed, try direct read
        if not content:
            content, error = read_file_content(target_file)
            if error:
                return json_response(error=error, file_path=str(target_file))

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

        # Token counting for logging
        token_count = estimate_tokens(content)
        exact_tokens = token_count.get("exact_tokens") or token_count.get("estimated_tokens", "?")

        # Get relative path
        cwd = Path.cwd()
        file_size = target_file.stat().st_size

        # Log metadata
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
        return json_response(
            content=content, file_path=str(target_file.relative_to(cwd) if cwd in target_file.parents else target_file)
        )

    except Exception as e:
        return json_response(error=f"Failed to read file: {e!s}")


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
        # Validate path (don't check exists since we're creating)
        output_path, error = validate_file_path(output_file, check_exists=False)
        if error:
            return json_response(error=error)

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
            cwd = Path.cwd()
            backup_created = str(backup_path.relative_to(cwd))
            logger.info(f"Created backup: {backup_created}")

        # Write the content using helper
        error = write_file_content(output_path, content)
        if error:
            return json_response(error=error)

        # Calculate stats for logging
        byte_count = len(content.encode("utf-8"))
        line_count = len(content.splitlines())
        char_count = len(content)

        # Log the operation with meaningful stats
        logger.info(
            f"Generated document: {output_path.name}, {char_count:,} chars, {line_count} lines, {byte_count} bytes"
        )

        # Build result with useful metadata
        cwd = Path.cwd()
        result_data: dict[str, Any] = {
            "file_path": str(output_path.relative_to(cwd) if cwd in output_path.parents else output_path),
            "bytes_written": byte_count,
            "lines_written": line_count,
            "chars_written": char_count,
        }

        if backup_created:
            result_data["backup_created"] = backup_created

        return json_response(success=True, **result_data)

    except Exception as e:
        return json_response(error=f"Failed to generate document: {e!s}")


def text_edit(
    file_path: str,
    find: str,
    replace_with: str,
    replace_all: bool = False,
) -> str:
    """
    Simple text find and replace in documents.
    Set replace_with to empty string to delete text.

    Args:
        file_path: Path to file to edit
        find: Exact text to find
        replace_with: Text to replace with (empty string to delete)
        replace_all: Replace all occurrences (default: first only)

    Returns:
        JSON with success status and replacements made
    """

    def do_edit(content, **kwargs):
        """Inner function to perform text replacement."""
        find_text = kwargs.get("find")
        replace_text = kwargs.get("replace_with")
        replace_all = kwargs.get("replace_all", False)

        occurrences = content.count(find_text)
        if occurrences == 0:
            return None, {"success": False, "warning": "Text not found", "find": find_text}

        if replace_all:
            new_content = content.replace(find_text, replace_text)
            replacements = occurrences
        else:
            new_content = content.replace(find_text, replace_text, 1)
            replacements = 1

        operation = "delete" if replace_text == "" else "replace"
        return new_content, {
            "operation": operation,
            "replacements": replacements,
            "text_found": find_text[:50] + "..." if len(find_text) > 50 else find_text,
        }

    return file_operation(file_path, do_edit, find=find, replace_with=replace_with, replace_all=replace_all)


def regex_edit(
    file_path: str,
    pattern: str,
    replacement: str,
    replace_all: bool = False,
    flags: str = "ms",
) -> str:
    """
    Pattern-based editing using regular expressions.
    Supports capture groups and backreferences.

    Args:
        file_path: Path to file to edit
        pattern: Regular expression pattern to match
        replacement: Replacement text (can use \1, \2 for capture groups)
        replace_all: Replace all matches (default: first only)
        flags: Regex flags - m=multiline, s=dotall, i=ignorecase (default: 'ms')

    Returns:
        JSON with success status and replacements made
    """

    def do_regex_edit(content, **kwargs):
        """Inner function to perform regex replacement."""
        pattern_str = kwargs.get("pattern")
        replacement = kwargs.get("replacement")
        replace_all = kwargs.get("replace_all", False)
        flags_str = kwargs.get("flags", "ms")

        # Build regex flags
        regex_flags = 0
        if "m" in flags_str:
            regex_flags |= re.MULTILINE
        if "s" in flags_str:
            regex_flags |= re.DOTALL
        if "i" in flags_str:
            regex_flags |= re.IGNORECASE

        try:
            regex_pattern = re.compile(pattern_str, regex_flags)
        except re.error as e:
            return None, {"error": f"Invalid regex pattern: {e}"}

        matches = list(regex_pattern.finditer(content))
        if not matches:
            return None, {"success": False, "warning": "No matches found", "pattern": pattern_str}

        if replace_all:
            new_content = regex_pattern.sub(replacement, content)
            replacements = len(matches)
        else:
            new_content = regex_pattern.sub(replacement, content, count=1)
            replacements = 1

        operation = "delete" if replacement == "" else "replace"
        return new_content, {"operation": operation, "pattern": pattern_str, "replacements": replacements}

    return file_operation(
        file_path, do_regex_edit, pattern=pattern, replacement=replacement, replace_all=replace_all, flags=flags
    )


def insert_text(
    file_path: str,
    anchor: str,
    text: str,
    position: str = "after",
) -> str:
    """
    Insert text before or after an anchor point in a document.

    Args:
        file_path: Path to file to edit
        anchor: Text to find as the insertion point
        text: Text to insert
        position: Where to insert - 'before' or 'after' the anchor

    Returns:
        JSON with success status
    """

    def do_insert(content, **kwargs):
        """Inner function to perform text insertion."""
        anchor_text = kwargs.get("anchor")
        insert_text = kwargs.get("text")
        position = kwargs.get("position", "after")

        idx = content.find(anchor_text)
        if idx == -1:
            return None, {"error": f"Anchor text not found: {anchor_text}"}

        if position == "after":
            insert_pos = idx + len(anchor_text)
        elif position == "before":
            insert_pos = idx
        else:
            return None, {"error": f"Invalid position: {position}. Use 'before' or 'after'"}

        new_content = content[:insert_pos] + insert_text + content[insert_pos:]

        return new_content, {
            "operation": "insert",
            "position": position,
            "anchor": anchor_text[:50] + "..." if len(anchor_text) > 50 else anchor_text,
            "text_length": len(insert_text),
        }

    return file_operation(file_path, do_insert, anchor=anchor, text=text, position=position)


# Tool definitions for the Agent
TOOLS = [
    {
        "type": "function",
        "name": "list_directory",
        "description": "List files and folders in a directory. Use this to explore project structure and discover documents. Returns metadata including file sizes and types.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list. Leave empty for current directory. Example: 'sources/' or 'templates/'",
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Include hidden files starting with dot (.) - default is false",
                },
            },
        },
    },
    {
        "type": "function",
        "name": "read_file",
        "description": "Read any file to view its contents. Automatically converts PDFs, Word docs, Excel sheets, and other formats to text. Use this before editing or analyzing documents.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file. Examples: 'document.txt', 'sources/report.pdf', 'data.xlsx'",
                },
                "max_size": {
                    "type": "integer",
                    "description": "Maximum file size in bytes to read. Default is 1MB (1048576). Increase for larger files.",
                },
            },
            "required": ["file_path"],
        },
    },
    {
        "type": "function",
        "name": "generate_document",
        "description": "Save generated content to a file. Use this after creating or modifying document content. Creates the file if it doesn't exist, overwrites if it does.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The complete document content to save. Can be markdown, plain text, or any text format.",
                },
                "output_file": {
                    "type": "string",
                    "description": "Where to save the file. Examples: 'output/report.md', 'summary.txt', 'docs/guide.md'",
                },
                "create_backup": {
                    "type": "boolean",
                    "description": "Create a backup (.bak) of existing file before overwriting - default is false",
                },
            },
            "required": ["content", "output_file"],
        },
    },
    {
        "type": "function",
        "name": "text_edit",
        "description": "Find and replace exact text in a document. Use for simple text changes like updating names, dates, or fixing typos. To delete text, set replace_with to empty string ''.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Example: 'document.md', 'output/report.txt'",
                },
                "find": {
                    "type": "string",
                    "description": "Exact text to search for. Must match exactly including spaces and punctuation.",
                },
                "replace_with": {
                    "type": "string",
                    "description": "New text to replace with. Use empty string '' to delete the found text.",
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "true = replace ALL occurrences, false = replace only FIRST occurrence (default: false)",
                },
            },
            "required": ["file_path", "find", "replace_with"],
        },
    },
    {
        "type": "function",
        "name": "regex_edit",
        "description": "Advanced find/replace using regex patterns. Use for complex patterns like 'all dates', 'version numbers', or text with wildcards. Supports capture groups with \1, \2 in replacement.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Example: 'document.md', 'output/report.txt'",
                },
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern. Examples: '\\d{4}-\\d{2}-\\d{2}' for dates, 'v\\d+\\.\\d+' for versions, 'Chapter \\d+:' for chapters",
                },
                "replacement": {
                    "type": "string",
                    "description": "Replacement text. Use \\1, \\2 for capture groups. Example: 'Version \\1.\\2' or empty string '' to delete matches",
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "true = replace ALL matches, false = replace only FIRST match (default: false)",
                },
                "flags": {
                    "type": "string",
                    "description": "Regex flags as string: 'm' for multiline, 's' for dotall, 'i' for case-insensitive. Default 'ms'. Example: 'msi' for all three",
                },
            },
            "required": ["file_path", "pattern", "replacement"],
        },
    },
    {
        "type": "function",
        "name": "insert_text",
        "description": "Add new text at a specific location without replacing existing content. Use to insert new sections, paragraphs, or content before/after existing text.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Example: 'document.md', 'output/report.txt'",
                },
                "anchor": {
                    "type": "string",
                    "description": "Existing text to use as reference point. The new text will be inserted relative to this. Example: '## Introduction' or 'Chapter 1:'",
                },
                "text": {
                    "type": "string",
                    "description": "New text to insert. Can include newlines for multi-line content. Example: '\n## New Section\nContent here\n'",
                },
                "position": {
                    "type": "string",
                    "description": "Where to insert relative to anchor: 'before' inserts BEFORE the anchor, 'after' inserts AFTER the anchor (default: 'after')",
                    "enum": ["before", "after"],
                },
            },
            "required": ["file_path", "anchor", "text"],
        },
    },
]


# Function registry for execution
FUNCTION_REGISTRY = {
    "list_directory": list_directory,
    "read_file": read_file,
    "generate_document": generate_document,
    "text_edit": text_edit,
    "regex_edit": regex_edit,
    "insert_text": insert_text,
}

# Agent/Runner tools - wrap functions with function_tool decorator
try:
    from agents import function_tool

    # Wrap existing functions as Agent tools
    list_directory_tool = function_tool(list_directory)
    read_file_tool = function_tool(read_file)
    generate_document_tool = function_tool(generate_document)
    text_edit_tool = function_tool(text_edit)
    regex_edit_tool = function_tool(regex_edit)
    insert_text_tool = function_tool(insert_text)

    # List of tools for Agent
    AGENT_TOOLS = [
        list_directory_tool,
        read_file_tool,
        generate_document_tool,
        regex_edit_tool,
        text_edit_tool,
        insert_text_tool,
    ]
except ImportError:
    # If agents module not available, provide empty tools list
    AGENT_TOOLS = []
