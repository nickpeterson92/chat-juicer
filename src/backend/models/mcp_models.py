"""
Pydantic models for MCP (Model Context Protocol).

These models provide type safety and SDK compatibility for:
- Tool definitions (MCPTool)
- Tool execution results (MCPResult)

They replace the ad-hoc SDKObject wrapper to ensure better validation
and maintainability while satisfying the agents SDK requirements.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MCPTool(BaseModel):
    """Model for an MCP tool definition.

    Represents a tool available on an MCP server.
    Used by the agents SDK to discover available capabilities.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    name: str
    description: str | None = None
    inputSchema: dict[str, Any] = Field(default_factory=dict)


class MCPResult(BaseModel):
    """Model for an MCP tool execution result.

    Represents the output of a tool call.
    SDK Compatibility: 'content' is aliased to 'structuredContent' to satisfy
    openai-agents SDK expectations for tool results.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    content: list[dict[str, Any]] | str | Any = Field(default_factory=list, alias="structuredContent")
    isError: bool = False

    @property
    def structuredContent(self) -> Any:
        """Alias for content to satisfy SDK requirements."""
        return self.content
