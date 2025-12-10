"""
File operation utilities for Chat Juicer.
Provides safe, validated file and directory operations with async support.
"""

from __future__ import annotations

import asyncio
import inspect

from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import aiofiles

from core.constants import (
    ERROR_NULL_BYTE_IN_PATH,
    ERROR_PATH_OUTSIDE_PROJECT,
    ERROR_PATH_OUTSIDE_WORKSPACE,
    ERROR_PATH_TRAVERSAL,
    ERROR_SYMLINK_ESCAPE,
)
from models.api_models import TextEditResponse
from models.ipc_models import UploadResult
from utils.json_utils import json_pretty
from utils.logger import logger


def get_relative_path(path: Path) -> Path:
    """Get path relative to current working directory.

    Helper function to standardize relative path calculation across tools.
    If path is within cwd, returns relative path. Otherwise returns original path.

    Args:
        path: Absolute path to convert to relative

    Returns:
        Path object, relative to cwd if possible, otherwise absolute
    """
    cwd = Path.cwd()
    return path.relative_to(cwd) if cwd in path.parents else path


async def get_session_files(session_id: str, subdir: str = "sources") -> list[str]:
    """List filenames in a session subdirectory, excluding hidden files.

    Args:
        session_id: Session identifier
        subdir: Subdirectory to scan (default: "sources")

    Returns:
        Sorted list of filenames (no paths). Returns empty list if the directory
        does not exist or on error.
    """

    def _list_files(path: Path) -> list[str]:
        return sorted(file.name for file in path.iterdir() if file.is_file() and not file.name.startswith("."))

    try:
        base_path = Path.cwd() / "data" / "files" / session_id / subdir
        if not base_path.exists() or not base_path.is_dir():
            return []

        return await asyncio.to_thread(_list_files, base_path)
    except Exception as exc:
        logger.warning(f"Failed to list session files for {session_id}: {exc}")
        return []


async def get_session_templates(session_id: str) -> list[str]:
    """List template filenames for a session (read-only).

    Uses the session's templates symlink/copy created at session bootstrap. Filters
    hidden files and returns a sorted list of filenames.

    Args:
        session_id: Session identifier

    Returns:
        Sorted list of template filenames. Empty if missing or on error.
    """
    return await get_session_files(session_id, subdir="templates")


