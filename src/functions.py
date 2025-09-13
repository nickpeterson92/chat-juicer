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


def regex_edit(
    file_path: str,
    pattern: str,
    replacement: str = "",
    replace_all: bool = False,
) -> str:
    """
    Edit file content using regular expressions.

    Args:
        file_path: Path to file to edit
        pattern: Regex pattern to match
        replacement: Replacement text (can use backreferences like \\1, \\2)
        replace_all: Replace all matches (default: first match only)

    Returns:
        JSON with success status and number of replacements made
    """

    def do_regex_edit(content, pattern, replacement, replace_all):
        """Inner function to perform regex replacement."""
        try:
            regex_pattern = re.compile(pattern, re.MULTILINE | re.DOTALL)
        except re.error as e:
            return None, {"error": f"Invalid regex pattern: {e}"}

        matches = list(regex_pattern.finditer(content))
        if not matches:
            return None, {"success": False, "warning": "No matches found", "pattern": pattern, "matches": 0}

        if replace_all:
            new_content = regex_pattern.sub(replacement, content)
            replacements_made = len(matches)
        else:
            new_content = regex_pattern.sub(replacement, content, count=1)
            replacements_made = 1

        return new_content, {"replacements": replacements_made, "pattern": pattern}

    return file_operation(file_path, do_regex_edit, pattern=pattern, replacement=replacement, replace_all=replace_all)


def replace_text(
    file_path: str,
    find: str,
    replace_with: str = "",
    replace_all: bool = False,
) -> str:
    """
    Replace literal text in a file (no regex).

    Args:
        file_path: Path to file to edit
        find: Exact text to find
        replace_with: Replacement text
        replace_all: Replace all occurrences (default: first only)

    Returns:
        JSON with success status and number of replacements made
    """

    def do_replace(content, find, replace_with, replace_all):
        """Inner function to perform the replacement."""
        occurrences = content.count(find)
        if occurrences == 0:
            return None, {"success": False, "warning": "Text not found", "find": find, "matches": 0}

        if replace_all:
            new_content = content.replace(find, replace_with)
            replacements_made = occurrences
        else:
            new_content = content.replace(find, replace_with, 1)
            replacements_made = 1

        return new_content, {
            "replacements": replacements_made,
            "text_replaced": find[:50] + "..." if len(find) > 50 else find,
        }

    return file_operation(file_path, do_replace, find=find, replace_with=replace_with, replace_all=replace_all)


def insert_text(
    file_path: str,
    anchor: str,
    text: str,
    position: str = "after",
    use_regex: bool = False,
) -> str:
    """
    Insert text before or after a specific anchor point.

    Args:
        file_path: Path to file to edit
        anchor: Text or pattern to find as insertion point
        text: Text to insert
        position: "before" or "after" the anchor
        use_regex: Treat anchor as regex pattern

    Returns:
        JSON with success status
    """

    def do_insert(content, anchor, text, position, use_regex):
        """Inner function to perform text insertion."""
        # Find insertion point
        if use_regex:
            try:
                pattern = re.compile(anchor, re.MULTILINE | re.DOTALL)
                match = pattern.search(content)
                if not match:
                    return None, f"Pattern not found: {anchor}"
                insert_pos = match.end() if position == "after" else match.start()
            except re.error as e:
                return None, f"Invalid regex pattern: {e}"
        else:
            idx = content.find(anchor)
            if idx == -1:
                return None, f"Anchor text not found: {anchor}"
            insert_pos = (idx + len(anchor)) if position == "after" else idx

        # Insert text
        new_content = content[:insert_pos] + text + content[insert_pos:]

        return new_content, {"position": position, "anchor": anchor[:50] + "..." if len(anchor) > 50 else anchor}

    return file_operation(file_path, do_insert, anchor=anchor, text=text, position=position, use_regex=use_regex)


def append_prepend(
    file_path: str,
    text: str,
    position: str = "append",
) -> str:
    """
    Append or prepend text to a file.

    Args:
        file_path: Path to file to edit
        text: Text to add
        position: "append" (end of file) or "prepend" (beginning of file)

    Returns:
        JSON with success status
    """

    def do_append_prepend(content, text, position):
        """Inner function to perform append/prepend."""
        if position == "append":
            new_content = content + text
        elif position == "prepend":
            new_content = text + content
        else:
            return None, {"error": f"Invalid position: {position}. Use 'append' or 'prepend'"}

        return new_content, {"position": position, "text_length": len(text)}

    return file_operation(file_path, do_append_prepend, text=text, position=position)


