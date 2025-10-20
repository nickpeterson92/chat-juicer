"""
Event handler utilities for Wishgate Agent/Runner streaming.
Handles all streaming event types from OpenAI Agent/Runner pattern.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, cast
from urllib.parse import quote

from core.constants import (
    AGENT_UPDATED_STREAM_EVENT,
    HANDOFF_CALL_ITEM,
    HANDOFF_OUTPUT_ITEM,
    MESSAGE_OUTPUT_ITEM,
    MSG_TYPE_AGENT_UPDATED,
    MSG_TYPE_ASSISTANT_DELTA,
    MSG_TYPE_FUNCTION_COMPLETED,
    MSG_TYPE_FUNCTION_DETECTED,
    MSG_TYPE_HANDOFF_COMPLETED,
    MSG_TYPE_HANDOFF_STARTED,
    REASONING_ITEM,
    RUN_ITEM_STREAM_EVENT,
    TOOL_CALL_ITEM,
    TOOL_CALL_OUTPUT_ITEM,
)
from models.event_models import (
    AgentUpdateMessage,
    AssistantMessage,
    HandoffMessage,
    ToolCallNotification,
    ToolResultNotification,
)
from models.sdk_models import (
    AgentUpdatedStreamEvent,
    ContentLike,
    EventHandler,
    RawHandoffLike,
    RawMessageLike,
    RawToolCallLike,
    RunItem,
    RunItemStreamEvent,
    StreamEvent,
)
from utils.json_utils import json_compact as _json_builder
from utils.logger import logger

FILE_ANNOTATION_TYPES = {
    "container_file_citation",
    "file_citation",
    "file_path",
    "code_interpreter_file",
    "code_interpreter_output",
}


@dataclass
class CallTracker:
    """Tracks tool call IDs for matching outputs with their calls."""

    active_calls: deque[dict[str, str]] = field(default_factory=deque)

    def add_call(self, call_id: str, tool_name: str) -> None:
        """Add a new tool call to track."""
        if call_id:
            self.active_calls.append({"call_id": call_id, "tool_name": tool_name})

    def pop_call(self) -> dict[str, str] | None:
        """Get and remove the oldest tracked call."""
        return self.active_calls.popleft() if self.active_calls else None


def handle_message_output(item: RunItem) -> str | None:
    """Handle message output items (assistant responses)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        combined_segments: list[str] = []

        for content_item in content:
            text = _extract_text_segment(content_item)
            if not text:
                continue

            annotations = _extract_annotations(content_item)
            if annotations:
                text = _rewrite_annotation_links(text, annotations)

            combined_segments.append(text)

        if combined_segments:
            full_message = "\n\n".join(s for s in combined_segments if s)
            if full_message:
                msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=full_message)
                return msg.to_json()  # type: ignore[no-any-return]
    return None


def _extract_text_segment(content_item: Any) -> str:  # noqa: PLR0911
    """Safely extract text content from SDK content variants."""
    if isinstance(content_item, ContentLike):
        if isinstance(content_item.text, str):
            return content_item.text
        # Some SDK objects expose .text.value
        text_obj = getattr(content_item, "text", None)
        value = getattr(text_obj, "value", None)
        if isinstance(value, str):
            return value
    if isinstance(content_item, dict):
        text_value = content_item.get("text")
        if isinstance(text_value, str):
            return text_value
        if isinstance(text_value, dict):
            candidate = text_value.get("value") or text_value.get("text")
            if isinstance(candidate, str):
                return candidate
    text_attr = getattr(content_item, "text", None)
    if isinstance(text_attr, str):
        return text_attr
    if isinstance(text_attr, dict):
        candidate = text_attr.get("value") or text_attr.get("text")
        if isinstance(candidate, str):
            return candidate
    value = getattr(text_attr, "value", None)
    return value if isinstance(value, str) else ""


def _extract_annotations(content_item: Any) -> list[Any]:
    """Extract annotation metadata in a normalized list."""
    annotations = None

    if isinstance(content_item, dict):
        annotations = content_item.get("annotations")
    else:
        annotations = getattr(content_item, "annotations", None)

    if annotations:
        return list(annotations)

    text_attr = getattr(content_item, "text", None)
    if isinstance(text_attr, dict):
        text_annotations = text_attr.get("annotations")
        if text_annotations:
            return list(text_annotations)
    else:
        text_annotations = getattr(text_attr, "annotations", None)
        if text_annotations:
            return list(text_annotations)

    return []


