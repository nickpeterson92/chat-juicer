"""
Text editing tools for Wishgate.
Provides find/replace, regex editing, and text insertion capabilities.
"""

from __future__ import annotations

import re

from typing import Any

from utils.file_utils import file_operation


async def text_edit(
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

    def do_edit(content: str, **kwargs: Any) -> tuple[str, dict[str, Any]]:
        """Inner function to perform text replacement."""
        find_text: str = kwargs.get("find", "")
        replace_text: str = kwargs.get("replace_with", "")
        replace_all: bool = kwargs.get("replace_all", False)

        if not find_text:
            return content, {"error": "Find text cannot be empty"}

        occurrences = content.count(find_text)
        if occurrences == 0:
            return content, {"warning": "Text not found", "find": find_text}

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

    result = await file_operation(file_path, do_edit, find=find, replace_with=replace_with, replace_all=replace_all)
    return result  # type: ignore[no-any-return]


async def regex_edit(
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

    def do_regex_edit(content: str, **kwargs: Any) -> tuple[str, dict[str, Any]]:
        """Inner function to perform regex replacement."""
        pattern_str: str = kwargs.get("pattern", "")
        replacement: str = kwargs.get("replacement", "")
        replace_all: bool = kwargs.get("replace_all", False)
        flags_str: str = kwargs.get("flags", "ms")

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
            return content, {"error": f"Invalid regex pattern: {e}"}

        matches = list(regex_pattern.finditer(content))
        if not matches:
            return content, {"warning": "No matches found", "pattern": pattern_str}

        if replace_all:
            new_content = regex_pattern.sub(replacement, content)
            replacements = len(matches)
        else:
            new_content = regex_pattern.sub(replacement, content, count=1)
            replacements = 1

        operation = "delete" if replacement == "" else "replace"
        return new_content, {"operation": operation, "pattern": pattern_str, "replacements": replacements}

    result = await file_operation(
        file_path, do_regex_edit, pattern=pattern, replacement=replacement, replace_all=replace_all, flags=flags
    )
    return result  # type: ignore[no-any-return]


async def insert_text(
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

    def do_insert(content: str, **kwargs: Any) -> tuple[str, dict[str, Any]]:
        """Inner function to perform text insertion."""
        anchor_text: str = kwargs.get("anchor", "")
        insert_text: str = kwargs.get("text", "")
        position: str = kwargs.get("position", "after")

        if not anchor_text or not insert_text:
            return content, {"error": "Anchor and text cannot be empty"}

        idx = content.find(anchor_text)
        if idx == -1:
            return content, {"error": f"Anchor text not found: {anchor_text}"}

        if position == "after":
            insert_pos = idx + len(anchor_text)
        elif position == "before":
            insert_pos = idx
        else:
            return content, {"error": f"Invalid position: {position}. Use 'before' or 'after'"}

        new_content = content[:insert_pos] + insert_text + content[insert_pos:]

        return new_content, {
            "operation": "insert",
            "position": position,
            "anchor": anchor_text[:50] + "..." if len(anchor_text) > 50 else anchor_text,
            "text_length": len(insert_text),
        }

    result = await file_operation(file_path, do_insert, anchor=anchor, text=text, position=position)
    return result  # type: ignore[no-any-return]
