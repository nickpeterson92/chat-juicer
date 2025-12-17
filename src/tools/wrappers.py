"""
Session-aware tool wrappers for automatic session_id and model injection.

This module provides wrapper functions that inject the current session_id
and model into tool calls, enabling per-session workspace isolation (chroot jail)
and ensuring document summarization uses the conversation's model.

The Agent/Runner framework doesn't have a built-in mechanism to pass context
to tools, so we create wrapped versions that capture session_id and model at agent
creation time and inject them into every tool call.

Architecture:
- Agent works with relative paths (e.g., "sources/file.pdf")
- Wrapper injects session_id and model before calling the actual tool
- Tool validates path is within session workspace (data/files/{session_id}/)
- Security: Path traversal attacks blocked, workspace boundaries enforced
"""

from __future__ import annotations

from typing import Any

from tools.code_interpreter import execute_python_code
from tools.document_generation import generate_document
from tools.file_operations import list_directory, read_file, search_files
from tools.text_editing import EditOperation, edit_file
from utils.logger import logger


def create_session_aware_tools(session_id: str, model: str | None = None) -> list[Any]:
    """Create tool wrappers that automatically inject session_id and model for workspace isolation.

    This function creates wrapped versions of all file operation tools that capture
    the session_id and model at agent creation time and inject them into every tool call.

    Args:
        session_id: Session identifier for workspace isolation
        model: Model to use for document summarization (uses conversation's model)

    Returns:
        List of Agent-compatible tool wrappers with session_id and model injection

    Example:
        ```python
        # Create session-specific agent with isolated workspace
        session_tools = create_session_aware_tools("chat_abc123", model="gpt-5")
        agent = Agent(model="gpt-5", tools=session_tools)

        # Agent calls: read_file("sources/doc.pdf")
        # Wrapper injects: read_file("sources/doc.pdf", session_id="chat_abc123", model="gpt-5")
        # Tool resolves to: data/files/chat_abc123/sources/doc.pdf
        ```
    """
    from agents import function_tool

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
        return list_directory(path=path, session_id=session_id, show_hidden=show_hidden)  # type: ignore[no-any-return]

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
        return await edit_file(  # type: ignore[no-any-return]
            file_path=file_path,
            edits=edits,
            session_id=session_id,
        )

    # Document Generation - Write tool with session_id injection
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
        return await generate_document(  # type: ignore[no-any-return]
            content=content,
            filename=filename,
            session_id=session_id,
        )

    # Code Interpreter - Secure Python execution with session_id injection
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
        return await execute_python_code(code=code, session_id=session_id)  # type: ignore[no-any-return]

    # Create Agent-compatible tool objects with function_tool decorator
    return [
        function_tool(wrapped_list_directory),
        function_tool(wrapped_read_file),
        function_tool(wrapped_search_files),
        function_tool(wrapped_edit_file),
        function_tool(wrapped_generate_document),
        function_tool(wrapped_execute_python_code),
    ]
