"""
Chat Juicer - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration

Main entry point - orchestrates application lifecycle through bootstrap and runtime modules.
"""

from __future__ import annotations

import asyncio
import uuid

from contextlib import suppress
from typing import Any

# NOTE: For binary protocol V2, we do NOT wrap stdin in TextIOWrapper
# We need raw binary access via sys.stdin.buffer
# stdout/stderr can remain as text for logging purposes
from app.bootstrap import initialize_application
from app.runtime import (
    ensure_session_exists,
    handle_file_upload,
    handle_session_command_wrapper,
    process_messages,
    send_session_created_event,
)
from integrations.sdk_token_tracker import disconnect_session
from models.event_models import UserInput
from utils.binary_io import BinaryIOError, read_message, write_message
from utils.logger import logger


async def handle_protocol_negotiation(message: dict[str, Any]) -> None:
    """Handle protocol version negotiation.

    Args:
        message: Protocol negotiation request with supported_versions
    """

    supported_versions = message.get("supported_versions", [])
    client_version = message.get("client_version", "unknown")

    logger.info(f"Protocol negotiation: client={client_version}, supported_versions={supported_versions}")

    # We only support V2
    if 2 in supported_versions:
        write_message(
            {
                "type": "protocol_negotiation_response",
                "selected_version": 2,
                "server_version": "1.0.0",  # Chat Juicer version
            }
        )
        logger.info("Protocol negotiation successful: V2 selected")
    else:
        write_message(
            {
                "type": "error",
                "error": f"No compatible protocol version. Server supports V2, client supports {supported_versions}",
            }
        )
        logger.error(f"Protocol negotiation failed: incompatible versions {supported_versions}")


