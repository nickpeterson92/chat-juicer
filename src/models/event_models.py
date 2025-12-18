"""
IPC event models for Chat Juicer.
Provides validation for messages sent between Electron and Python backend.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from core.constants import (
    MSG_TYPE_ERROR,
    MSG_TYPE_FUNCTION_COMPLETED,
    MSG_TYPE_FUNCTION_DETECTED,
)
from models.session_models import ContentItem


class ErrorNotification(BaseModel):
    """Error notification to frontend - used in send_error()."""

    type: Literal["error"] = MSG_TYPE_ERROR
    message: str
    code: str | None = None  # e.g., "rate_limit", "api_error"
    details: dict[str, Any] | None = None


class ToolCallNotification(BaseModel):
    """Tool call notification used in handle_tool_call()."""

    type: str = Field(default=MSG_TYPE_FUNCTION_DETECTED)
    tool_name: str
    tool_arguments: str | dict[str, Any]  # Can be JSON string or dict
    tool_call_id: str | None = None


class ToolResultNotification(BaseModel):
    """Tool result notification used in handle_tool_output()."""

    type: str = Field(default=MSG_TYPE_FUNCTION_COMPLETED)
    tool_name: str
    tool_result: str | dict[str, Any]  # Tool response (JSON string or dict)
    tool_call_id: str | None = None
    tool_success: bool = True


class AssistantMessage(BaseModel):
    """Assistant message streamed to frontend."""

    type: Literal["assistant_delta", "assistant_start", "assistant_end"]
    content: str | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class HandoffMessage(BaseModel):
    """Multi-agent handoff messages."""

    type: Literal["handoff_started", "handoff_completed"]
    target_agent: str | None = None  # For handoff_started
    source_agent: str | None = None  # For handoff_completed
    result: str | None = None  # For handoff_completed

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class AgentUpdateMessage(BaseModel):
    """Agent state update message."""

    type: Literal["agent_updated"]
    name: str

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class FunctionEventMessage(BaseModel):
    """Function execution event for frontend display."""

    type: Literal["function_started", "function_completed"]
    tool_call_id: str
    tool_success: bool = True
    error: str | None = None
    output: str | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class SessionItem(BaseModel):
    """Base model for session conversation items."""

    role: Literal["user", "assistant", "system", "tool", "unknown"] | None = Field(
        default="unknown", description="Role of the message sender"
    )
    content: str | list[ContentItem] | None = Field(default=None, description="Content of the message")
    type: str | None = Field(default=None, description="Type of the item (for SDK internal items)")

    @field_validator("content")
    @classmethod
    def normalize_content(cls, v: Any) -> Any:
        """Ensure content is in a usable format."""
        if v is None or v == "":
            return None
        return v

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for session storage."""
        return self.model_dump(exclude_none=True)


class FunctionCallItem(BaseModel):
    """Model for function call items."""

    type: Literal["function_call"]
    name: str
    arguments: str | dict[str, Any] = Field(default="{}")

    def to_session_item(self) -> SessionItem:
        """Convert to SessionItem format."""
        return SessionItem(
            role="assistant", content=f"[Called tool: {self.name} with arguments: {self.arguments}]", type=self.type
        )


class FunctionOutputItem(BaseModel):
    """Model for function output items."""

    type: Literal["function_call_output"]
    output: str  # Tool output is always converted to string for display
    error: str | None = None

    def to_session_item(self) -> SessionItem:
        """Convert to SessionItem format."""
        content = f"[Tool result: {self.output}]" if not self.error else f"[Tool error: {self.error}]"
        return SessionItem(role="assistant", content=content, type=self.type)


class UserInput(BaseModel):
    """Model for validating user input."""

    content: str = Field(min_length=1, max_length=100000)

    @field_validator("content")
    @classmethod
    def clean_content(cls, v: Any) -> str:
        """Strip whitespace and validate."""
        cleaned: str = v.strip()
        if not cleaned:
            raise ValueError("Input cannot be empty")
        return cleaned


class FunctionArgumentsDeltaMessage(BaseModel):
    """Function call arguments streaming - incremental JSON chunks."""

    type: Literal["function_call_arguments_delta"]
    tool_call_id: str
    delta: str  # JSON chunk to append
    output_index: int | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class FunctionArgumentsDoneMessage(BaseModel):
    """Function call arguments complete - signals finalization."""

    type: Literal["function_call_arguments_done"]
    tool_call_id: str
    output_index: int | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class ReasoningDeltaMessage(BaseModel):
    """Reasoning text streaming for reasoning models (backend only, no frontend display yet)."""

    type: Literal["reasoning_delta"]
    delta: str
    reasoning_index: int | None = None
    output_index: int | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class ReasoningSummaryDeltaMessage(BaseModel):
    """Reasoning summary streaming (backend only)."""

    type: Literal["reasoning_summary_delta"]
    delta: str
    output_index: int | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class RefusalDeltaMessage(BaseModel):
    """Model refusal streaming."""

    type: Literal["refusal_delta"]
    delta: str
    content_index: int | None = None
    output_index: int | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


class ContentPartMessage(BaseModel):
    """Content part boundary events."""

    type: Literal["content_part_added", "content_part_done"]
    content_index: int
    output_index: int
    part_type: str | None = None

    def to_json(self) -> str:
        """Convert to JSON for IPC."""
        json_str: str = self.model_dump_json(exclude_none=True)
        return json_str


__all__ = [
    "AgentUpdateMessage",
    "AssistantMessage",
    "ContentPartMessage",
    "ErrorNotification",
    "FunctionArgumentsDeltaMessage",
    "FunctionArgumentsDoneMessage",
    "FunctionCallItem",
    "FunctionEventMessage",
    "FunctionOutputItem",
    "HandoffMessage",
    "ReasoningDeltaMessage",
    "ReasoningSummaryDeltaMessage",
    "RefusalDeltaMessage",
    "SessionItem",
    "ToolCallNotification",
    "ToolResultNotification",
    "UserInput",
]
