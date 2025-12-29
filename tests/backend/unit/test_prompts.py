"""Tests for prompt utilities."""

from __future__ import annotations

from core.prompts import MAX_FILES_IN_PROMPT, SYSTEM_INSTRUCTIONS, build_dynamic_instructions


def test_build_dynamic_instructions_no_files() -> None:
    """Return base instructions when no files provided."""
    base = "BASE"
    result = build_dynamic_instructions(base, None)
    assert result == base


def test_build_dynamic_instructions_with_files() -> None:
    """Append file section when files are provided."""
    base = "BASE"
    files = ["a.txt", "b.pdf"]

    result = build_dynamic_instructions(base, session_files=files)

    assert base in result
    assert "Current Session Files" in result
    for name in files:
        assert name in result


def test_build_dynamic_instructions_truncates_long_list() -> None:
    """Cap file list and indicate remaining count."""
    base = "BASE"
    total_files = MAX_FILES_IN_PROMPT + 3
    files = [f"file_{i}.txt" for i in range(total_files)]

    result = build_dynamic_instructions(base, session_files=files)

    # Should include only the first MAX_FILES_IN_PROMPT files
    assert files[MAX_FILES_IN_PROMPT - 1] in result
    assert files[-1] not in result
    assert "...and 3 more files" in result


def test_build_dynamic_instructions_empty_list() -> None:
    """Return base instructions when file list is empty."""
    base = "BASE"
    result = build_dynamic_instructions(base, session_files=[])
    assert result == base


def test_build_dynamic_instructions_keeps_mcp_sections_when_all_enabled() -> None:
    """Retain MCP guidance when all servers are enabled."""
    result = build_dynamic_instructions(
        base_instructions=SYSTEM_INSTRUCTIONS,
        mcp_servers=["sequential", "fetch", "tavily"],
    )

    assert "- **Complex Problem Solving**: Use Sequential Thinking for multi-step reasoning" in result
    assert "**fetch** - Retrieve and convert web pages to markdown for close reading" in result
    assert "**tavily-search** - Search the public web with AI-powered results (query, urls, snippets)" in result
    assert "### When Searching the Web:" in result
    assert (
        "- **Use sequential thinking**: Complex reasoning can be used to solve complex problems or when the user requests you think about something."
        in result
    )


def test_build_dynamic_instructions_strips_disabled_mcp_sections() -> None:
    """Remove MCP-specific content when servers are disabled."""
    result = build_dynamic_instructions(
        base_instructions=SYSTEM_INSTRUCTIONS,
        mcp_servers=["fetch"],  # Sequential and Tavily disabled
    )

    # Sequential Thinking content removed
    assert "- **Complex Problem Solving**: Use Sequential Thinking for multi-step reasoning" not in result
    assert "### When Solving Complex Problems:" not in result
    assert (
        "- **Use sequential thinking**: Complex reasoning can be used to solve complex problems or when the user requests you think about something."
        not in result
    )

    # Tavily content removed
    assert "**tavily-search** - Search the public web with AI-powered results (query, urls, snippets)" not in result
    assert "**tavily-extract** - Extract structured data from web pages" not in result
    assert "### When Searching the Web:" not in result

    # Fetch retained
    assert "**fetch** - Retrieve and convert web pages to markdown for close reading" in result