async def main() -> None:
    """Main entry point for Chat Juicer - pure orchestration of application lifecycle.

    Phases:
    1. Bootstrap: Initialize application state (config, clients, MCP servers, session manager)
    2. Main Loop: Process user inputs (chat messages, session commands, file uploads)
    3. Cleanup: Disconnect SDK tracker and close MCP servers gracefully
    """
    # ============================================================================
    # BOOTSTRAP PHASE: Initialize application
    # ============================================================================
    app_state = await initialize_application()

    # ============================================================================
    # MAIN LOOP: Process binary messages
    # ============================================================================
    while True:
        try:
            # Read binary message from stdin (blocking)
            # Reuse pending read task if available (prevents multiple concurrent readers)
            if app_state.pending_read_task is not None and not app_state.pending_read_task.done():
                # Wait for the existing read to complete
                message = await app_state.pending_read_task
                app_state.pending_read_task = None
            elif app_state.pending_read_task is not None and app_state.pending_read_task.done():
                # Retrieve result from completed pending read
                message = app_state.pending_read_task.result()
                app_state.pending_read_task = None
            else:
                # No pending read, create new one
                message = await asyncio.get_event_loop().run_in_executor(None, read_message)

            message_type = message.get("type")
            logger.debug(f"Received message type: {message_type}")

            # ========================================================================
            # Protocol Negotiation
            # ========================================================================
            if message_type == "protocol_negotiation":
                await handle_protocol_negotiation(message)
                continue

            # ========================================================================
            # Stream Interrupt Signal
            # ========================================================================
            if message_type == "interrupt":
                if app_state.active_stream_task and not app_state.active_stream_task.done():
                    logger.info("Interrupt signal received - cancelling active stream task")
                    app_state.active_stream_task.cancel()
                    try:
                        await app_state.active_stream_task
                    except asyncio.CancelledError:
                        logger.debug("Active stream task cancelled successfully")
                else:
                    logger.debug("Interrupt signal received but no active stream task")
                continue

            # ========================================================================
            # Session Management Commands
            # ========================================================================
            if message_type == "session":
                request_id = message.get("request_id") or f"session_{uuid.uuid4().hex[:8]}"
                try:
                    command = message.get("command")
                    params = message.get("params", {})
                    logger.info(f"Processing session command: {command}", extra={"request_id": request_id})
                    result = await handle_session_command_wrapper(app_state, command, params)
                    write_message({"type": "session_response", "data": result, "request_id": request_id})
                    logger.info(f"Session response sent for command: {command}")
                except Exception as e:
                    logger.error(f"Error handling session command: {e}", exc_info=True)
                    write_message({"type": "session_response", "data": {"error": str(e)}, "request_id": request_id})
                continue

            # ========================================================================
            # File Upload Commands
            # ========================================================================
            if message_type == "file_upload":
                request_id = message.get("request_id") or f"upload_{uuid.uuid4().hex[:8]}"
                try:
                    logger.info("Processing file upload command", extra={"request_id": request_id})
                    result = await handle_file_upload(app_state, message)
                    write_message({"type": "upload_response", "data": result, "request_id": request_id})
                    logger.info(f"Upload response sent: {result.get('success')}")
                except Exception as e:
                    logger.error(f"Error handling upload command: {e}", exc_info=True)
                    write_message(
                        {
                            "type": "upload_response",
                            "data": {"success": False, "error": str(e)},
                            "request_id": request_id,
                        }
                    )
                continue

            # ========================================================================
            # Chat Messages (always array format - single or batch)
            # ========================================================================
            if message_type == "message":
                # Extract messages array (unified format)
                messages = message.get("messages", [])

                # Backward compatibility: support legacy single-message format
                if not messages and message.get("content"):
                    messages = [{"content": message.get("content")}]

                if not messages:
                    logger.warning("Empty message received")
                    continue

                # Validate all messages
                from core.constants import LOG_PREVIEW_LENGTH

                validated_messages = []
                for msg in messages:
                    try:
                        content = msg.get("content", "") if isinstance(msg, dict) else str(msg)
                        validated_input = UserInput(content=content)
                        validated_messages.append(validated_input.content)
                    except ValueError:
                        continue

                if not validated_messages:
                    logger.warning("No valid messages")
                    continue

                # Log messages
                for i, msg in enumerate(validated_messages):
                    prefix = f"User[{i + 1}]" if len(validated_messages) > 1 else "User"
                    file_msg = f"{prefix}: {msg[:LOG_PREVIEW_LENGTH]}{'...' if len(msg) > LOG_PREVIEW_LENGTH else ''}"
                    logger.info(f"{prefix}: {msg}", extra={"file_message": file_msg})

                # Ensure session exists (lazy initialization on first message)
                session, is_new_session = await ensure_session_exists(app_state)

                # Process messages (single or batch - handled uniformly)
                # Wrap in task for interrupt support
                app_state.active_stream_task = asyncio.create_task(
                    process_messages(app_state, session, validated_messages)
                )

                # Wait for stream while also checking for interrupt messages
                # Track any message received during streaming that needs processing after
                queued_message: dict[str, Any] | None = None

                try:
                    # Use app_state.pending_read_task to track the reader across loop iterations
                    # This prevents orphaned reads that consume messages
                    loop = asyncio.get_event_loop()
                    if app_state.pending_read_task is None or app_state.pending_read_task.done():
                        read_future = loop.run_in_executor(None, read_message)
                        app_state.pending_read_task = asyncio.ensure_future(read_future)

                    while not app_state.active_stream_task.done():
                        # Wait for EITHER stream to complete OR new message
                        done, _pending = await asyncio.wait(
                            {app_state.active_stream_task, app_state.pending_read_task},
                            return_when=asyncio.FIRST_COMPLETED,
                        )

                        if app_state.pending_read_task in done:
                            # Message arrived while streaming
                            next_message = app_state.pending_read_task.result()
                            app_state.pending_read_task = None  # Clear so we create a new one
                            next_type = next_message.get("type")

                            if next_type == "interrupt":
                                logger.info("Interrupt received during streaming - cancelling")
                                # Set flag BEFORE cancel so runtime.py can detect it
                                app_state.interrupt_requested = True
                                app_state.active_stream_task.cancel()
                                # Send stream_interrupted IMMEDIATELY for instant user feedback
                                write_message({"type": "stream_interrupted"})
                                logger.info("stream_interrupted sent to frontend")
                                task_completed = False
                                try:
                                    # Short timeout - task should respond quickly to cancel
                                    await asyncio.wait_for(app_state.active_stream_task, timeout=0.5)
                                    task_completed = True
                                except asyncio.TimeoutError:
                                    logger.warning("Stream task didn't complete within timeout after cancel")
                                except asyncio.CancelledError:
                                    task_completed = True
                                    logger.debug("Stream task cancelled successfully")
                                # If task timed out, send assistant_end to reset frontend state
                                # (task's finally block hasn't run yet)
                                if not task_completed:
                                    write_message({"type": "assistant_end"})
                                    logger.info("assistant_end sent (task timed out)")
                                break
                            else:
                                # Non-interrupt message during streaming - queue for after stream completes
                                logger.info(f"Queuing {next_type} message received during streaming")
                                queued_message = next_message
                                # Start a new read task for potential interrupt
                                read_future = loop.run_in_executor(None, read_message)
                                app_state.pending_read_task = asyncio.ensure_future(read_future)

                        if app_state.active_stream_task in done:
                            # Stream completed normally
                            # DON'T cancel app_state.pending_read_task - keep it for next main loop iteration
                            # This prevents losing messages that arrive right after stream completes
                            break

                except asyncio.CancelledError:
                    logger.debug("Stream task cancelled - handled in process_messages")
                finally:
                    app_state.active_stream_task = None
                    # Reset interrupt flag after task completes
                    app_state.interrupt_requested = False

                # Send session creation event AFTER processing completes
                if is_new_session:
                    send_session_created_event(app_state, session.session_id)

                # Process any message that was queued during streaming
                if queued_message:
                    queued_type = queued_message.get("type")
                    logger.info(f"Processing queued {queued_type} message")
                    if queued_type == "message":
                        # Process the queued chat message
                        queued_msgs = queued_message.get("messages", [])
                        if not queued_msgs and queued_message.get("content"):
                            queued_msgs = [{"content": queued_message.get("content")}]
                        if queued_msgs:
                            validated_queued = []
                            for qmsg in queued_msgs:
                                try:
                                    content = qmsg.get("content", "") if isinstance(qmsg, dict) else str(qmsg)
                                    validated_input = UserInput(content=content)
                                    validated_queued.append(validated_input.content)
                                except ValueError:
                                    continue
                            if validated_queued:
                                logger.info(f"Processing queued message: {validated_queued[0][:50]}...")
                                # Process with existing session (no need to ensure_session_exists again)
                                app_state.active_stream_task = asyncio.create_task(
                                    process_messages(app_state, session, validated_queued)
                                )
                                # Simple wait for queued message (no interrupt support for simplicity)
                                await app_state.active_stream_task
                                app_state.active_stream_task = None
                    else:
                        logger.warning(f"Queued message type {queued_type} not supported, discarding")
                continue

            # ========================================================================
            # Unknown Message Type
            # ========================================================================
            logger.warning(f"Unknown message type: {message_type}")
            write_message({"type": "error", "error": f"Unknown message type: {message_type}"})

        except EOFError:
            logger.info("End of input stream, shutting down")
            break
        except BinaryIOError as e:
            logger.error(f"Binary I/O error: {e}")
            # Try to send error response
            with suppress(Exception):
                write_message({"type": "error", "error": str(e)})
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
            break
        except Exception as e:
            # This should rarely happen since process_user_input handles errors
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            with suppress(Exception):
                write_message({"type": "error", "error": "An unexpected error occurred."})

    # ============================================================================
    # CLEANUP PHASE: Shutdown gracefully
    # ============================================================================

    # Disconnect SDK token tracker
    disconnect_session()

    # Clean up MCP servers
    for server in app_state.mcp_servers.values():
        try:
            # Use asyncio.wait_for with a timeout to prevent hanging
            await asyncio.wait_for(server.__aexit__(None, None, None), timeout=2.0)
        except asyncio.TimeoutError:
            logger.warning("Timeout while closing MCP server")
        except asyncio.CancelledError:
            logger.warning("MCP server cleanup cancelled")
        except Exception as e:
            logger.warning(f"Error closing MCP server: {e}")

    logger.info("Chat Juicer shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