def _annotation_field(annotation: Any, field: str) -> Any:
    """Helper to safely extract a field from annotation variants."""
    if isinstance(annotation, dict):
        return annotation.get(field)
    return getattr(annotation, field, None)


def _rewrite_annotation_links(text: str, annotations: list[Any]) -> str:
    """Replace sandbox download links with internal handler URLs."""
    if not annotations:
        return text

    # Sort annotations by start index to ensure deterministic replacements
    sortable = []
    for ann in annotations:
        start_index = _annotation_field(ann, "start_index")
        end_index = _annotation_field(ann, "end_index")
        if start_index is None or end_index is None:
            continue
        ann_type = _annotation_field(ann, "type")
        if ann_type not in FILE_ANNOTATION_TYPES:
            continue
        raw_file = (
            _annotation_field(ann, "file_id")
            or _annotation_field(ann, "id")
            or _annotation_field(ann, "file")  # Some payloads wrap file metadata
        )
        filename = (
            _annotation_field(ann, "filename") or _annotation_field(ann, "file_name") or _annotation_field(ann, "text")
        )
        container_id = _annotation_field(ann, "container_id")

        # If nested file metadata present, unwrap
        file_id = raw_file
        if isinstance(raw_file, dict):
            filename = filename or raw_file.get("filename") or raw_file.get("name")
            file_id = raw_file.get("id") or raw_file.get("file_id")
        if isinstance(filename, dict):
            filename = filename.get("filename") or filename.get("name")

        if not file_id:
            continue

        sortable.append(
            {
                "start": int(start_index),
                "end": int(end_index),
                "file_id": str(file_id),
                "filename": str(filename) if filename else None,
                "container_id": str(container_id) if container_id else None,
            }
        )

    if not sortable:
        return text

    sortable.sort(key=lambda a: int(a["start"]))  # type: ignore[call-overload]

    result = text
    offset = 0

    for info in sortable:
        start = int(info["start"]) + offset  # type: ignore[call-overload]
        end = int(info["end"]) + offset  # type: ignore[call-overload]
        if start < 0 or end > len(result) or start >= end:
            continue

        file_id = str(info["file_id"])
        filename = str(info["filename"]) if info["filename"] else file_id
        container_id_val = info.get("container_id")
        container_id = str(container_id_val) if container_id_val else None

        params = [("file_id", file_id)]
        if filename:
            params.append(("filename", filename))
        if container_id:
            params.append(("container_id", container_id))

        query = "&".join(f"{key}={quote(str(value))}" for key, value in params if value)
        replacement = f"#download?{query}"

        original_segment = result[start:end]
        if original_segment == replacement:
            continue

        result = result[:start] + replacement + result[end:]
        offset += len(replacement) - (end - start)

    return result


