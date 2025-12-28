"""Tests for MCP Pydantic models.

Tests MCPTool and MCPResult models for SDK compatibility.
"""

from __future__ import annotations

from models.mcp_models import MCPResult, MCPTool


class TestMCPTool:
    """Tests for MCPTool model."""

    def test_minimal_tool(self) -> None:
        """Test creating tool with only required fields."""
        tool = MCPTool(name="test_tool")

        assert tool.name == "test_tool"
        assert tool.description is None
        assert tool.inputSchema == {}

    def test_full_tool(self) -> None:
        """Test creating tool with all fields."""
        tool = MCPTool(
            name="search",
            description="Search the web for information",
            inputSchema={
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Search query"}},
                "required": ["query"],
            },
        )

        assert tool.name == "search"
        assert tool.description == "Search the web for information"
        assert tool.inputSchema["type"] == "object"
        assert "query" in tool.inputSchema["properties"]

    def test_extra_fields_allowed(self) -> None:
        """Test that extra fields are allowed (SDK compatibility)."""
        tool = MCPTool(name="test", extra_field="some_value", another_extra=123)

        assert tool.name == "test"
        assert tool.extra_field == "some_value"
        assert tool.another_extra == 123

    def test_tool_from_dict(self) -> None:
        """Test creating tool from dictionary (common MCP pattern)."""
        data = {"name": "fetch", "description": "Fetch URL content", "inputSchema": {"type": "object"}}

        tool = MCPTool(**data)

        assert tool.name == "fetch"
        assert tool.description == "Fetch URL content"


class TestMCPResult:
    """Tests for MCPResult model."""

    def test_empty_result(self) -> None:
        """Test creating result with defaults."""
        result = MCPResult()

        assert result.content == []
        assert result.isError is False

    def test_result_with_content_list(self) -> None:
        """Test result with content array."""
        result = MCPResult(content=[{"type": "text", "text": "Hello, World!"}])

        assert len(result.content) == 1
        assert result.content[0]["text"] == "Hello, World!"
        assert result.isError is False

    def test_result_with_error(self) -> None:
        """Test error result."""
        result = MCPResult(content=[{"type": "text", "text": "Error occurred"}], isError=True)

        assert result.isError is True

    def test_structured_content_alias(self) -> None:
        """Test structuredContent alias for SDK compatibility."""
        result = MCPResult(structuredContent=[{"type": "text", "text": "Via alias"}])

        # Both should work
        assert result.content == [{"type": "text", "text": "Via alias"}]
        assert result.structuredContent == [{"type": "text", "text": "Via alias"}]

    def test_structured_content_property(self) -> None:
        """Test structuredContent property access."""
        result = MCPResult(content=[{"type": "resource", "uri": "file://test.txt"}])

        # Property should return content
        assert result.structuredContent == result.content

    def test_extra_fields_allowed(self) -> None:
        """Test that extra fields are allowed (SDK compatibility)."""
        result = MCPResult(content=[], unknown_field="value")

        assert result.unknown_field == "value"

    def test_result_from_server_response(self) -> None:
        """Test creating result from typical MCP server response."""
        # Typical MCP server response format
        server_response = {
            "content": [{"type": "text", "text": "Line 1"}, {"type": "text", "text": "Line 2"}],
            "isError": False,
        }

        result = MCPResult(**server_response)

        assert len(result.content) == 2
        assert result.isError is False

    def test_result_string_content(self) -> None:
        """Test result with string content (alternative format)."""
        result = MCPResult(content="Plain string content")

        assert result.content == "Plain string content"
        assert result.isError is False
