"""
Wishgate - Azure OpenAI Agent with MCP Server Support
Using Agent/Runner pattern for native MCP integration

Main entry point - orchestrates application lifecycle through bootstrap and runtime modules.
"""

from __future__ import annotations

import asyncio
import json
import sys

# Force UTF-8 encoding for stdout/stdin on all platforms
# This must be done before any print() calls
if sys.stdout.encoding != "utf-8":
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")

from app.bootstrap import initialize_application
from app.runtime import (
    ensure_session_exists,
    handle_file_upload,
    handle_session_command_wrapper,
    process_user_input,
    send_session_created_event,
    update_session_metadata,
)
from integrations.sdk_token_tracker import disconnect_session
from models.event_models import UserInput
from utils.ipc import IPCManager
from utils.logger import logger


async def main() -> None:
    """Main entry point for Wishgate - pure orchestration of application lifecycle.

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
    # MAIN LOOP: Process user inputs
    # ============================================================================
    while True:
        try:
            # Get user input (synchronously from stdin)
            raw_input = await asyncio.get_event_loop().run_in_executor(None, input)

            # Decode newlines for multi-line message support
            # The frontend encodes newlines as __NEWLINE__ since input() only reads one line
            raw_input = raw_input.replace("__NEWLINE__", "\n")

            # ========================================================================
            # Session Management Commands
            # ========================================================================
            if IPCManager.is_session_command(raw_input):
                try:
                    parsed = IPCManager.parse_session_command(raw_input)
                    if parsed:
                        command, data = parsed
                        logger.info(f"Processing session command: {command}")
                        result = await handle_session_command_wrapper(app_state, command, data)
                        IPCManager.send_session_response(result)
                        logger.info(f"Session response sent for command: {command}")
                    else:
                        IPCManager.send_session_response({"error": "Invalid session command format"})
                except Exception as e:
                    logger.error(f"Error handling session command: {e}", exc_info=True)
                    IPCManager.send_session_response({"error": str(e)})
                continue

            # ========================================================================
            # File Upload Commands
            # ========================================================================
            if raw_input.startswith("__UPLOAD__"):
                try:
                    # Parse upload command: __UPLOAD__<json>__
                    json_start = raw_input.index("__UPLOAD__") + len("__UPLOAD__")
                    json_end = raw_input.index("__", json_start)
                    upload_json = raw_input[json_start:json_end]
                    upload_data = json.loads(upload_json)

                    # Process upload through runtime
                    result = await handle_file_upload(app_state, upload_data)

                    # Send upload response back to Electron
                    response_msg = {"type": "upload_response", "data": result}
                    IPCManager.send(response_msg)
                    logger.info(f"Upload response sent: {result.get('success')}")

                except Exception as e:
                    logger.error(f"Upload command error: {e}", exc_info=True)
                    error_msg = {"type": "upload_response", "data": {"success": False, "error": str(e)}}
                    IPCManager.send(error_msg)
                continue

            # ========================================================================
            # Chat Messages
            # ========================================================================

            # Validate user input with Pydantic
            try:
                validated_input = UserInput(content=raw_input)
                user_input = validated_input.content
            except ValueError:
                # Skip invalid input (empty after stripping)
                continue

            # Handle quit command
            if user_input.lower() in ["quit", "exit"]:
                logger.info("Quit command received, shutting down gracefully")
                break

            # Log user input
            from core.constants import LOG_PREVIEW_LENGTH

            file_msg = f"User: {user_input[:LOG_PREVIEW_LENGTH]}{'...' if len(user_input) > LOG_PREVIEW_LENGTH else ''}"
            logger.info(f"User: {user_input}", extra={"file_message": file_msg})

            # Ensure session exists (lazy initialization on first message)
            session, is_new_session = await ensure_session_exists(app_state)

            # Process user input through session (handles summarization automatically)
            await process_user_input(session, user_input)

            # Update session metadata after each message
            await update_session_metadata(app_state, session)

            # Send session creation event AFTER first message completes
            if is_new_session:
                send_session_created_event(app_state, session.session_id)

        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
            break
        except EOFError:
            # Handle EOF from Electron
            logger.info("EOF received, shutting down")
            break
        except Exception as e:
            # This should rarely happen since process_user_input handles errors
            logger.error(f"Unexpected error in main loop: {e}")
            IPCManager.send_error("An unexpected error occurred.")

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

    logger.info("Wishgate shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