def validate_session_path(file_path: str, session_id: str | None = None) -> tuple[Path, str | None]:  # noqa: PLR0911
    """
    Validate a path within session workspace boundaries.

    Security: Enforces sandbox - agent can access anything within session directory
    but cannot escape to parent directories or absolute paths.

    Session workspace structure:
    - sources/: Uploaded files
    - templates/: Global templates (symlink)
    - output/: Generated documents (symlink to global output/{session_id}/)
    - Agent can create any additional directories/files as needed

    Validation Strategy:
    1. Block path traversal in the REQUEST (.. or absolute paths)
    2. Check if REQUESTED path is within session workspace (before following symlinks)
    3. Allow legitimate symlinks (templates/, output/) that we created
    4. Resolve path for actual file operations

    Args:
        file_path: Path to validate (relative to session directory or absolute)
        session_id: Session ID for workspace isolation (None = no restriction)

    Returns:
        Tuple of (resolved_path, error_message)
        If error_message is None, validation passed
    """
    try:
        # Prevent null byte injection attacks
        if "\0" in file_path:
            return Path(), ERROR_NULL_BYTE_IN_PATH

        # Prevent path traversal attacks (.. components and absolute paths)
        if ".." in file_path or file_path.startswith("/"):
            return Path(), ERROR_PATH_TRAVERSAL

        # If session_id provided, enforce workspace boundaries
        if session_id:
            # Normalize path separators and strip any session prefix
            sanitized_path = file_path.replace("\\", "/")
            session_prefix = f"data/files/{session_id}/"
            if sanitized_path.startswith(session_prefix):
                sanitized_path = sanitized_path[len(session_prefix) :]

            if sanitized_path != ".":
                while sanitized_path.startswith("./"):
                    sanitized_path = sanitized_path[2:]
            sanitized_path = sanitized_path.lstrip("/")

            requested_path = Path(sanitized_path)

            # Default to sources/ when no top-level directory explicitly provided
            allowed_roots = {"sources", "templates", "output"}
            if not requested_path.parts:
                relative_request = Path(".")
            elif requested_path.parts[0] in allowed_roots:
                relative_request = requested_path
            else:
                relative_request = Path("sources") / requested_path

            # Build full path within session workspace (DON'T resolve yet)
            cwd = Path.cwd()
            session_dir = cwd / "data" / "files" / session_id
            target_path = session_dir / relative_request  # Unresolved path

            # Security check: ensure REQUESTED path is within session workspace
            # This allows symlinks (templates/, output/) as long as they're in the workspace
            try:
                target_path.relative_to(session_dir)
            except ValueError:
                return Path(), ERROR_PATH_OUTSIDE_WORKSPACE

            # NOW resolve symlinks for actual file operations
            resolved_path = target_path.resolve()

            # Whitelist of allowed symlinks that can resolve outside session workspace
            # These are legitimate symlinks created by the application
            allowed_symlinks = {"templates", "output"}

            # Get first component of file_path to check if it's an allowed symlink
            first_component = relative_request.parts[0] if relative_request.parts else ""

            # Security check: ensure resolved path is still within session workspace
            # UNLESS it's one of our allowed symlinks (templates/, output/)
            if first_component not in allowed_symlinks:
                try:
                    resolved_path.relative_to(session_dir)
                except ValueError:
                    return Path(), ERROR_SYMLINK_ESCAPE

            return resolved_path, None
        else:
            # No session restriction - use standard project-scope validation
            cwd = Path.cwd()
            target_path = Path(file_path).resolve()

            # Security check: ensure path is within project scope
            if not (cwd in target_path.parents or target_path == cwd):
                return target_path, ERROR_PATH_OUTSIDE_PROJECT

            return target_path, None

    except (ValueError, OSError) as e:
        # ValueError: invalid path components
        # OSError: filesystem errors (permission denied, too long path, etc.)
        return Path(), f"Path validation failed: {e!s}"


def validate_file_path(
    file_path: str, check_exists: bool = True, max_size: int | None = None, session_id: str | None = None
) -> tuple[Path, str | None]:
    """
    Validate a file path for safety and accessibility.

    Args:
        file_path: Path to validate
        check_exists: Whether to check if file exists (default: True)
        max_size: Maximum allowed file size in bytes (optional)
        session_id: Optional session ID for workspace isolation

    Returns:
        Tuple of (resolved_path, error_message)
        If error_message is None, validation passed
    """
    try:
        # Use session-aware validation if session_id provided
        target_path, path_error = validate_session_path(file_path, session_id)
        if path_error:
            return target_path, path_error

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

    except (ValueError, OSError) as e:
        # ValueError: invalid path components
        # OSError: filesystem errors (file not found, permission denied, etc.)
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
    except FileNotFoundError:
        return "", f"File not found: {target_path}"
    except PermissionError:
        return "", f"Permission denied: {target_path}"
    except OSError as e:
        # OSError covers IOError and other filesystem errors
        return "", f"Failed to read file: {e!s}"


async def write_file_content(target_path: Path, content: str) -> tuple[None, str | None]:
    """
    Write text content to a file asynchronously.

    Args:
        target_path: Path object to write to
        content: Text content to write

    Returns:
        Tuple of (None, error_message)
        If error_message is None, write was successful
        Returns (None, None) on success, (None, error_msg) on failure
    """
    try:
        async with aiofiles.open(target_path, "w", encoding="utf-8") as f:
            await f.write(content)
        return None, None
    except PermissionError:
        return None, f"Permission denied: {target_path}"
    except OSError as e:
        # OSError covers disk full, path too long, and other filesystem errors
        return None, f"Failed to write file: {e!s}"


