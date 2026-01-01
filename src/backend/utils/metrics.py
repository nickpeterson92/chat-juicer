"""
Prometheus metrics configuration for Chat Juicer.

Defines custom metrics and instrumentation logic.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

# ============================================================================
# Request Metrics (Handled by Instrumentator, but we add custom ones)
# ============================================================================

# Use standard Prometheus naming conventions: namespace_subsystem_name_unit
NAMESPACE = "chatjuicer"

request_duration_seconds = Histogram(
    f"{NAMESPACE}_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path", "status"],
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0),
)


# ============================================================================
# WebSocket Metrics
# ============================================================================

ws_connections_active = Gauge(
    f"{NAMESPACE}_websocket_connections_active",
    "Number of currently active WebSocket connections",
)

ws_connections_total = Counter(
    f"{NAMESPACE}_websocket_connections_total",
    "Total number of WebSocket connections accepted",
)

ws_messages_total = Counter(
    f"{NAMESPACE}_websocket_messages_total",
    "Total number of WebSocket messages processed",
    ["direction"],  # "inbound" or "outbound"
)


# ============================================================================
# Database Metrics
# ============================================================================

db_pool_size = Gauge(
    f"{NAMESPACE}_db_pool_models",
    "Current size of the database connection pool",
)

db_pool_connections = Gauge(
    f"{NAMESPACE}_db_pool_connections",
    "Number of database connections by state",
    ["state"],  # "free" or "used"
)

db_query_duration_seconds = Histogram(
    f"{NAMESPACE}_db_query_duration_seconds",
    "Database query duration in seconds",
    ["query_type"],  # "select", "insert", "update", "delete"
    buckets=(0.01, 0.05, 0.1, 0.5, 1.0, 5.0),
)


# ============================================================================
# MCP (Model Context Protocol) Metrics
# ============================================================================

mcp_servers_available = Gauge(
    f"{NAMESPACE}_mcp_servers_available",
    "Number of available MCP servers in the pool",
)

mcp_servers_total = Gauge(
    f"{NAMESPACE}_mcp_servers_total",
    "Total number of MCP servers in the pool",
)

mcp_tool_calls_total = Counter(
    f"{NAMESPACE}_mcp_tool_calls_total",
    "Total number of MCP tool calls executed",
    ["tool_name", "status"],  # status: "success", "error"
)

mcp_tool_call_duration_seconds = Histogram(
    f"{NAMESPACE}_mcp_tool_call_duration_seconds",
    "MCP tool call execution duration in seconds",
    ["tool_name"],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)


# ============================================================================
# Session Metrics
# ============================================================================

session_tokens_total = Counter(
    f"{NAMESPACE}_session_tokens_total",
    "Total tokens consumed by sessions",
    ["model", "type"],  # type values: "prompt", "completion"
)
