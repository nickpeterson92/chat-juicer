"""
File operation utilities for Chat Juicer.
Provides safe, validated file and directory operations with async support.
"""

from __future__ import annotations

import inspect
import json

from pathlib import Path
from typing import Any, Callable

import aiofiles

from models.api_models import TextEditResponse


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


async def read_file_content(target_path: Path) -> tuple[str, str | None]:
    """
    Read text content from a file asynchronously.

    Args:
        target_path: Path object to read from

    Returns:
        Tuple of (content, error_message)
        If error_message is None, read was successful
    """
    try:
        async with aiofiles.open(target_path, encoding="utf-8") as f:
            content = await f.read()
        return content, None
    except UnicodeDecodeError:
        return "", "File is not text/UTF-8 encoded"
    except Exception as e:
        return "", f"Failed to read file: {e!s}"


async def write_file_content(target_path: Path, content: str) -> str | None:
    """
    Write text content to a file asynchronously.

    Args:
        target_path: Path object to write to
        content: Text content to write

    Returns:
        Error message if failed, None if successful
    """
    try:
        async with aiofiles.open(target_path, "w", encoding="utf-8") as f:
            await f.write(content)
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


def json_response(success: bool = True, error: str | None = None, **kwargs: Any) -> str:
    """
    Build a consistent JSON response.

    Response structure:
    - Success: {"success": true, "data": {...}}
    - Error: {"success": false, "error": "message"}

    Args:
        success: Whether the operation succeeded
        error: Error message if failed
        **kwargs: Additional fields to include in response data

    Returns:
        JSON string with consistent structure
    """
    if error:
        return json.dumps({"success": False, "error": error}, indent=2)

    # Always include success status and wrap other fields in data
    response: dict[str, Any] = {"success": success}
    if kwargs:
        response["data"] = kwargs
    return json.dumps(response, indent=2)


async def file_operation(
    file_path: str, operation_func: Callable[..., tuple[str, dict[str, Any]]], **kwargs: Any
) -> str:
    """
    Common pattern for file operations: validate, read, operate, write.

    Args:
        file_path: Path to file
        operation_func: Function that takes (content, **kwargs) and returns (new_content, result_data)
        **kwargs: Additional arguments for the operation

    Returns:
        JSON response string
    """
    # Initialize response variable to ensure single exit point with proper type
    response: str

    # Early validation and content reading
    target_path, path_error = validate_file_path(file_path)

    if path_error:
        response = TextEditResponse(success=False, file_path=str(file_path), error=path_error).to_json()
    else:
        content, read_error = await read_file_content(target_path)

        if read_error:
            response = TextEditResponse(success=False, file_path=str(file_path), error=read_error).to_json()
        else:
            # Perform operation in try block
            try:
                # Check if operation_func is async and await if needed
                if inspect.iscoroutinefunction(operation_func):
                    new_content, result_data = await operation_func(content, **kwargs)
                else:
                    new_content, result_data = operation_func(content, **kwargs)

                # Determine the response based on operation result
                if "error" in result_data:
                    response = TextEditResponse(
                        success=False, file_path=str(file_path), error=result_data["error"]
                    ).to_json()
                elif new_content is None:
                    # No write needed, operation was read-only or failed gracefully
                    response = json_response(success=True, **result_data)
                else:
                    # Write back and check for write errors
                    write_error = await write_file_content(target_path, new_content)
                    if write_error:
                        response = TextEditResponse(
                            success=False, file_path=str(target_path), error=write_error
                        ).to_json()
                    else:
                        # Build success response with operation details
                        response = TextEditResponse(
                            success=True,
                            file_path=str(target_path),
                            changes_made=result_data.get("replacements", result_data.get("changes_made", 1)),
                            message=f"{result_data.get('operation', 'edit')} operation completed",
                            original_text=result_data.get("text_found", result_data.get("anchor")),
                            new_text=result_data.get("text_inserted", result_data.get("replacement")),
                        ).to_json()
            except Exception as e:
                response = TextEditResponse(success=False, file_path=str(file_path), error=str(e)).to_json()

    # Single exit point
    return response