def validate_directory_path(
    dir_path: str, check_exists: bool = True, session_id: str | None = None
) -> tuple[Path, str | None]:
    """
    Validate a directory path for safety and accessibility.

    Args:
        dir_path: Path to validate
        check_exists: Whether to check if directory exists (default: True)
        session_id: Optional session ID for workspace isolation

    Returns:
        Tuple of (resolved_path, error_message)
        If error_message is None, validation passed
    """
    try:
        # Use session-aware validation if session_id provided
        target_path, path_error = validate_session_path(dir_path, session_id)
        if path_error:
            return target_path, path_error

        if check_exists:
            # Check if directory exists
            if not target_path.exists():
                return target_path, f"Directory not found: {dir_path}"

            # Check if it's a directory (not file)
            if not target_path.is_dir():
                return target_path, f"Not a directory: {dir_path}"

        return target_path, None

    except (ValueError, OSError) as e:
        # ValueError: invalid path components
        # OSError: filesystem errors (permission denied, etc.)
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
        return cast(str, json_pretty({"success": False, "error": error}))

    # Always include success status and wrap other fields in data
    response: dict[str, Any] = {"success": success}
    if kwargs:
        response["data"] = kwargs
    result: str = json_pretty(response)
    return result


async def file_operation(
    file_path: str,
    operation_func: Callable[..., tuple[str, dict[str, Any]]],
    session_id: str | None = None,
    **kwargs: Any,
) -> str:
    """
    Common pattern for file operations: validate, read, operate, write.

    Security: When session_id is provided, enforces workspace isolation.

    Args:
        file_path: Path to file (relative to session workspace if session_id provided)
        operation_func: Function that takes (content, **kwargs) and returns (new_content, result_data)
        session_id: Session ID for workspace isolation (enforces chroot jail)
        **kwargs: Additional arguments for the operation

    Returns:
        JSON response string
    """
    # Initialize response variable to ensure single exit point with proper type
    response: str

    # Early validation and content reading (with session sandbox if session_id provided)
    target_path, path_error = validate_file_path(file_path, session_id=session_id)

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
                    _, write_error = await write_file_content(target_path, new_content)
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
            except (ValueError, TypeError) as e:
                # ValueError: invalid operation arguments
                # TypeError: type mismatch in operation
                response = TextEditResponse(success=False, file_path=str(file_path), error=str(e)).to_json()
            except OSError as e:
                # OSError: filesystem errors during operation
                response = TextEditResponse(success=False, file_path=str(file_path), error=f"File error: {e}").to_json()

    # Single exit point
    return response


def save_uploaded_file(
    filename: str,
    data: list[int] | str,
    session_id: str | None = None,
    target_dir: str = "sources",
    encoding: str = "array",
) -> UploadResult:
    """Save uploaded file data to session-specific or general directory.

    Args:
        filename: Name of the file to save
        data: List of byte values (0-255) or base64 encoded string
        session_id: Optional session ID for session-specific storage
        target_dir: Target directory if no session_id (default: "sources")
        encoding: Data encoding - "array" for list[int], "base64" for base64 string

    Returns:
        UploadResult with success status and metadata (success + file info or error)
    """
    import base64

    try:
        # Validate filename (prevent directory traversal)
        if "/" in filename or "\\" in filename or ".." in filename:
            return {"success": False, "error": "Invalid filename: path separators not allowed"}

        # Determine target directory based on session_id
        cwd = Path.cwd()
        # Session-specific storage: data/files/{session_id}/sources/ or general storage: sources/
        target_path = cwd / "data" / "files" / session_id / "sources" if session_id else cwd / target_dir

        # Create directory if it doesn't exist
        target_path.mkdir(parents=True, exist_ok=True)

        # Build target file path
        target_file = target_path / filename

        # Check if file already exists and create backup
        if target_file.exists():
            backup_path = target_path / f"{filename}.backup"
            backup_path.write_bytes(target_file.read_bytes())

        # Convert data to bytes based on encoding
        # Type narrowing: base64 sends str, array sends list[int]
        byte_data = base64.b64decode(cast(str, data)) if encoding == "base64" else bytes(cast(list[int], data))
        target_file.write_bytes(byte_data)

        # Get file info
        file_size = target_file.stat().st_size

        # Return relative path from cwd
        relative_path = target_file.relative_to(cwd)

        return {
            "success": True,
            "file_path": str(relative_path),
            "size": file_size,
            "message": f"Saved {filename} ({file_size:,} bytes)",
        }

    except PermissionError as e:
        return {"success": False, "error": f"Permission denied: {e!s}"}
    except OSError as e:
        # OSError covers disk full, path too long, and other filesystem errors
        return {"success": False, "error": f"Failed to save file: {e!s}"}
