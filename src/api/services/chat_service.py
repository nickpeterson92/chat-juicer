from __future__ import annotations

import asyncio
import inspect
import json

from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

import asyncpg

from agents import Agent, RunConfig, Runner
from agents.models.openai_provider import OpenAIProvider

from api.services.file_context import session_file_context
from api.services.file_service import FileService
from api.services.token_aware_session import PostgresTokenAwareSession
from api.websocket.manager import WebSocketManager

if TYPE_CHECKING:
    from api.websocket.task_manager import CancellationToken
from core.agent import create_agent
from core.constants import (
    MAX_CONVERSATION_TURNS,
    MSG_TYPE_FUNCTION_COMPLETED,
    MSG_TYPE_FUNCTION_EXECUTING,
    RAW_RESPONSE_EVENT,
    TEMPLATES_PATH,
    get_settings,
)
from core.prompts import SESSION_TITLE_GENERATION_PROMPT, SYSTEM_INSTRUCTIONS, build_dynamic_instructions
from integrations.event_handlers import CallTracker, build_event_handlers
from integrations.mcp_pool import MCPServerPool
from integrations.mcp_registry import DEFAULT_MCP_SERVERS
from integrations.sdk_token_tracker import connect_session, disconnect_session
from tools.wrappers import create_session_aware_tools
from utils.client_factory import create_openai_client
from utils.file_utils import get_session_templates
from utils.logger import logger


