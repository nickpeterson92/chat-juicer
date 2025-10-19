"""
Text editing tools for Wishgate.
Provides unified file editing with diff preview and batch operations.
"""

from __future__ import annotations

import difflib

from typing import Any

from pydantic import BaseModel

from utils.file_utils import file_operation


def resolve_edit_path(file_path: str) -> str:
    """Resolve edit path with smart output/ prepending for consistency with generate_document.

    Rules:
    - If path starts with output/, sources/, templates/, or is absolute → use as-is
    - Otherwise → prepend output/ for consistency with document generation workflow

    Args:
        file_path: Original file path from user

    Returns:
        Resolved file path with output/ prepended if needed

    Examples:
        "report.md" → "output/report.md"
        "drafts/v2.md" → "output/drafts/v2.md"
        "output/report.md" → "output/report.md" (no double prepend)
        "sources/input.txt" → "sources/input.txt"
        "templates/base.md" → "templates/base.md"
        "/absolute/path.md" → "/absolute/path.md"
    """
    # Don't prepend if path already has a directory prefix or is absolute
    if file_path.startswith(("output/", "sources/", "templates/", "/", "../")):
        return file_path
    # Default: prepend output/ for consistency with generate_document
    return f"output/{file_path}"


class EditOperation(BaseModel):
    """Represents a single edit operation in a file."""

    oldText: str
    newText: str


def normalize_whitespace_for_matching(text: str) -> str:
    """Normalize whitespace for flexible matching while preserving structure.

    Converts runs of spaces/tabs to single spaces, but preserves newlines.
    This allows matching text with different indentation levels.

    Args:
        text: Text to normalize

    Returns:
        Text with normalized whitespace
    """
    lines = text.split("\n")
    normalized_lines = []
    for line in lines:
        # Collapse multiple spaces/tabs to single space, but keep line structure
        normalized = " ".join(line.split())
        normalized_lines.append(normalized)
    return "\n".join(normalized_lines)


def find_text_with_flexible_whitespace(content: str, search_text: str) -> int:
    """Find text in content with whitespace-flexible matching.

    First tries exact match, then falls back to normalized whitespace matching.
    This allows finding text even when indentation differs.

    Args:
        content: Full file content to search in
        search_text: Text to find

    Returns:
        Index of match, or -1 if not found
    """
    # Try exact match first
    idx = content.find(search_text)
    if idx != -1:
        return idx

    # Try whitespace-flexible matching
    normalized_content = normalize_whitespace_for_matching(content)
    normalized_search = normalize_whitespace_for_matching(search_text)

    idx = normalized_content.find(normalized_search)
    if idx != -1:
        # Map normalized position back to original position
        # Count characters in original up to this point
        char_count = 0
        for i, char in enumerate(content):
            if char_count == idx:
                return i
            if not char.isspace() or char == "\n":
                char_count += 1

    return -1


def generate_diff(original_content: str, new_content: str, file_path: str) -> str:
    """Generate git-style unified diff showing changes.

    Args:
        original_content: Original file content
        new_content: Modified file content
        file_path: Path to file (for diff headers)

    Returns:
        Unified diff string
    """
    original_lines = original_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)

    diff = difflib.unified_diff(
        original_lines,
        new_lines,
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )

    return "".join(diff)


async def edit_file(
    file_path: str,
    edits: list[EditOperation],
    session_id: str | None = None,
) -> str:
    """
    Make line-based edits to a text file. Each edit replaces exact line sequences
    with new content. Returns a git-style diff showing the changes made.

    Security: When session_id is provided, path is restricted to session workspace.

    Path Resolution: For consistency with generate_document, paths are auto-prefixed
    with output/ unless they explicitly start with output/, sources/, templates/,
    or are absolute paths. Examples:
    - "report.md" → "output/report.md"
    - "output/report.md" → "output/report.md" (no double prepend)
    - "sources/data.txt" → "sources/data.txt"

    Features:
    - Batch multiple edits in one operation
    - Git-style diff output for verification
    - Whitespace-flexible matching (tries exact first, then normalized)
    - Sequential edit processing (each edit sees previous edit's result)
    - Smart output/ prepending for workflow consistency

    Args:
        file_path: Path to file to edit. Auto-prepends output/ unless path starts
                  with output/, sources/, templates/, or is absolute.
        edits: List of edit operations, each with {"oldText": "...", "newText": "..."}
        session_id: Session ID for workspace isolation (enforces chroot jail)

    Returns:
        JSON response with diff and edit summary

    Example:
        edits = [
            EditOperation(oldText="Hello World", newText="Hello Claude"),
            EditOperation(oldText="Version 1.0", newText="Version 2.0")
        ]
    """
    # Resolve path with smart output/ prepending
    resolved_path = resolve_edit_path(file_path)

    def do_edit(content: str, **kwargs: Any) -> tuple[str | None, dict[str, Any]]:
        """Inner function to perform batch edits."""
        edits_list: list[EditOperation] = kwargs.get("edits", [])

        if not edits_list:
            return None, {"error": "No edits provided"}

        # Store original content for diff
        original_content = content
        current_content = content
        changes_made = 0

        # Apply edits sequentially
        for i, edit in enumerate(edits_list):
            old_text = edit.oldText
            new_text = edit.newText

            if not old_text:
                return None, {"error": f"Edit {i + 1}: oldText cannot be empty"}

            # Find text with flexible whitespace matching
            idx = find_text_with_flexible_whitespace(current_content, old_text)

            if idx == -1:
                return None, {
                    "error": f"Edit {i + 1}: oldText not found",
                    "oldText": old_text[:100] + "..." if len(old_text) > 100 else old_text,
                }

            # Replace the text
            current_content = current_content[:idx] + new_text + current_content[idx + len(old_text) :]
            changes_made += 1

        # Generate diff (use original file_path for clearer diff headers)
        diff_output = generate_diff(original_content, current_content, file_path)

        # Return new content to be written
        return current_content, {
            "operation": "edit",
            "changes_made": changes_made,
            "diff": diff_output,
        }

    result = await file_operation(
        resolved_path,  # Use resolved path for actual file operation
        do_edit,
        session_id=session_id,
        edits=edits,
    )
    return result  # type: ignore[no-any-return]