def line_edit(
    file_path: str,
    line_number: int | None = None,
    line_range: list[int] | None = None,
    text: str = "",
    operation: str = "replace",
) -> str:
    """
    Edit specific lines in a file.

    Args:
        file_path: Path to file to edit
        line_number: Single line number (1-based)
        line_range: List of [start, end] line numbers (1-based, inclusive)
        text: Text for replacement or insertion
        operation: "replace", "insert", or "delete"

    Returns:
        JSON with success status
    """

    def do_line_edit(content, line_number, line_range, text, operation):
        """Inner function to perform line-based editing."""
        # Split into lines
        lines = content.splitlines(keepends=True)

        # Determine target lines
        if line_number:
            if line_number < 1 or line_number > len(lines):
                return None, f"Line {line_number} out of range (1-{len(lines)})"
            start_idx = line_number - 1
            end_idx = line_number
        elif line_range:
            start, end = line_range[0], line_range[1]
            if start < 1 or end > len(lines) or start > end:
                return None, f"Invalid line range {start}-{end} (file has {len(lines)} lines)"
            start_idx = start - 1
            end_idx = end
        else:
            return None, "Either line_number or line_range must be specified"

        # Perform operation
        if operation == "replace":
            # Ensure text ends with newline if replacing full lines
            if not text.endswith("\n") and end_idx < len(lines):
                text += "\n"
            new_lines = [*lines[:start_idx], text, *lines[end_idx:]]
        elif operation == "insert":
            # Insert before the specified line
            if not text.endswith("\n"):
                text += "\n"
            new_lines = [*lines[:start_idx], text, *lines[start_idx:]]
        elif operation == "delete":
            new_lines = lines[:start_idx] + lines[end_idx:]
        else:
            return None, f"Invalid operation: {operation}"

        # Reconstruct content
        new_content = "".join(new_lines)

        return new_content, {
            "operation": operation,
            "lines_affected": end_idx - start_idx if operation != "insert" else 1,
        }

    return file_operation(
        file_path, do_line_edit, line_number=line_number, line_range=line_range, text=text, operation=operation
    )


# Tool definitions for the Agent
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
        },
    },
    {
        "type": "function",
        "name": "regex_edit",
        "description": "Edit file using regular expressions with support for capture groups and backreferences",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit",
                },
                "pattern": {
                    "type": "string",
                    "description": "Regular expression pattern to match",
                },
                "replacement": {
                    "type": "string",
                    "description": "Replacement text (can use \1, \2 for capture groups)",
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "Replace all matches vs first match only (default: false)",
                },
            },
            "required": ["file_path", "pattern", "replacement"],
        },
    },
    {
        "type": "function",
        "name": "replace_text",
        "description": "Simple literal text replacement in a file (no regex)",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit",
                },
                "find": {
                    "type": "string",
                    "description": "Exact text to find and replace",
                },
                "replace_with": {
                    "type": "string",
                    "description": "Text to replace with",
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "Replace all occurrences vs first only (default: false)",
                },
            },
            "required": ["file_path", "find", "replace_with"],
        },
    },
    {
        "type": "function",
        "name": "insert_text",
        "description": "Insert text before or after a specific anchor point in a file",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit",
                },
                "anchor": {
                    "type": "string",
                    "description": "Text or pattern to find as insertion point",
                },
                "text": {
                    "type": "string",
                    "description": "Text to insert",
                },
                "position": {
                    "type": "string",
                    "description": "Insert 'before' or 'after' the anchor",
                    "enum": ["before", "after"],
                },
                "use_regex": {
                    "type": "boolean",
                    "description": "Treat anchor as regex pattern (default: false)",
                },
            },
            "required": ["file_path", "anchor", "text"],
        },
    },
    {
        "type": "function",
        "name": "append_prepend",
        "description": "Append text to end or prepend to beginning of a file",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit",
                },
                "text": {
                    "type": "string",
                    "description": "Text to add to file",
                },
                "position": {
                    "type": "string",
                    "description": "Where to add text: 'append' (end) or 'prepend' (beginning)",
                    "enum": ["append", "prepend"],
                },
            },
            "required": ["file_path", "text"],
        },
    },
    {
        "type": "function",
        "name": "line_edit",
        "description": "Edit specific lines in a file by line number",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit",
                },
                "line_number": {
                    "type": "integer",
                    "description": "Single line number to edit (1-based)",
                },
                "line_range": {
                    "type": "array",
                    "description": "Range of lines [start, end] (1-based, inclusive)",
                    "items": {"type": "integer"},
                    "minItems": 2,
                    "maxItems": 2,
                },
                "text": {
                    "type": "string",
                    "description": "Text for replacement or insertion",
                },
                "operation": {
                    "type": "string",
                    "description": "Operation to perform: 'replace', 'insert', or 'delete'",
                    "enum": ["replace", "insert", "delete"],
                },
            },
            "required": ["file_path", "operation"],
        },
    },
]


# Function registry for execution
FUNCTION_REGISTRY = {
    "list_directory": list_directory,
    "read_file": read_file,
    "generate_document": generate_document,
    "regex_edit": regex_edit,
    "replace_text": replace_text,
    "insert_text": insert_text,
    "append_prepend": append_prepend,
    "line_edit": line_edit,
}

# Agent/Runner tools - wrap functions with function_tool decorator
try:
    from agents import function_tool

    # Wrap existing functions as Agent tools
    list_directory_tool = function_tool(list_directory)
    read_file_tool = function_tool(read_file)
    generate_document_tool = function_tool(generate_document)
    regex_edit_tool = function_tool(regex_edit)
    replace_text_tool = function_tool(replace_text)
    insert_text_tool = function_tool(insert_text)
    append_prepend_tool = function_tool(append_prepend)
    line_edit_tool = function_tool(line_edit)

    # List of tools for Agent
    AGENT_TOOLS = [
        list_directory_tool,
        read_file_tool,
        generate_document_tool,
        regex_edit_tool,
        replace_text_tool,
        insert_text_tool,
        append_prepend_tool,
        line_edit_tool,
    ]
except ImportError:
    # If agents module not available, provide empty tools list
    AGENT_TOOLS = []
