"""Tests for Prometheus metrics module.

Tests metric creation, labeling, and observation.
"""

from __future__ import annotations

from utils.metrics import (
    NAMESPACE,
    db_pool_connections,
    db_pool_size,
    db_query_duration_seconds,
    mcp_servers_available,
    mcp_servers_total,
    mcp_tool_call_duration_seconds,
    mcp_tool_calls_total,
    request_duration_seconds,
    session_tokens_total,
    ws_connections_active,
    ws_connections_total,
    ws_messages_total,
)


class TestMetricsNamespace:
    """Test namespace configuration."""

    def test_namespace_is_chatjuicer(self) -> None:
        """Verify namespace is set correctly."""
        assert NAMESPACE == "chatjuicer"


class TestRequestMetrics:
    """Test HTTP request metrics."""

    def test_request_duration_seconds_exists(self) -> None:
        """Test request duration histogram is defined."""
        assert request_duration_seconds is not None
        # Check it has proper labels
        assert "method" in request_duration_seconds._labelnames
        assert "path" in request_duration_seconds._labelnames
        assert "status" in request_duration_seconds._labelnames

    def test_request_duration_can_observe(self) -> None:
        """Test that we can observe request duration."""
        # Should not raise
        request_duration_seconds.labels(method="GET", path="/test", status="200").observe(0.1)


class TestWebSocketMetrics:
    """Test WebSocket metrics."""

    def test_ws_connections_active_exists(self) -> None:
        """Test active connections gauge is defined."""
        assert ws_connections_active is not None

    def test_ws_connections_total_exists(self) -> None:
        """Test total connections counter is defined."""
        assert ws_connections_total is not None

    def test_ws_messages_total_exists(self) -> None:
        """Test messages counter is defined with direction label."""
        assert ws_messages_total is not None
        assert "direction" in ws_messages_total._labelnames

    def test_ws_messages_can_increment(self) -> None:
        """Test that we can increment message counter."""
        # Should not raise
        ws_messages_total.labels(direction="inbound").inc()
        ws_messages_total.labels(direction="outbound").inc()


class TestDatabaseMetrics:
    """Test database pool metrics."""

    def test_db_pool_size_exists(self) -> None:
        """Test pool size gauge is defined."""
        assert db_pool_size is not None

    def test_db_pool_connections_exists(self) -> None:
        """Test pool connections gauge is defined with state label."""
        assert db_pool_connections is not None
        assert "state" in db_pool_connections._labelnames

    def test_db_query_duration_seconds_exists(self) -> None:
        """Test query duration histogram is defined with query_type label."""
        assert db_query_duration_seconds is not None
        assert "query_type" in db_query_duration_seconds._labelnames

    def test_db_query_duration_can_observe(self) -> None:
        """Test that we can observe query duration."""
        # Should not raise
        db_query_duration_seconds.labels(query_type="select").observe(0.05)
        db_query_duration_seconds.labels(query_type="insert").observe(0.02)


class TestMCPMetrics:
    """Test MCP (Model Context Protocol) metrics."""

    def test_mcp_servers_available_exists(self) -> None:
        """Test available servers gauge is defined."""
        assert mcp_servers_available is not None

    def test_mcp_servers_total_exists(self) -> None:
        """Test total servers gauge is defined."""
        assert mcp_servers_total is not None

    def test_mcp_tool_calls_total_exists(self) -> None:
        """Test tool calls counter is defined with proper labels."""
        assert mcp_tool_calls_total is not None
        assert "tool_name" in mcp_tool_calls_total._labelnames
        assert "status" in mcp_tool_calls_total._labelnames

    def test_mcp_tool_call_duration_seconds_exists(self) -> None:
        """Test tool call duration histogram is defined."""
        assert mcp_tool_call_duration_seconds is not None
        assert "tool_name" in mcp_tool_call_duration_seconds._labelnames

    def test_mcp_tool_calls_can_increment(self) -> None:
        """Test that we can increment tool calls counter."""
        # Should not raise
        mcp_tool_calls_total.labels(tool_name="read_file", status="success").inc()
        mcp_tool_calls_total.labels(tool_name="execute_python_code", status="error").inc()


class TestSessionMetrics:
    """Test session token metrics."""

    def test_session_tokens_total_exists(self) -> None:
        """Test tokens counter is defined with proper labels."""
        assert session_tokens_total is not None
        assert "model" in session_tokens_total._labelnames
        assert "type" in session_tokens_total._labelnames

    def test_session_tokens_can_increment(self) -> None:
        """Test that we can increment tokens counter."""
        # Should not raise
        session_tokens_total.labels(model="gpt-5", type="prompt").inc(100)
        session_tokens_total.labels(model="gpt-5", type="completion").inc(50)