def handle_tool_call(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call items (function invocations) with validation."""
    tool_name = "unknown"
    call_id = ""
    arguments = "{}"

    if hasattr(item, "raw_item"):
        raw = item.raw_item

        if isinstance(raw, RawToolCallLike):
            tool_name = raw.name
            arguments = raw.arguments
            call_id = raw.call_id or (raw.id or "")
        else:
            # Extract tool details
            tool_name = getattr(raw, "name", "unknown")
            arguments = getattr(raw, "arguments", "{}")

            # Get call_id with fallback to id
            call_id = getattr(raw, "call_id", getattr(raw, "id", ""))

        # Track active calls for matching with outputs
        tracker.add_call(call_id, tool_name)

    # Use Pydantic model for validation
    tool_msg = ToolCallNotification(
        type=MSG_TYPE_FUNCTION_DETECTED,
        name=tool_name,
        arguments=arguments,
        call_id=call_id if call_id else None,
    )
    return cast(str, _json_builder(tool_msg.model_dump(exclude_none=True)))


def handle_reasoning(item: RunItem) -> str | None:
    """Handle reasoning items (Sequential Thinking output)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        content = raw.content or [] if isinstance(raw, RawMessageLike) else getattr(raw, "content", []) or []
        for content_item in content:
            if isinstance(content_item, ContentLike):
                text = content_item.text or ""
            else:
                text = getattr(content_item, "text", "")
            if text:
                msg = AssistantMessage(type=MSG_TYPE_ASSISTANT_DELTA, content=f"[Thinking] {text}")
                return msg.to_json()  # type: ignore[no-any-return]
    return None


def handle_tool_output(item: RunItem, tracker: CallTracker) -> str | None:
    """Handle tool call output items (function results) with validation."""
    call_id = ""
    success = True
    tool_name = "unknown"

    # Match output with a call_id from tracker
    call_info = tracker.pop_call()
    if call_info:
        call_id = call_info["call_id"]
        tool_name = call_info.get("tool_name", "unknown")
    else:
        logger.info("Tool output received but no tracked call_id in queue")

    # Get output
    if hasattr(item, "output"):
        output = item.output
        # Convert to string for consistent handling
        output_str = _json_builder(output) if isinstance(output, dict) else str(output)
    else:
        output_str = ""

    # Check for errors
    if hasattr(item, "raw_item") and isinstance(item.raw_item, dict) and item.raw_item.get("error"):
        success = False
        output_str = str(item.raw_item["error"])

    # Use Pydantic model for validation
    result_msg = ToolResultNotification(
        type=MSG_TYPE_FUNCTION_COMPLETED,
        name=tool_name,
        result=output_str,
        call_id=call_id if call_id else None,
        success=success,
    )

    logger.info(f"Function completed: {tool_name} (call_id: {call_id or 'none'}, success: {success})")
    return cast(str, _json_builder(result_msg.model_dump(exclude_none=True)))


def handle_handoff_call(item: RunItem) -> str | None:
    """Handle handoff call items (multi-agent requests)"""
    if hasattr(item, "raw_item"):
        raw = item.raw_item
        target_agent = raw.target or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "target", "unknown")
    else:
        target_agent = "unknown"

    msg = HandoffMessage(type=MSG_TYPE_HANDOFF_STARTED, target_agent=target_agent)
    return msg.to_json()  # type: ignore[no-any-return]


def handle_handoff_output(item: RunItem) -> str | None:
    """Handle handoff output items (multi-agent results)"""
    source_agent = "unknown"

    if hasattr(item, "raw_item"):
        raw = item.raw_item
        source_agent = raw.source or "unknown" if isinstance(raw, RawHandoffLike) else getattr(raw, "source", "unknown")

    # Get output
    output = getattr(item, "output", "")
    output_str = str(output) if output else ""

    msg = HandoffMessage(type=MSG_TYPE_HANDOFF_COMPLETED, source_agent=source_agent, result=output_str)
    return msg.to_json()  # type: ignore[no-any-return]


def build_event_handlers(tracker: CallTracker) -> dict[str, EventHandler]:
    """Create a registry of event handlers keyed by event type.

    Uses closures to capture `tracker` while conforming to EventHandler.
    """

    def handle_run_item_event(event: StreamEvent) -> str | None:
        # Guard by event type, then cast for attribute access
        if getattr(event, "type", None) != RUN_ITEM_STREAM_EVENT:
            return None
        rie = cast(RunItemStreamEvent, event)
        item: RunItem = rie.item

        item_handlers: dict[str, Callable[[], str | None]] = {
            MESSAGE_OUTPUT_ITEM: lambda: handle_message_output(item),
            TOOL_CALL_ITEM: lambda: handle_tool_call(item, tracker),
            REASONING_ITEM: lambda: handle_reasoning(item),
            TOOL_CALL_OUTPUT_ITEM: lambda: handle_tool_output(item, tracker),
            HANDOFF_CALL_ITEM: lambda: handle_handoff_call(item),
            HANDOFF_OUTPUT_ITEM: lambda: handle_handoff_output(item),
        }

        ih = item_handlers.get(item.type)
        return ih() if ih else None

    def handle_agent_updated_event(event: StreamEvent) -> str | None:
        if getattr(event, "type", None) != AGENT_UPDATED_STREAM_EVENT:
            return None
        aue = cast(AgentUpdatedStreamEvent, event)
        msg = AgentUpdateMessage(type=MSG_TYPE_AGENT_UPDATED, name=aue.new_agent.name)
        return msg.to_json()  # type: ignore[no-any-return]

    return {
        RUN_ITEM_STREAM_EVENT: handle_run_item_event,
        AGENT_UPDATED_STREAM_EVENT: handle_agent_updated_event,
    }