class ChatService:
    """Chat orchestration service for streaming responses over WebSocket.

    Uses CancellationToken for cooperative cancellation, providing:
    - Clean cancellation semantics with reason tracking
    - Event-driven (not polling) cancellation detection
    - Integration with structured concurrency patterns
    """

    # Class-level cancellation tokens (keyed by session_id)
    # Shared across instances to ensure interrupts work with multiple ChatService instances
    _cancellation_tokens: ClassVar[dict[str, CancellationToken]] = {}

    def __init__(
        self,
        pool: asyncpg.Pool,
        ws_manager: WebSocketManager,
        file_service: FileService,
        mcp_pool: MCPServerPool,
    ):
        self.pool = pool
        self.ws_manager = ws_manager
        self.file_service = file_service
        self.mcp_pool = mcp_pool
        # Background tasks set to prevent garbage collection (RUF006)
        self._background_tasks: set[asyncio.Task[Any]] = set()

    async def process_chat(
        self,
        session_id: str,
        messages: list[dict[str, Any]],
        model: str | None = None,
        reasoning_effort: str | None = None,
        cancellation_token: CancellationToken | None = None,
    ) -> None:
        """Process chat messages and stream response.

        Args:
            session_id: The session identifier
            messages: List of user messages to process
            model: Optional model override
            reasoning_effort: Optional reasoning effort level
            cancellation_token: Token for cooperative cancellation (preferred over flags)
        """
        # Store cancellation token for this session (used by _run_agent_stream)
        # This supports both the new token-based approach and legacy flag-based approach
        if cancellation_token is not None:
            self._cancellation_tokens[session_id] = cancellation_token

        async with self.pool.acquire() as conn:
            session_row = await conn.fetchrow(
                "SELECT * FROM sessions WHERE session_id = $1",
                session_id,
            )
        if not session_row:
            await self.ws_manager.send(
                session_id,
                {"type": "error", "message": "Session not found"},
            )
            return

        session_uuid: UUID = session_row["id"]
        model = model or session_row["model"]
        reasoning = reasoning_effort or session_row["reasoning_effort"]

        # Ensure session workspace exists (defensive - handles old sessions)
        self.file_service.init_session_workspace(session_id, TEMPLATES_PATH)

        # Build system instructions with session file context (Phase 1: local)
        session_files = await self.file_service.list_files(session_id, "sources")
        file_names = [f["name"] for f in session_files if f.get("type") == "file"]

        # Load templates available to this session (from templates/ symlink)
        template_names = await get_session_templates(session_id)

        # Parse mcp_config from JSON string (stored as JSONB in PostgreSQL)
        mcp_config_raw = session_row.get("mcp_config")
        session_mcp_config = json.loads(mcp_config_raw) if mcp_config_raw else None

        instructions = build_dynamic_instructions(
            base_instructions=SYSTEM_INSTRUCTIONS,
            session_files=file_names,
            session_templates=template_names,
            mcp_servers=session_mcp_config,
        )

        session = PostgresTokenAwareSession(session_id, session_uuid, self.pool, model=model)
        # Load existing token state from database
        await session.load_token_state_from_db()

        # Acquire MCP servers from pool for concurrent safety
        # MCP servers use stdio which doesn't support concurrent access - pool serializes access
        server_keys = session_mcp_config if session_mcp_config else DEFAULT_MCP_SERVERS
        logger.info(
            f"[DIAG:{session_id[:8]}] Acquiring MCP servers: {server_keys}, "
            f"pool_stats: {self.mcp_pool.get_pool_stats()}"
        )

        async with self.mcp_pool.acquire_servers(server_keys) as pooled_servers:
            logger.info(f"[DIAG:{session_id[:8]}] Acquired {len(pooled_servers)} servers from pool")
            async with session_file_context(
                file_service=self.file_service,
                session_id=session_id,
                base_folder="sources",
            ):
                tools = create_session_aware_tools(session_id, model=model)

                # Create a fresh client for this request to avoid stream mixing
                # between concurrent sessions (critical for multi-user cloud)
                settings = get_settings()
                if settings.api_provider == "azure":
                    request_client = create_openai_client(
                        api_key=settings.azure_openai_api_key,
                        base_url=settings.azure_endpoint_str,
                    )
                else:
                    request_client = create_openai_client(
                        api_key=settings.openai_api_key,
                    )

                # Create provider with dedicated client for stream isolation
                request_provider = OpenAIProvider(openai_client=request_client)

                logger.info(f"[DIAG:{session_id[:8]}] Creating agent with model={model} and dedicated provider")
                agent = create_agent(
                    deployment=model,
                    instructions=instructions,
                    tools=tools,
                    mcp_servers=pooled_servers,  # Use pooled servers
                    reasoning_effort=reasoning,
                )
                logger.info(f"[DIAG:{session_id[:8]}] Agent created, sending assistant_start")

                await self.ws_manager.send(
                    session_id,
                    {"type": "assistant_start", "session_id": session_id},
                )
                logger.info(f"[DIAG:{session_id[:8]}] assistant_start sent")

                try:
                    # Build user messages list for SDK input
                    # NOTE: Do NOT save to session.add_items() here - SDK handles that via session_input_callback
                    # Only save to Layer 2 (UI history) which is separate from LLM context
                    user_messages: list[dict[str, Any]] = []
                    for msg in messages:
                        content = msg.get("content", msg) if isinstance(msg, dict) else msg
                        user_messages.append({"role": "user", "content": content})
                        logger.info(f"Processing user message for session {session_id}")
                        try:
                            await self._add_to_full_history(session_uuid, "user", content)
                            logger.info("Saved to messages table (Layer 2) successfully")
                        except Exception as e:
                            logger.error(f"Failed to save to messages: {e}", exc_info=True)
                            raise

                    # Connect session to SDK token tracker for tool token tracking
                    connect_session(session)
                    try:
                        # Pass only NEW user messages - SDK merges with session history via session_input_callback
                        # Pass model_provider for stream isolation (critical for concurrent multi-user requests)
                        logger.info(f"[DIAG:{session_id[:8]}] Starting _run_agent_stream with dedicated provider")
                        completed_normally = await self._run_agent_stream(
                            agent,
                            session,
                            session_id,
                            session_uuid,
                            user_messages,
                            model_provider=request_provider,
                        )
                        logger.info(f"[DIAG:{session_id[:8]}] _run_agent_stream completed: {completed_normally}")
                    finally:
                        disconnect_session()
                        # Clear cancellation token after stream ends
                        self._cancellation_tokens.pop(session_id, None)

                    # Post-run: update token count in DB and notify frontend
                    await session.update_db_token_count()
                    await self._send_token_usage(session_id, session)

                    # Post-run: check if summarization needed (skip if interrupted)
                    if completed_normally and await session.should_summarize():
                        logger.info(f"Triggering post-run summarization for {session_id}")
                        await session.summarize_with_agent()
                        await session.update_db_token_count()
                        await self._send_token_usage(session_id, session)

                    # Send appropriate finish reason based on completion status
                    finish_reason = "stop" if completed_normally else "interrupted"
                    await self.ws_manager.send(
                        session_id,
                        {"type": "assistant_end", "finish_reason": finish_reason},
                    )

                    # Generate title in background (non-blocking) - only if completed normally
                    if completed_normally:
                        # Store task reference to prevent garbage collection (RUF006)
                        task = asyncio.create_task(self._maybe_generate_title(session_id, session_uuid, model))
                        self._background_tasks.add(task)
                        task.add_done_callback(self._background_tasks.discard)
                except asyncio.CancelledError:
                    logger.info(f"Chat task was cancelled for session {session_id}")
                    # Flag already cleared by finally block above
                    await self.ws_manager.send(
                        session_id,
                        {"type": "assistant_end", "finish_reason": "interrupted"},
                    )
                    # Re-raise so the caller knows the task was cancelled
                    raise
                except Exception as exc:
                    logger.error(f"Chat error: {exc}", exc_info=True)
                    await self.ws_manager.send(
                        session_id,
                        {"type": "error", "message": str(exc), "retryable": True},
                    )
        # MCP servers automatically returned to pool when context manager exits

    async def _run_agent_stream(
        self,
        agent: Agent,
        session: PostgresTokenAwareSession,
        session_id: str,
        session_uuid: UUID,
        user_messages: list[dict[str, Any]],
        model_provider: OpenAIProvider | None = None,
    ) -> bool:
        """Run agent and stream events to clients.

        Uses the existing event_handlers infrastructure for proper SDK event parsing.
        Events are converted to JSON and sent via WebSocket to the frontend.

        Args:
            agent: The agent to run
            session: PostgreSQL session for persistence
            session_id: Session ID string
            session_uuid: Session UUID
            user_messages: NEW user messages only (not entire history)
            model_provider: Custom OpenAI provider for stream isolation (critical for
                           concurrent multi-user requests to avoid stream mixing)

        Returns:
            True if completed normally, False if interrupted.
        """
        accumulated_text = ""
        tracker = CallTracker()
        handlers = build_event_handlers(tracker)
        # Track pending tool calls: {call_id: {name, arguments}}
        pending_tool_calls: dict[str, dict[str, Any]] = {}
        interrupted = False

        # Session input callback for merging list inputs with session history
        # Simply appends new messages to the existing session history
        def merge_batch_input(history: list[Any], new_input: list[Any]) -> list[Any]:
            return history + new_input

        # Create run config with session input callback for list inputs
        # Include model_provider if provided for stream isolation (critical for concurrent requests)
        if model_provider is not None:
            run_config = RunConfig(
                session_input_callback=merge_batch_input,
                model_provider=model_provider,
            )
        else:
            run_config = RunConfig(session_input_callback=merge_batch_input)

        # Pass only NEW user messages - SDK uses session_input_callback to merge with history
        # This is critical for concurrent sessions: each session gets its own isolated history
        logger.info(f"[DIAG:{session_id[:8]}] Calling Runner.run_streamed")
        stream_candidate = Runner.run_streamed(
            agent,
            input=user_messages,  # type: ignore[arg-type]  # SDK accepts dict messages
            session=session,
            run_config=run_config,
            max_turns=MAX_CONVERSATION_TURNS,
        )
        logger.info(f"[DIAG:{session_id[:8]}] Awaiting stream_candidate")
        stream = await stream_candidate if inspect.isawaitable(stream_candidate) else stream_candidate
        logger.info(f"[DIAG:{session_id[:8]}] Stream ready, entering event loop")

        event_count = 0

        try:
            async for event in stream.stream_events():
                if event_count == 0:
                    logger.info(f"[DIAG:{session_id[:8]}] First event received: {event.type}")
                event_count += 1

                # Check cancellation via token
                token = self._cancellation_tokens.get(session_id)
                if token is not None and token.is_cancelled:
                    logger.info(f"Cancellation triggered at event {event_count}: reason={token.cancel_reason}")
                    interrupted = True
                    break

                # Log every 100 events
                if event_count % 100 == 0:
                    logger.info(f"Handled {event_count} events for {session_id}")

                # Use the typed event handler registry
                handler = handlers.get(event.type)
                if handler:
                    ipc_msg = handler(event)
                    if ipc_msg:
                        # Parse the JSON message from the handler
                        try:
                            msg_data = json.loads(ipc_msg)
                            await self.ws_manager.send(session_id, msg_data)

                            # Accumulate text for persistence (assistant_delta messages)
                            if msg_data.get("type") == "assistant_delta":
                                content = msg_data.get("content", "")
                                if content:
                                    accumulated_text += content

                            # Track tool calls for persistence
                            msg_type = msg_data.get("type")
                            if msg_type == MSG_TYPE_FUNCTION_EXECUTING:
                                call_id = msg_data.get("tool_call_id")
                                if call_id:
                                    pending_tool_calls[call_id] = {
                                        "tool_name": msg_data.get("tool_name", ""),
                                        "tool_arguments": msg_data.get("tool_arguments"),
                                    }

                            elif msg_type == MSG_TYPE_FUNCTION_COMPLETED:
                                call_id = msg_data.get("tool_call_id")
                                if call_id:
                                    pending = pending_tool_calls.pop(call_id, {})
                                    await self._add_tool_call_to_history(
                                        session_uuid=session_uuid,
                                        call_id=call_id,
                                        name=pending.get("tool_name") or msg_data.get("tool_name", ""),
                                        arguments=pending.get("tool_arguments"),
                                        result=msg_data.get("tool_result"),
                                        success=msg_data.get("tool_success", True),
                                    )

                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse handler result: {ipc_msg[:100]}")

                # Also extract text from raw response events for accumulation
                # (backup in case handler doesn't emit assistant_delta)
                if event.type == RAW_RESPONSE_EVENT:
                    data = getattr(event, "data", None)
                    if data and getattr(data, "type", None) == "response.output_text.delta":
                        delta = getattr(data, "delta", None)
                        if delta and not accumulated_text.endswith(delta):
                            # Only add if not already added via handler
                            pass  # Handler already handled this

        except asyncio.CancelledError:
            # Task was cancelled (via task.cancel()) - treat as interrupt
            logger.info(
                f"Stream cancelled via CancelledError for session {session_id}, "
                f"accumulated_text length: {len(accumulated_text)}"
            )
            interrupted = True
            # Don't re-raise - post-stream handling will save partial text

        # Fallback: also check token (covers case where stream completed naturally
        # before CancelledError was raised, but user did trigger cancellation)
        if not interrupted:
            token = self._cancellation_tokens.get(session_id)
            if token is not None and token.is_cancelled:
                logger.info(f"Cancellation detected post-stream for {session_id}, treating as interrupted")
                interrupted = True

        # Log the interrupt state for debugging
        logger.info(
            f"Stream ended for {session_id}: interrupted={interrupted}, "
            f"event_count={event_count}, accumulated_text_len={len(accumulated_text)}"
        )

        # Note: stream_interrupted is sent IMMEDIATELY by chat.py when interrupt is received
        # (legacy pattern for instant user feedback). We don't duplicate it here.

        # Handle interrupted tool calls - send synthetic completions with interrupted flag
        if interrupted and pending_tool_calls:
            for call_id, tool_info in pending_tool_calls.items():
                # Send synthetic completion to frontend with interrupted flag
                await self.ws_manager.send(
                    session_id,
                    {
                        "type": MSG_TYPE_FUNCTION_COMPLETED,
                        "tool_call_id": call_id,
                        "tool_name": tool_info.get("tool_name", ""),
                        "tool_result": "[User interrupted execution. Tool was cancelled before returning results.]",
                        "tool_success": False,
                        "interrupted": True,  # Frontend uses this for styling
                    },
                )
                # Persist as interrupted
                await self._add_tool_call_to_history(
                    session_uuid=session_uuid,
                    call_id=call_id,
                    name=tool_info.get("tool_name", ""),
                    arguments=tool_info.get("tool_arguments"),
                    result="[User interrupted execution. Tool was cancelled before returning results.]",
                    success=False,
                )

        # Persist accumulated text to both layers
        if accumulated_text:
            # Layer 2 (UI): Save for display - CSS handles the [interrupted] indicator
            logger.info(f"Saving to full_history with partial={interrupted} for {session_id}")
            await self._add_to_full_history(session_uuid, "assistant", accumulated_text, partial=interrupted)

            # Layer 1 (LLM context): Add partial response so LLM knows what it was saying
            # When interrupted, the SDK stream was cancelled before it could persist.
            # We must add the partial content so the next message has proper context.
            # Simple {"role": "assistant", "content": ...} dicts work fine (used in summarization).
            if interrupted:
                partial_content = f"{accumulated_text}\n\n[Response interrupted by user]"
                logger.info(f"Adding interrupted response to LLM context for {session_id}")
                await session.add_items([{"role": "assistant", "content": partial_content}])
        else:
            logger.info(f"No accumulated_text to save for {session_id} (interrupted={interrupted})")

        return not interrupted

    async def _add_to_full_history(
        self,
        session_uuid: UUID,
        role: str,
        content: str,
        partial: bool = False,
    ) -> None:
        """Add message to Layer 2 (full history).

        Args:
            session_uuid: The session's UUID
            role: Message role (user, assistant, etc.)
            content: Message content
            partial: If True, marks this as an interrupted/partial response
        """
        # Use metadata JSONB for partial flag
        import json as _json

        metadata = _json.dumps({"partial": True}) if partial else "{}"

        if partial:
            logger.info(f"Saving partial/interrupted message for session {session_uuid}")

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO messages (session_id, role, content, metadata)
                VALUES ($1, $2, $3, $4::jsonb)
                """,
                session_uuid,
                role,
                content,
                metadata,
            )
            # Increment message_count for all messages, turn_count only for user messages
            await conn.execute(
                """
                UPDATE sessions
                SET message_count = message_count + 1,
                    turn_count = turn_count + CASE WHEN $2 = 'user' THEN 1 ELSE 0 END,
                    last_used_at = NOW()
                WHERE id = $1
                """,
                session_uuid,
                role,
            )

    async def _add_tool_call_to_history(
        self,
        session_uuid: UUID,
        call_id: str,
        name: str,
        arguments: Any,
        result: Any,
        success: bool,
    ) -> None:
        """Add tool call to Layer 2 (full history) with rich metadata."""
        # Serialize arguments/result to JSON if needed
        args_json = json.dumps(arguments) if arguments else None
        result_str = str(result) if result is not None else None

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO messages (
                    session_id, role, content, tool_call_id, tool_name,
                    tool_arguments, tool_result, tool_success
                )
                VALUES ($1, 'tool_call', $2, $3, $4, $5, $6, $7)
                """,
                session_uuid,
                f"Called {name}",  # Human-readable content
                call_id,
                name,
                args_json,
                result_str,
                success,
            )
            await conn.execute(
                """
                UPDATE sessions
                SET message_count = message_count + 1, last_used_at = NOW()
                WHERE id = $1
                """,
                session_uuid,
            )
        logger.info(f"Persisted tool call {name} (call_id={call_id}, success={success})")

    async def interrupt(self, session_id: str) -> None:
        """Interrupt active chat processing via cancellation token.

        Cancels the token (if available) and sends immediate feedback to frontend.
        The stream loop will detect the cancellation and exit cleanly.
        """
        token = self._cancellation_tokens.get(session_id)
        if token is not None:
            await token.cancel(reason="User interrupt")
            logger.info(f"Cancellation token triggered for session {session_id}")
        else:
            logger.warning(f"No cancellation token found for session {session_id}")

        # Send immediate feedback to frontend (stream loop will send assistant_end when done)
        await self.ws_manager.send(session_id, {"type": "stream_interrupted", "session_id": session_id})

    def clear_interrupt(self, session_id: str) -> None:
        """Clear interrupt state (reset cancellation token).

        Note: With the current design, a fresh token is created for each message,
        so this is rarely needed. Kept for edge cases where token reuse occurs.
        """
        token = self._cancellation_tokens.get(session_id)
        if token is not None:
            token.reset()
            logger.info(f"Cancellation token reset for session {session_id}")

    async def _send_token_usage(
        self,
        session_id: str,
        session: PostgresTokenAwareSession,
    ) -> None:
        """Send token usage event to frontend for indicator update."""
        await self.ws_manager.send(
            session_id,
            {
                "type": "token_usage",
                "session_id": session_id,
                "current": session.total_tokens,
                "limit": session.max_tokens,
                "threshold": session.trigger_tokens,
            },
        )
        logger.info(
            f"Token usage for {session_id}: {session.total_tokens}/{session.max_tokens} "
            f"(threshold: {session.trigger_tokens})"
        )

    async def _maybe_generate_title(
        self,
        session_id: str,
        session_uuid: UUID,
        model: str,
    ) -> None:
        """Generate title after first turn (user message + response) if session not yet named."""
        try:
            # Check if already named - use turn_count (incremented once per user message)
            # Title triggers after turn 1 completes (turn_count >= 1)
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT is_named, turn_count FROM sessions WHERE id = $1",
                    session_uuid,
                )
            if not row or row["is_named"] or row["turn_count"] < 1:
                return

            # Get recent messages for context (exclude tool_call - API only accepts user/assistant/system)
            async with self.pool.acquire() as conn:
                message_rows = await conn.fetch(
                    """
                    SELECT role, content FROM messages
                    WHERE session_id = $1 AND role IN ('user', 'assistant')
                    ORDER BY created_at ASC
                    LIMIT 4
                    """,
                    session_uuid,
                )

            if len(message_rows) < 2:
                return

            messages = [{"role": r["role"], "content": r["content"]} for r in message_rows]

            # Create lightweight title agent
            title_agent = Agent(
                name="TitleGenerator",
                model=model,
                instructions=SESSION_TITLE_GENERATION_PROMPT,
            )

            result = await Runner.run(title_agent, input=messages)  # type: ignore[arg-type]
            generated_title = (result.final_output or "").strip().strip('"').strip("'").rstrip(".!?")

            if not generated_title or len(generated_title) < 3:
                return

            if len(generated_title) > 200:
                generated_title = generated_title[:197] + "..."

            # Update database
            async with self.pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE sessions SET title = $1, is_named = true
                    WHERE id = $2
                    """,
                    generated_title,
                    session_uuid,
                )

            # Notify frontend via WebSocket
            await self.ws_manager.send(
                session_id,
                {
                    "type": "session_updated",
                    "session_id": session_id,
                    "title": generated_title,
                },
            )
            logger.info(f"Generated title for session {session_id}: {generated_title}")
        except Exception as e:
            logger.warning(f"Failed to generate title for {session_id}: {e}")
