"""
File operation utilities for Wishgate.
Provides safe, validated file and directory operations with async support.
"""

from __future__ import annotations

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
from utils.json_utils import json_pretty


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
            # Build full path within session workspace (DON'T resolve yet)
            cwd = Path.cwd()
            session_dir = cwd / "data" / "files" / session_id
            target_path = session_dir / file_path  # Unresolved path

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
            first_component = Path(file_path).parts[0] if Path(file_path).parts else ""

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

    except Exception as e:
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


def save_uploaded_file(
    filename: str, data: list[int], session_id: str | None = None, target_dir: str = "sources"
) -> dict[str, Any]:
    """
    Save uploaded file data to session-specific or general directory.

    If session_id is provided and the file is saved successfully, also uploads
    to OpenAI Files API for code interpreter access.

    Args:
        filename: Name of the file to save
        data: List of byte values (0-255)
        session_id: Optional session ID for session-specific storage
        target_dir: Target directory if no session_id (default: "sources")

    Returns:
        Dictionary with success status, file_id (if uploaded to OpenAI), and metadata
    """
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

        # Convert list of ints to bytes and write
        byte_data = bytes(data)
        target_file.write_bytes(byte_data)

        # Get file info
        file_size = target_file.stat().st_size

        # Return relative path from cwd
        relative_path = target_file.relative_to(cwd)

        # Upload to OpenAI Files API if session_id provided
        file_id = None
        if session_id:
            try:
                from openai import OpenAI

                client = OpenAI()  # Uses OPENAI_API_KEY from environment

                # Upload file to OpenAI Files API for code interpreter
                with open(target_file, "rb") as f:
                    file_obj = client.files.create(file=f, purpose="assistants")
                    file_id = file_obj.id

            except Exception as e:
                # Log error but don't fail the upload - file is still saved locally
                from utils.logger import logger

                logger.warning(f"Failed to upload {filename} to OpenAI Files API: {e}")

        return {
            "success": True,
            "file_path": str(relative_path),
            "file_id": file_id,
            "size": file_size,
            "message": f"Saved {filename} ({file_size:,} bytes)" + (" and uploaded to OpenAI" if file_id else ""),
        }

    except Exception as e:
        return {"success": False, "error": f"Failed to save file: {e!s}"}


def download_code_interpreter_file(  # noqa: PLR0911
    file_id: str,
    filename: str | None,
    container_id: str | None,
    session_id: str | None,
) -> dict[str, Any]:
    """
    Download a file generated by the code interpreter via OpenAI Files API.

    Saves the file into the session's output directory and returns metadata for the UI.

    Args:
        file_id: OpenAI file identifier
        filename: Suggested filename from the annotation (may be None)
        container_id: Optional container identifier for sandboxed files
        session_id: Session identifier for workspace isolation

    Returns:
        Dictionary with success flag, file_path, size, and message/error
    """

    def _sanitize_filename(name: str | None, fallback: str) -> str:
        candidate = (name or "").strip()
        if not candidate:
            candidate = fallback
        # Prevent path traversal by taking basename only
        sanitized = Path(candidate).name
        return sanitized or fallback

    def _ensure_unique_path(directory: Path, name: str) -> Path:
        target = directory / name
        if not target.exists():
            return target
        stem = target.stem
        suffix = target.suffix
        counter = 1
        while True:
            candidate = directory / f"{stem}_{counter}{suffix}"
            if not candidate.exists():
                return candidate
            counter += 1

    if not file_id:
        return {"success": False, "error": "Missing file_id"}

    if not session_id:
        return {"success": False, "error": "Missing session_id"}

    if file_id.startswith("cfile") and not container_id:
        return {
            "success": False,
            "error": "Missing container_id for code interpreter file",
        }

    try:
        from openai import OpenAI
    except Exception as exc:  # pragma: no cover - handled at runtime
        return {"success": False, "error": f"OpenAI client unavailable: {exc!s}"}

    try:
        cwd = Path.cwd()
        output_dir = cwd / "data" / "files" / session_id / "output"
        output_dir.mkdir(parents=True, exist_ok=True)

        suggested_name = _sanitize_filename(filename, f"{file_id}.bin")
        target_path = _ensure_unique_path(output_dir, suggested_name)

        client = OpenAI()

        try:
            if container_id:
                response = client.containers.files.content.retrieve(file_id=file_id, container_id=container_id)
            else:
                response = client.files.content(file_id)
        except Exception as api_error:
            from utils.logger import logger  # Local import to avoid circular deps

            logger.error(
                "Failed to retrieve code interpreter file",
                exc_info=True,
                file_id=file_id,
                container_id=container_id,
            )
            return {"success": False, "error": f"Failed to retrieve file: {api_error!s}"}

        file_bytes: bytes | bytearray
        if hasattr(response, "read") and callable(response.read):
            file_bytes = response.read()
        elif hasattr(response, "getvalue"):
            file_bytes = response.getvalue()
        elif isinstance(response, bytes | bytearray):
            file_bytes = response
        else:
            # Fallback: try iterating over chunks (type: ignore for dynamic response types)
            try:
                chunks = [bytes(chunk) for chunk in response]  # type: ignore[attr-defined]
            except TypeError:
                chunks = [bytes(response)]  # type: ignore[call-overload]
            file_bytes = b"".join(chunks)

        target_path.write_bytes(file_bytes)
        file_size = target_path.stat().st_size
        relative_path = target_path.relative_to(cwd)

        return {
            "success": True,
            "file_path": str(relative_path),
            "size": file_size,
            "filename": target_path.name,
            "message": f"Downloaded {target_path.name} ({file_size:,} bytes)",
        }
    except Exception as e:  # pragma: no cover - runtime safety
        from utils.logger import logger

        logger.error(f"Failed to download code interpreter file {file_id}", exc_info=True)
        return {"success": False, "error": f"Failed to download file: {e!s}"}
