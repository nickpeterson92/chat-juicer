"""
Session-aware tool wrappers for automatic session_id and model injection.

This module provides wrapper functions that inject the current session_id
and model into tool calls, enabling per-session workspace isolation (chroot jail)
and ensuring document summarization uses the conversation's model.

The Agent/Runner framework doesn't have a built-in mechanism to pass context
to tools, so we create wrapped versions that capture session_id and model at agent
creation time and inject them into every tool call.

Architecture:
- Agent works with relative paths (e.g., "input/file.pdf")
- Wrapper injects session_id and model before calling the actual tool
- Tool validates path is within session workspace (data/files/{session_id}/)
- Security: Path traversal attacks blocked, workspace boundaries enforced
"""

from __future__ import annotations

import json

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

import asyncpg

if TYPE_CHECKING:
    from api.services.s3_sync_service import S3SyncService

from tools.code_interpreter import execute_python_code
from tools.context_search import _search_project_context_impl
from tools.document_generation import generate_document
from tools.file_operations import list_directory, read_file, search_files
from tools.schema_fetch import get_table_schema, list_registered_databases
from tools.text_editing import EditOperation, edit_file, resolve_edit_path
from utils.logger import logger


def create_session_aware_tools(
    session_id: str,
    model: str | None = None,
    s3_sync: S3SyncService | None = None,
    pool: asyncpg.Pool | None = None,
    project_id: str | None = None,
) -> list[Any]:
    """Create tool wrappers that automatically inject session_id and model for workspace isolation.

    This function creates wrapped versions of all file operation tools that capture
    the session_id and model at agent creation time and inject them into every tool call.

    Args:
        session_id: Session identifier for workspace isolation
        model: Model to use for document summarization (uses conversation's model)
        s3_sync: Optional S3 sync service for cloud file persistence
        pool: Database pool for context search (optional)
        project_id: Project ID for context search scope (optional)

    Returns:
        List of Agent-compatible tool wrappers with session_id and model injection

    Example:
        ```python
        # Create session-specific agent with isolated workspace
        session_tools = create_session_aware_tools("chat_abc123", model="gpt-5")
        agent = Agent(model="gpt-5", tools=session_tools)

        # Agent calls: read_file("input/doc.pdf")
        # Wrapper injects: read_file("input/doc.pdf", session_id="chat_abc123", model="gpt-5")
        # Tool resolves to: data/files/chat_abc123/input/doc.pdf
        ```
    """
    import time

    from functools import wraps

    from agents import function_tool

    from utils.metrics import mcp_tool_call_duration_seconds, mcp_tool_calls_total

    def track_tool_execution(
        tool_name: str,
    ) -> Callable[[Callable[..., Awaitable[str]]], Callable[..., Awaitable[str]]]:
        """Decorator to track tool execution metrics."""

        def decorator(func: Callable[..., Awaitable[str]]) -> Callable[..., Awaitable[str]]:
            @wraps(func)
            async def wrapper(*args: Any, **kwargs: Any) -> str:
                start_time = time.perf_counter()
                status = "success"
                try:
                    result = await func(*args, **kwargs)
                    # Try to check success in JSON result if applicable
                    if isinstance(result, str) and result.strip().startswith("{"):
                        try:
                            data = json.loads(result)
                            if isinstance(data, dict) and not data.get("success", True) and "error" in data:
                                status = "error"
                        except Exception:
                            pass
                    return result
                except Exception:
                    status = "error"
                    raise
                finally:
                    duration = time.perf_counter() - start_time
                    mcp_tool_calls_total.labels(tool_name=tool_name, status=status).inc()
                    mcp_tool_call_duration_seconds.labels(tool_name=tool_name).observe(duration)

            return wrapper

        return decorator

    logger.info(f"Creating session-aware tools for session: {session_id}, model: {model}")

    # File Operations - Read-only tools with session_id injection
    def wrapped_list_directory(path: str = ".", show_hidden: bool = False) -> str:
        """List contents of a directory within session workspace.

        Args:
            path: Directory path relative to session workspace (default: ".")
            show_hidden: Include hidden files/folders (default: False)

        Returns:
            JSON with directory contents and metadata
        """
        # Note: list_directory is synchronous, but we can still track it.
        # However, track_tool_execution is async. We handle list_directory specially or duplicate logic?
        # Since list_directory is fast and local, maybe skip or wrap manually?
        # Actually list_directory is synchronous in file_operations.py.
        # But the agent framework might expect async or sync.
        # function_tool handles both.
        # Let's wrap it manually for metrics since decorator is async.
        start_time = time.perf_counter()
        status = "success"
        try:
            return list_directory(path=path, session_id=session_id, show_hidden=show_hidden)  # type: ignore[no-any-return]
        except Exception:
            status = "error"
            raise
        finally:
            duration = time.perf_counter() - start_time
            mcp_tool_calls_total.labels(tool_name="list_directory", status=status).inc()
            mcp_tool_call_duration_seconds.labels(tool_name="list_directory").observe(duration)

    @track_tool_execution("read_file")
    async def wrapped_read_file(file_path: str, head: int | None = None, tail: int | None = None) -> str:
        """Read file contents with automatic format conversion.

        Args:
            file_path: Path to file relative to session workspace
            head: Read only first N lines (optional)
            tail: Read only last N lines (optional)

        Returns:
            JSON with file contents and metadata
        """
        return await read_file(file_path=file_path, session_id=session_id, head=head, tail=tail, model=model)  # type: ignore[no-any-return]

    @track_tool_execution("search_files")
    async def wrapped_search_files(
        pattern: str,
        base_path: str = ".",
        recursive: bool = True,
        max_results: int = 100,
    ) -> str:
        """Search for files matching a glob pattern.

        Args:
            pattern: Glob pattern (e.g., "*.md", "**/*.py", "report_*.txt")
            base_path: Directory to start search (default: ".")
            recursive: Search subdirectories recursively (default: True)
            max_results: Maximum number of results (default: 100)

        Returns:
            JSON with matching files and metadata
        """
        return await search_files(  # type: ignore[no-any-return]
            pattern=pattern,
            base_path=base_path,
            session_id=session_id,
            recursive=recursive,
            max_results=max_results,
        )

    # Text Editing - Unified editing tool with session_id injection
    @track_tool_execution("edit_file")
    async def wrapped_edit_file(
        file_path: str,
        edits: list[EditOperation],
    ) -> str:
        """Make batch edits to a text file with git-style diff output.

        Args:
            file_path: Path to file relative to session workspace
            edits: List of edit operations (oldText, newText pairs)

        Returns:
            JSON with diff output and edit summary
        """
        result = await edit_file(
            file_path=file_path,
            edits=edits,
            session_id=session_id,
        )

        if s3_sync:
            try:
                # edit_file returns JSON string
                response_data = json.loads(result)
                if response_data.get("success"):
                    # Resolve path to get correct folder/filename
                    resolved = resolve_edit_path(file_path)

                    if "/" in resolved:
                        folder, filename = resolved.split("/", 1)
                        if folder in ("output", "input", "templates"):
                            logger.info(f"Triggering background S3 upload for {folder}/{filename}")
                            s3_sync.upload_to_s3_background(session_id, folder, filename)
            except (json.JSONDecodeError, Exception) as e:
                logger.warning(f"Failed to parse edit response for S3 trigger: {e}")

        return result  # type: ignore[no-any-return]

    # Document Generation - Write tool with session_id injection
    @track_tool_execution("generate_document")
    async def wrapped_generate_document(
        content: str,
        filename: str,
    ) -> str:
        """Save generated content to the output directory.

        Args:
            content: Complete document content to save
            filename: Filename and optional subdirectories within output/

        Returns:
            JSON with success status
        """
        result = await generate_document(
            content=content,
            filename=filename,
            session_id=session_id,
        )

        if s3_sync:
            try:
                # generate_document returns JSON string
                response_data = json.loads(result)
                if response_data.get("success"):
                    # generate_document always writes to output/
                    logger.info(f"Triggering background S3 upload for output/{filename}")
                    s3_sync.upload_to_s3_background(session_id, "output", filename)
            except (json.JSONDecodeError, Exception) as e:
                logger.warning(f"Failed to parse generate_document response for S3 trigger: {e}")

        return result  # type: ignore[no-any-return]

    # Code Interpreter - Secure Python execution with session_id injection
    @track_tool_execution("execute_python_code")
    async def wrapped_execute_python_code(code: str) -> str:
        """Execute Python code in a secure sandbox environment.

        The sandbox has access to:
        - numpy, pandas, matplotlib, scipy, seaborn, scikit-learn
        - pillow, sympy, plotly
        - openpyxl, python-docx, pypdf, python-pptx (office documents)
        - tabulate, faker, dateutil, humanize, pyyaml, lxml, pypandoc (utilities)

        Limitations:
        - No internet access
        - No filesystem access outside /workspace
        - 60 second timeout
        - 512MB memory limit

        For plots, use matplotlib - figures are automatically saved to the session's
        output directory (data/files/{session_id}/output/code/) and returned.
        For data output, print to stdout or save files to /workspace/ - they will
        be collected and persisted alongside other generated documents.

        Args:
            code: Python code to execute

        Returns:
            JSON with stdout, files generated, and execution metadata
        """
        result = await execute_python_code(code=code, session_id=session_id)

        # Trigger S3 sync for generated files
        if s3_sync:
            try:
                response_data = json.loads(result)
                if response_data.get("success") and response_data.get("files"):
                    for file_info in response_data["files"]:
                        # Files are in output/code/ directory
                        filename = f"code/{file_info['name']}"
                        logger.info(f"Triggering background S3 upload for output/{filename}")
                        s3_sync.upload_to_s3_background(session_id, "output", filename)
            except (json.JSONDecodeError, Exception) as e:
                logger.warning(f"Failed to parse execute_python_code response for S3 trigger: {e}")

        return result  # type: ignore[no-any-return]

    # Schema Fetch - Database schema tools (no session injection needed, uses global registry)
    @track_tool_execution("list_registered_databases")
    async def wrapped_list_registered_databases() -> str:
        """List all databases configured in the registry.

        Discover available database connections before fetching schemas.
        Returns database names and types (postgresql, mysql, sqlserver).

        Returns:
            JSON with list of configured databases
        """
        return await list_registered_databases()  # type: ignore[no-any-return]

    @track_tool_execution("get_table_schema")
    async def wrapped_get_table_schema(db_name: str, table_name: str) -> str:
        """Fetch column schema for a database table.

        Returns column names, types, and nullability. Call this for each table
        involved in a mapping - input, targets, or lookup tables. For complex
        integrations, multiple source tables may feed into one target (denormalization),
        or one source may split across multiple targets (normalization).

        Args:
            db_name: Database name from registry (use list_registered_databases to discover)
            table_name: Table name to fetch schema for

        Returns:
            JSON with column metadata
        """
        return await get_table_schema(db_name=db_name, table_name=table_name)  # type: ignore[no-any-return]

    # Context Search - Project knowledge base search (requires pool and project_id)
    @track_tool_execution("search_project_context")
    async def wrapped_search_project_context(
        query: str,
        top_k: int = 5,
        min_score: float = 0.7,
    ) -> str:
        """Search the current project's knowledge base for relevant context.

        Uses semantic similarity to find related session summaries, messages,
        and file content from the current project. Only available when the
        session is associated with a project.

        Args:
            query: Natural language search query describing what you're looking for
            top_k: Maximum number of results to return (1-20, default 5)
            min_score: Minimum similarity score threshold (0.0-1.0, default 0.7)

        Returns:
            Formatted search results with relevant context chunks
        """
        if not pool or not project_id:
            return "Context search unavailable: session is not associated with a project."
        return await _search_project_context_impl(  # type: ignore[no-any-return]
            query=query,
            project_id=project_id,
            pool=pool,
            top_k=top_k,
            min_score=min_score,
        )

    # Create Agent-compatible tool objects with function_tool decorator
    tools = [
        function_tool(wrapped_list_directory),
        function_tool(wrapped_read_file),
        function_tool(wrapped_search_files),
        function_tool(wrapped_edit_file),
        function_tool(wrapped_generate_document),
        function_tool(wrapped_execute_python_code),
        function_tool(wrapped_list_registered_databases),
        function_tool(wrapped_get_table_schema),
    ]

    # Only add context search if pool and project_id are available
    if pool and project_id:
        tools.append(function_tool(wrapped_search_project_context))

    return tools
