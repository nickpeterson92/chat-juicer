"""
Tools Module - Function Calling Capabilities for Wishgate Agent
===================================================================

Provides function calling tools for document generation, file operations, and text editing.
All tools are wrapped with the Agent/Runner framework's function_tool decorator for
automatic schema extraction and validation.

Modules:
    document_generation: Generate and save documentation to output files
    file_operations: List directories and read files (multi-format support)
    text_editing: Text manipulation (exact match, regex, insert operations)
    registry: Tool registration and schema definitions for Agent/Runner

Tool Architecture:

The module uses a dual-layer design:

1. **AGENT_TOOLS**: Wrapped tools for Agent/Runner framework
   - Created via function_tool() decorator from agents SDK
   - Automatic schema extraction from type hints and docstrings
   - Used by Agent for automatic tool orchestration

2. **FUNCTION_REGISTRY**: Direct callable references
   - Maps tool names to actual function implementations
   - Supports both sync and async functions
   - Used for direct execution if needed

3. **TOOLS**: Metadata-only definitions for documentation
   - OpenAI function calling schema format
   - Human-readable descriptions and parameter guidance
   - Not used at runtime (schemas come from function_tool)

Available Tools:

File Operations:
    - list_directory: Explore project structure with metadata (size, modified time)
    - read_file: Read any file format (auto-converts PDF, Word, Excel, HTML, etc.)

Document Generation:
    - generate_document: Save generated content to output files with optional backup

Text Editing:
    - text_edit: Find and replace exact text or delete content
    - regex_edit: Pattern-based editing with regex support
    - insert_text: Add new content before or after existing text

All tools return JSON strings using Pydantic response models for type safety.

Example:
    Using tools with the Agent::

        from tools import AGENT_TOOLS, FUNCTION_REGISTRY
        from core.agent import create_agent

        # Create agent with all tools
        agent = create_agent(
            deployment="gpt-5-mini",
            instructions=SYSTEM_INSTRUCTIONS,
            tools=AGENT_TOOLS,  # Wrapped tools for Agent
            mcp_servers=[]
        )

        # Agent automatically orchestrates tool calls during streaming

    Direct tool execution::

        from tools import list_directory, read_file, generate_document

        # List templates directory
        result = await list_directory(path="templates/")

        # Read source file (auto-converts to markdown)
        content = await read_file(file_path="sources/report.pdf")

        # Generate document
        output = await generate_document(
            content="# My Document\\n\\nContent here",
            output_file="output/doc.md",
            create_backup=True
        )

See Also:
    :mod:`core.agent`: Agent creation with tools
    :mod:`models.api_models`: Response models for tool outputs
"""

from tools.document_generation import generate_document
from tools.file_operations import list_directory, read_file
from tools.registry import AGENT_TOOLS, FUNCTION_REGISTRY, TOOLS
from tools.text_editing import insert_text, regex_edit, text_edit

__all__ = [
    "AGENT_TOOLS",
    "FUNCTION_REGISTRY",
    "TOOLS",
    "generate_document",
    "insert_text",
    "list_directory",
    "read_file",
    "regex_edit",
    "text_edit",
]
