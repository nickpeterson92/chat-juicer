"""
Integrations Module - External System Integrations
===================================================

Provides integrations with external systems including MCP servers, SDK-level token
tracking, and event stream handlers for the Agent/Runner framework.

Modules:
    mcp_servers: MCP (Model Context Protocol) server setup and management
    sdk_token_tracker: Universal token tracking via SDK monkey-patching
    event_handlers: Streaming event handlers for Agent/Runner events

Key Components:

MCP Servers (mcp_servers.py):
    Manages Model Context Protocol servers for extended capabilities:
    - Sequential Thinking: Advanced reasoning with revision and branching
    - Server lifecycle: Initialization, health checks, graceful shutdown
    - Process management: Runs as subprocesses via npx

    Configuration:
    - Uses MCPServerStdio for stdin/stdout communication
    - Automatic tool discovery from MCP server capabilities
    - Configurable server list for different environments

SDK Token Tracker (sdk_token_tracker.py):
    Universal token tracking for all tool calls:
    - Monkey-patches SDK streaming at source for automatic tracking
    - Works with native tools, MCP servers, and future agents
    - Zero overhead when disabled (conditional patching)
    - Tracks input/output tokens separately by source type

    Sources tracked:
    - tool_call: Native function calls
    - tool_output: Function results
    - reasoning: Sequential Thinking steps
    - handoff: Agent handoffs (future)

Event Handlers (event_handlers.py):
    Processes Agent/Runner streaming events for IPC:
    - message_output_item: AI responses
    - tool_call_item: Function call detection
    - tool_call_output_item: Function results
    - reasoning_item: Sequential Thinking steps
    - handoff_item: Agent-to-agent transfers

    Features:
    - Real-time streaming to Electron frontend
    - Token usage tracking and updates
    - Function call state management
    - Error handling and recovery

Architecture Benefits:

MCP Integration:
    - Extends Agent capabilities without modifying core code
    - Pluggable architecture for new MCP servers
    - Isolated failure domains (MCP server crash doesn't affect Agent)

SDK Token Tracking:
    - Single source of truth for token counts
    - Works automatically with any tool (native, MCP, future)
    - Elegant monkey-patching without SDK modifications

Event Processing:
    - Structured handling of all Agent/Runner event types
    - Consistent IPC message format for frontend
    - Type-safe event processing with Pydantic models

Example:
    Setting up MCP servers::

        from integrations.mcp_servers import setup_mcp_servers

        # Initialize MCP servers (Sequential Thinking, etc.)
        servers = await setup_mcp_servers()

        # Use with Agent
        agent = create_agent(
            deployment="gpt-5-mini",
            instructions=SYSTEM_INSTRUCTIONS,
            tools=AGENT_TOOLS,
            mcp_servers=servers  # MCP tools auto-discovered
        )

    Enabling SDK token tracking::

        from integrations.sdk_token_tracker import enable_sdk_token_tracking
        from core.session import TokenAwareSQLiteSession

        session = TokenAwareSQLiteSession(...)
        enable_sdk_token_tracking(session)

        # Now all tool calls automatically update session tokens

    Processing streaming events::

        from integrations.event_handlers import (
            handle_message_output_item,
            handle_tool_call_item,
            handle_tool_call_output_item
        )

        async for event in Runner.run_streamed(...):
            if event.event_type == "run_item_stream_event":
                item = event.run_item
                if item.type == "message_output_item":
                    handle_message_output_item(item)
                elif item.type == "tool_call_item":
                    handle_tool_call_item(item, call_tracker, ipc)
                # ... etc

See Also:
    :mod:`core.agent`: Agent creation with MCP servers
    :mod:`core.session`: Token-aware session management
    :mod:`models.event_models`: Event message models for IPC
"""
