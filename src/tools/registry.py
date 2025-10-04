"""
Tool registry for Chat Juicer Agent.
Defines all available tools and their metadata for the Agent/Runner framework.
"""

from __future__ import annotations

from collections.abc import Awaitable
from typing import Any, Callable

from tools.document_generation import generate_document
from tools.file_operations import list_directory, read_file
from tools.text_editing import insert_text, regex_edit, text_edit

# Agent/Runner tools - wrap functions with function_tool decorator
# The concrete tool type comes from the external agents SDK; keep as Any at boundary
AGENT_TOOLS: list[Any]

# Function registry for execution
# Functions may be sync (return str) or async (return Awaitable[str])
FUNCTION_REGISTRY: dict[str, Callable[..., str] | Callable[..., Awaitable[str]]]


def initialize_tools() -> tuple[list[Any], dict[str, Callable[..., str] | Callable[..., Awaitable[str]]]]:
    """Initialize tool registry with all available tools.

    Returns:
        Tuple of (AGENT_TOOLS list, FUNCTION_REGISTRY dict)
    """
    try:
        from agents import function_tool

        # Wrap existing functions as Agent tools
        list_directory_tool = function_tool(list_directory)
        read_file_tool = function_tool(read_file)
        generate_document_tool = function_tool(generate_document)
        text_edit_tool = function_tool(text_edit)
        regex_edit_tool = function_tool(regex_edit)
        insert_text_tool = function_tool(insert_text)

        # List of tools for Agent
        agent_tools = [
            list_directory_tool,
            read_file_tool,
            generate_document_tool,
            regex_edit_tool,
            text_edit_tool,
            insert_text_tool,
        ]

        # Function registry for direct execution
        function_registry = {
            "list_directory": list_directory,
            "read_file": read_file,
            "generate_document": generate_document,
            "text_edit": text_edit,
            "regex_edit": regex_edit,
            "insert_text": insert_text,
        }

        return agent_tools, function_registry

    except ImportError:
        # If agents module not available, provide empty tools list
        return [], {}


# Initialize on module import
AGENT_TOOLS, FUNCTION_REGISTRY = initialize_tools()


# Tool definitions for the Agent (metadata only)
TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "list_directory",
        "description": "List files and folders in a directory. Use this to explore project structure and discover documents. Returns metadata including file sizes and types.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list. Leave empty for current directory. Example: 'sources/' or 'templates/'",
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Include hidden files starting with dot (.) - default is false",
                },
            },
        },
    },
    {
        "type": "function",
        "name": "read_file",
        "description": "Read any file to view its contents. Automatically converts PDFs, Word docs, Excel sheets, and other formats to text. Use this before editing or analyzing documents. Read multiple files in parallel for efficiency.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file. Examples: 'document.txt', 'sources/report.pdf', 'data.xlsx'",
                },
                "max_size": {
                    "type": "integer",
                    "description": "Maximum file size in bytes to read. Unlimited by default.",
                },
            },
            "required": ["file_path"],
        },
    },
    {
        "type": "function",
        "name": "generate_document",
        "description": "Save generated content to a file. Use this after creating or modifying document content. Creates the file if it doesn't exist, overwrites if it does.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The complete document content to save. Can be markdown, plain text, or any text format.",
                },
                "output_file": {
                    "type": "string",
                    "description": "Where to save the file. Examples: 'output/report.md', 'summary.txt', 'docs/guide.md'",
                },
                "create_backup": {
                    "type": "boolean",
                    "description": "Create a backup (.bak) of existing file before overwriting - default is false",
                },
            },
            "required": ["content", "output_file"],
        },
    },
    {
        "type": "function",
        "name": "text_edit",
        "description": "Find and replace exact text in a document. Use for simple text changes like updating names, dates, or fixing typos. To delete text, set replace_with to empty string ''.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Example: 'document.md', 'output/report.txt'",
                },
                "find": {
                    "type": "string",
                    "description": "Exact text to search for. Must match exactly including spaces and punctuation.",
                },
                "replace_with": {
                    "type": "string",
                    "description": "New text to replace with. Use empty string '' to delete the found text.",
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "true = replace ALL occurrences, false = replace only FIRST occurrence (default: false)",
                },
            },
            "required": ["file_path", "find", "replace_with"],
        },
    },
    {
        "type": "function",
        "name": "regex_edit",
        "description": "Advanced find/replace using regex patterns. Use for complex patterns like 'all dates', 'version numbers', or text with wildcards. Supports capture groups with \\1, \\2 in replacement.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Example: 'document.md', 'output/report.txt'",
                },
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern. Examples: '\\d{4}-\\d{2}-\\d{2}' for dates, 'v\\d+\\.\\d+' for versions, 'Chapter \\d+:' for chapters",
                },
                "replacement": {
                    "type": "string",
                    "description": "Replacement text. Use \\1, \\2 for capture groups. Example: 'Version \\1.\\2' or empty string '' to delete matches",
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "true = replace ALL matches, false = replace only FIRST match (default: false)",
                },
                "flags": {
                    "type": "string",
                    "description": "Regex flags as string: 'm' for multiline, 's' for dotall, 'i' for case-insensitive. Default 'ms'. Example: 'msi' for all three",
                },
            },
            "required": ["file_path", "pattern", "replacement"],
        },
    },
    {
        "type": "function",
        "name": "insert_text",
        "description": "Add new text at a specific location without replacing existing content. Use to insert new sections, paragraphs, or content before/after existing text.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Example: 'document.md', 'output/report.txt'",
                },
                "anchor": {
                    "type": "string",
                    "description": "Existing text to use as reference point. The new text will be inserted relative to this. Example: '## Introduction' or 'Chapter 1:'",
                },
                "text": {
                    "type": "string",
                    "description": "New text to insert. Can include newlines for multi-line content. Example: '\\n## New Section\\nContent here\\n'",
                },
                "position": {
                    "type": "string",
                    "description": "Where to insert relative to anchor: 'before' inserts BEFORE the anchor, 'after' inserts AFTER the anchor (default: 'after')",
                    "enum": ["before", "after"],
                },
            },
            "required": ["file_path", "anchor", "text"],
        },
    },
]
