"""
Tool registry for Chat Juicer Agent.
Defines all available tools and their metadata for the Agent/Runner framework.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from tools.code_interpreter import execute_python_code
from tools.document_generation import generate_document
from tools.file_operations import list_directory, read_file, search_files
from tools.text_editing import edit_file

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
        from agents import function_tool  # - Lazy import for Agent/Runner pattern

        # Wrap existing functions as Agent tools
        list_directory_tool = function_tool(list_directory)
        read_file_tool = function_tool(read_file)
        search_files_tool = function_tool(search_files)
        generate_document_tool = function_tool(generate_document)
        edit_file_tool = function_tool(edit_file)
        execute_python_code_tool = function_tool(execute_python_code)

        # List of tools for Agent
        agent_tools = [
            list_directory_tool,
            read_file_tool,
            search_files_tool,
            generate_document_tool,
            edit_file_tool,
            execute_python_code_tool,
        ]

        # Function registry for direct execution
        function_registry = {
            "list_directory": list_directory,
            "read_file": read_file,
            "search_files": search_files,
            "generate_document": generate_document,
            "edit_file": edit_file,
            "execute_python_code": execute_python_code,
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
        "description": "Read any file to view its contents. Automatically converts PDFs, Word docs, Excel sheets, and other formats to text. Use this before editing or analyzing documents. Read multiple files in parallel for efficiency. Protected with 100MB size limit. Supports partial reads with head/tail for previewing large files.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the file. Examples: 'document.txt', 'sources/report.pdf', 'data.xlsx'",
                },
                "head": {
                    "type": "integer",
                    "description": "Read only first N lines (raw text only, skips format conversion). Useful for previewing large files.",
                },
                "tail": {
                    "type": "integer",
                    "description": "Read only last N lines (raw text only, skips format conversion). Useful for checking file endings or logs.",
                },
            },
            "required": ["file_path"],
        },
    },
    {
        "type": "function",
        "name": "search_files",
        "description": "Search for files matching a glob pattern. Use to find files by name or extension across directory trees. Supports wildcards (* and ?) and recursive search. Returns up to 100 results by default.",
        "parameters": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match. Examples: '*.md' (all markdown), '**/*.py' (all Python files recursively), 'report_*.txt' (reports with any suffix)",
                },
                "base_path": {
                    "type": "string",
                    "description": "Directory to start search from. Default is current directory ('.'). Examples: 'sources/', 'output/', 'data/processed/'",
                },
                "recursive": {
                    "type": "boolean",
                    "description": "Search subdirectories recursively - default is true. Set to false for single-level search.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return - default is 100. Prevents resource exhaustion on large searches.",
                },
            },
            "required": ["pattern"],
        },
    },
    {
        "type": "function",
        "name": "generate_document",
        "description": "Save generated content to the output directory. Files are automatically saved to 'output/' within the current session. Use this after creating or modifying document content.",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The complete document content to save. Can be markdown, plain text, or any text format.",
                },
                "filename": {
                    "type": "string",
                    "description": "Filename and optional subdirectories within output/. Examples: 'report.md', 'reports/quarterly.md', 'drafts/working.md'",
                },
                "create_backup": {
                    "type": "boolean",
                    "description": "Create a backup (.backup) of existing file before overwriting - default is false",
                },
            },
            "required": ["content", "filename"],
        },
    },
    {
        "type": "function",
        "name": "edit_file",
        "description": "Make line-based edits to a text file. Each edit replaces exact line sequences with new content. Returns a git-style diff showing the changes made. Supports batch operations and whitespace-flexible matching. For consistency with generate_document, paths are auto-prefixed with output/ unless they start with output/, sources/, templates/, or are absolute paths.",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file to edit. Auto-prepends output/ unless path starts with output/, sources/, templates/, or is absolute. Examples: 'report.md' → 'output/report.md', 'output/report.txt' (no prepend), 'sources/data.txt' (no prepend).",
                },
                "edits": {
                    "type": "array",
                    "description": "Array of edit operations to apply sequentially. Each edit specifies oldText to find and newText to replace it with.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "oldText": {
                                "type": "string",
                                "description": "Exact text to search for and replace. Uses whitespace-flexible matching (tries exact first, then normalized).",
                            },
                            "newText": {
                                "type": "string",
                                "description": "New text to replace with. Use empty string '' to delete the oldText.",
                            },
                        },
                        "required": ["oldText", "newText"],
                    },
                },
            },
            "required": ["file_path", "edits"],
        },
    },
    {
        "type": "function",
        "name": "execute_python_code",
        "description": """Execute Python code in a secure sandbox environment.

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
be collected and persisted alongside other generated documents.""",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute",
                },
            },
            "required": ["code"],
        },
    },
]
