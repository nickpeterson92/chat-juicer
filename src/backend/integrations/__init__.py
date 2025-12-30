"""
Integrations Module - External System Integrations
===================================================

Provides integrations with external systems including MCP servers, SDK-level token
tracking, and event stream handlers for the Agent/Runner framework.

Modules:
    mcp_manager: Singleton MCP server manager with WebSocket multiplexing
    mcp_registry: MCP server registration and discovery
    sdk_token_tracker: Universal token tracking via SDK monkey-patching
    event_handlers: Streaming event handlers for Agent/Runner events

Key Components:

MCP Server Manager (mcp_manager.py):
    Manages singleton MCP client connections with WebSocket multiplexing:
    - Single connection per server type handles concurrent requests
    - No pooling needed due to WebSocket protocol multiplexing
    - Clean startup/shutdown lifecycle management

MCP Registry (mcp_registry.py):
    MCP server configuration and discovery:
    - Sequential Thinking: Advanced reasoning with revision and branching
    - Fetch: Web content retrieval
    - Tavily: Search capabilities (optional)

SDK Token Tracker (sdk_token_tracker.py):
    Universal token tracking for all tool calls:
    - Monkey-patches SDK streaming at source for automatic tracking
    - Works with native tools, MCP servers, and future agents
    - Zero overhead when disabled (conditional patching)
    - Tracks input/output tokens separately by source type

Event Handlers (event_handlers.py):
    Processes Agent/Runner streaming events:
    - message_output_item: AI responses
    - tool_call_item: Function call detection
    - tool_call_output_item: Function results
    - reasoning_item: Sequential Thinking steps

Example:
    Using MCP server manager:

        from integrations.mcp_manager import MCPServerManager

        manager = MCPServerManager()
        await manager.initialize(["sequential", "fetch"])

        async with manager.acquire_servers(["sequential"]) as servers:
            # Use servers for agent run
            pass

    Processing streaming events:

        from integrations.event_handlers import build_event_handlers

        handlers = build_event_handlers(session_id, ws_manager, call_tracker)
        async for event in Runner.run_streamed(...):
            await handlers.handle(event)

See Also:
    :mod:`api.services.chat_service`: Chat orchestration using MCP manager
    :mod:`core.agent`: Agent creation with MCP servers
"""
