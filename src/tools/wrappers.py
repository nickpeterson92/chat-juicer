"""
Session-aware tool wrappers for automatic session_id injection.

This module provides wrapper functions that inject the current session_id
into tool calls, enabling per-session workspace isolation (chroot jail).

The Agent/Runner framework doesn't have a built-in mechanism to pass context
to tools, so we create wrapped versions that capture the session_id at agent
creation time and inject it into every tool call.

Architecture:
- Agent works with relative paths (e.g., "sources/file.pdf")
- Wrapper injects session_id before calling the actual tool
- Tool validates path is within session workspace (data/files/{session_id}/)
- Security: Path traversal attacks blocked, workspace boundaries enforced
"""

from __future__ import annotations

from typing import Any

from tools.document_generation import generate_document
from tools.file_operations import list_directory, read_file
from tools.text_editing import insert_text, regex_edit, text_edit
from utils.logger import logger


def create_session_aware_tools(session_id: str) -> list[Any]:
    """Create tool wrappers that automatically inject session_id for workspace isolation.

    This function creates wrapped versions of all file operation tools that capture
    the session_id at agent creation time and inject it into every tool call.

    Args:
        session_id: Session identifier for workspace isolation

    Returns:
        List of Agent-compatible tool wrappers with session_id injection

    Example:
        ```python
        # Create session-specific agent with isolated workspace
        session_tools = create_session_aware_tools("chat_abc123")
        agent = Agent(model="gpt-5", tools=session_tools)

        # Agent calls: read_file("sources/doc.pdf")
        # Wrapper injects: read_file("sources/doc.pdf", session_id="chat_abc123")
        # Tool resolves to: data/files/chat_abc123/sources/doc.pdf
        ```
    """
    from agents import function_tool

    logger.info(f"Creating session-aware tools for session: {session_id}")

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

    async def wrapped_read_file(file_path: str) -> str:
        """Read file contents with automatic format conversion.

        Args:
            file_path: Path to file relative to session workspace

        Returns:
            JSON with file contents and metadata
        """
        return await read_file(file_path=file_path, session_id=session_id)  # type: ignore[no-any-return]

    # Text Editing - Modification tools with session_id injection
    async def wrapped_text_edit(
        file_path: str,
        find: str,
        replace_with: str,
        replace_all: bool = False,
    ) -> str:
        """Find and replace exact text in a document.

        Args:
            file_path: Path to file relative to session workspace
            find: Exact text to find
            replace_with: Text to replace with (empty string to delete)
            replace_all: Replace all occurrences (default: False)

        Returns:
            JSON with success status and replacements made
        """
        return await text_edit(  # type: ignore[no-any-return]
            file_path=file_path,
            find=find,
            replace_with=replace_with,
            replace_all=replace_all,
            session_id=session_id,
        )

    async def wrapped_regex_edit(
        file_path: str,
        pattern: str,
        replacement: str,
        replace_all: bool = False,
        flags: str = "ms",
    ) -> str:
        """Pattern-based editing using regular expressions.

        Args:
            file_path: Path to file relative to session workspace
            pattern: Regular expression pattern to match
            replacement: Replacement text (can use \\1, \\2 for capture groups)
            replace_all: Replace all matches (default: False)
            flags: Regex flags - m=multiline, s=dotall, i=ignorecase (default: 'ms')

        Returns:
            JSON with success status and replacements made
        """
        return await regex_edit(  # type: ignore[no-any-return]
            file_path=file_path,
            pattern=pattern,
            replacement=replacement,
            replace_all=replace_all,
            flags=flags,
            session_id=session_id,
        )

    async def wrapped_insert_text(
        file_path: str,
        anchor: str,
        text: str,
        position: str = "after",
    ) -> str:
        """Insert text before or after an anchor point.

        Args:
            file_path: Path to file relative to session workspace
            anchor: Text to find as the insertion point
            text: Text to insert
            position: Where to insert - 'before' or 'after' the anchor (default: 'after')

        Returns:
            JSON with success status
        """
        return await insert_text(  # type: ignore[no-any-return]
            file_path=file_path,
            anchor=anchor,
            text=text,
            position=position,
            session_id=session_id,
        )

    # Document Generation - Write tool with session_id injection
    async def wrapped_generate_document(
        content: str,
        filename: str,
        create_backup: bool = False,
    ) -> str:
        """Save generated content to the output directory.

        Args:
            content: Complete document content to save
            filename: Filename and optional subdirectories within output/
            create_backup: Create .backup backup of existing file (default: False)

        Returns:
            JSON with success status
        """
        return await generate_document(  # type: ignore[no-any-return]
            content=content,
            filename=filename,
            create_backup=create_backup,
            session_id=session_id,
        )

    # Create Agent-compatible tool objects with function_tool decorator
    return [
        function_tool(wrapped_list_directory),
        function_tool(wrapped_read_file),
        function_tool(wrapped_text_edit),
        function_tool(wrapped_regex_edit),
        function_tool(wrapped_insert_text),
        function_tool(wrapped_generate_document),
    ]
