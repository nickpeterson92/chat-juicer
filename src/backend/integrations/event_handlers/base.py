"""
Base types, protocols, and state tracking for event handlers.

This module provides the foundational components used across all event handler modules:
- CallTracker: State management for parallel tool call tracking
- ResponseEventData: Protocol for SDK event data
- Common type aliases and constants
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class ResponseEventData(Protocol):
    """Protocol for SDK event data with common attributes."""

    type: str
    delta: str | None


@dataclass
class CallTracker:
    """Tracks tool call IDs for matching outputs with their calls.

    Uses dict for O(1) lookup and proper parallel tool call support.
    The old deque-based FIFO approach broke when tools completed out-of-order.
    """

    active_calls: dict[str, str] = field(default_factory=dict)  # {call_id: tool_name}

    def add_call(self, call_id: str, tool_name: str) -> None:
        """Add a new tool call to track."""
        if call_id and call_id not in self.active_calls:
            self.active_calls[call_id] = tool_name

    def has_call(self, call_id: str) -> bool:
        """Check if a call_id is being tracked. O(1) dict lookup."""
        return call_id in self.active_calls

    def pop_call_by_id(self, call_id: str) -> dict[str, str] | None:
        """Remove and return call info by specific call_id (parallel-safe)."""
        if call_id in self.active_calls:
            tool_name = self.active_calls.pop(call_id)
            return {"call_id": call_id, "tool_name": tool_name}
        return None

    def drain_all(self) -> list[dict[str, str]]:
        """Drain all remaining calls (for interrupt handling with synthetic completions)."""
        result = [{"call_id": cid, "tool_name": name} for cid, name in self.active_calls.items()]
        self.active_calls.clear()
        return result

    def __len__(self) -> int:
        """Return number of active calls."""
        return len(self.active_calls)
