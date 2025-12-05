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
    process_user_input,
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
            # Chat Messages
            # ========================================================================
            if message_type == "message":
                # Extract content from message
                user_input = message.get("content", "")

                # Validate user input with Pydantic
                try:
                    validated_input = UserInput(content=user_input)
                    user_input = validated_input.content
                except ValueError:
                    # Skip invalid input (empty after stripping)
                    continue

                # Log user input
                from core.constants import LOG_PREVIEW_LENGTH

                file_msg = (
                    f"User: {user_input[:LOG_PREVIEW_LENGTH]}{'...' if len(user_input) > LOG_PREVIEW_LENGTH else ''}"
                )
                logger.info(f"User: {user_input}", extra={"file_message": file_msg})

                # Ensure session exists (lazy initialization on first message)
                session, is_new_session = await ensure_session_exists(app_state)

                # Process user input through session (handles summarization + metadata update automatically)
                # CRITICAL: process_user_input now updates metadata via try/finally to prevent desync bugs
                await process_user_input(app_state, session, user_input)

                # Send session creation event AFTER first message completes
                if is_new_session:
                    send_session_created_event(app_state, session.session_id)
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
