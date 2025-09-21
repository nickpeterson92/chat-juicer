"""
Monkey patch for ALL tools (MCP and native) to add delays after tool calls to mitigate race conditions
"""

from __future__ import annotations

import asyncio

from typing import Any

from agents.mcp.server import _MCPServerWithClientSession
from agents.tool import FunctionTool
from mcp.types import CallToolResult

from constants import MCP_TOOL_DELAY, NATIVE_TOOL_DELAY
from logger import logger

# Store the original MCP method before patching
_original_mcp_call_tool = _MCPServerWithClientSession.call_tool


async def patched_mcp_call_tool(self, tool_name: str, arguments: dict[str, Any] | None) -> CallToolResult:
    """
    Patched version of MCP call_tool that adds a small delay after execution
    to help mitigate RS_/FC_ race conditions in streaming.

    The delay is configured in constants.py (MCP_TOOL_DELAY).
    Set to 0 to disable the delay.
    """
    # Call the original method
    result = await _original_mcp_call_tool(self, tool_name, arguments)

    # Add a small delay to avoid race conditions (if configured)
    if MCP_TOOL_DELAY > 0:
        logger.debug(f"Adding {MCP_TOOL_DELAY}s delay after MCP tool call: {tool_name}")
        await asyncio.sleep(MCP_TOOL_DELAY)

    return result


def create_delayed_wrapper(original_func, tool_name):
    """Create a wrapper that adds delay after the original function executes"""

    async def delayed_wrapper(ctx, input_str):
        # Call the original function
        result = await original_func(ctx, input_str)

        # Add a small delay to avoid race conditions (if configured)
        if NATIVE_TOOL_DELAY > 0:
            logger.debug(f"Adding {NATIVE_TOOL_DELAY}s delay after native tool call: {tool_name}")
            await asyncio.sleep(NATIVE_TOOL_DELAY)

        return result

    return delayed_wrapper


def apply_tool_patch():
    """Apply the monkey patch to MCP servers. Native tool patching happens separately."""

    # Report status for MCP patch
    if MCP_TOOL_DELAY > 0:
        logger.info(f"Applying MCP tool call mitigation patch (delay: {MCP_TOOL_DELAY}s)")
        logger.info("Set MCP_TOOL_DELAY to 0 in constants.py to disable")
    else:
        logger.info("MCP tool call mitigation patch disabled (MCP_TOOL_DELAY=0)")

    # Patch MCP server tools using setattr to avoid mypy error
    _MCPServerWithClientSession.call_tool = patched_mcp_call_tool


def patch_native_tools(tools):
    """
    Patch native function tools to add delays.
    This must be called AFTER the tools are created.

    Args:
        tools: List of FunctionTool instances to patch

    Returns:
        The same list with patched on_invoke_tool methods
    """
    if NATIVE_TOOL_DELAY > 0:
        logger.info(f"Patching {len(tools)} native function tools (delay: {NATIVE_TOOL_DELAY}s)")

        for tool in tools:
            if isinstance(tool, FunctionTool):
                # Wrap the existing on_invoke_tool with our delay wrapper
                original_func = tool.on_invoke_tool
                tool.on_invoke_tool = create_delayed_wrapper(original_func, tool.name)

    return tools
