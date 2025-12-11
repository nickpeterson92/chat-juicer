from __future__ import annotations

import asyncio

from typing import Any
from uuid import UUID

import asyncpg

from agents import Agent, Runner

from api.services.file_context import session_file_context
from api.services.file_service import FileService
from api.services.postgres_session import PostgresSession
from api.websocket.manager import WebSocketManager
from core.agent import create_agent
from core.prompts import SYSTEM_INSTRUCTIONS, build_dynamic_instructions
from tools.wrappers import create_session_aware_tools
from utils.logger import logger


class ChatService:
    """Chat orchestration service for streaming responses over WebSocket."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        mcp_servers: list[Any],
        ws_manager: WebSocketManager,
        file_service: FileService,
    ):
        self.pool = pool
        self.mcp_servers = mcp_servers
        self.ws_manager = ws_manager
        self.file_service = file_service
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}

    async def process_chat(
        self,
        session_id: str,
        messages: list[dict[str, Any]],
        model: str | None = None,
        reasoning_effort: str | None = None,
    ) -> None:
        """Process chat messages and stream response."""
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

        # Build system instructions with session file context (Phase 1: local)
        session_files = await self.file_service.list_files(session_id, "sources")
        file_names = [f["name"] for f in session_files if f.get("type") == "file"]
        instructions = build_dynamic_instructions(
            base_instructions=SYSTEM_INSTRUCTIONS,
            session_files=file_names,
            session_templates=None,
            mcp_servers=session_row.get("mcp_config"),
        )

        session = PostgresSession(session_id, session_uuid, self.pool)

        async with session_file_context(
            file_service=self.file_service,
            session_id=session_id,
            base_folder="sources",
        ):
            tools = create_session_aware_tools(session_id)

            agent = create_agent(
                deployment=model,
                instructions=instructions,
                tools=tools,
                mcp_servers=self.mcp_servers,
                reasoning_effort=reasoning,
            )

            await self.ws_manager.send(
                session_id,
                {"type": "stream_start", "session_id": session_id},
            )

            try:
                for msg in messages:
                    content = msg.get("content", msg) if isinstance(msg, dict) else msg
                    await session.add_items([{"role": "user", "content": content}])
                    await self._add_to_full_history(session_uuid, "user", content)

                await self._run_agent_stream(agent, session, session_id, session_uuid)

                await self.ws_manager.send(
                    session_id,
                    {"type": "stream_end", "finish_reason": "stop"},
                )
            except asyncio.CancelledError:
                await self.ws_manager.send(
                    session_id,
                    {"type": "stream_end", "finish_reason": "interrupted"},
                )
            except Exception as exc:
                logger.error(f"Chat error: {exc}", exc_info=True)
                await self.ws_manager.send(
                    session_id,
                    {"type": "error", "message": str(exc), "retryable": True},
                )

    async def _run_agent_stream(
        self,
        agent: Agent,
        session: PostgresSession,
        session_id: str,
        session_uuid: UUID,
    ) -> None:
        """Run agent and stream events to clients."""
        accumulated_text = ""

        async with Runner.run_streamed(  # type: ignore[attr-defined]
            agent,
            input=await session.get_items(),
        ) as stream:
            async for event in stream.stream_events():
                event_type = event.type

                if event_type == "raw_response_event":
                    if hasattr(event.data, "delta"):
                        delta = event.data.delta
                        if getattr(delta, "content", None):
                            accumulated_text += delta.content
                            await self.ws_manager.send(
                                session_id,
                                {"type": "delta", "content": delta.content},
                            )
                        if getattr(delta, "reasoning", None):
                            await self.ws_manager.send(
                                session_id,
                                {"type": "reasoning_delta", "content": delta.reasoning},
                            )

                elif event_type == "tool_call_item":
                    await self.ws_manager.send(
                        session_id,
                        {
                            "type": "tool_call",
                            "id": event.item.call_id,
                            "name": event.item.name,
                            "arguments": event.item.arguments,
                            "status": "detected",
                        },
                    )
                    if getattr(event.item, "arguments_delta", None):
                        await self.ws_manager.send(
                            session_id,
                            {
                                "type": "tool_call_arguments_delta",
                                "id": event.item.call_id,
                                "delta": event.item.arguments_delta,
                            },
                        )

                elif event_type == "tool_output_item":
                    await self.ws_manager.send(
                        session_id,
                        {
                            "type": "tool_call",
                            "id": event.item.call_id,
                            "name": event.item.name,
                            "result": event.item.output,
                            "status": "completed",
                            "success": not event.item.error,
                        },
                    )

        if accumulated_text:
            await session.add_items([{"role": "assistant", "content": accumulated_text}])
            await self._add_to_full_history(session_uuid, "assistant", accumulated_text)

    async def _add_to_full_history(
        self,
        session_uuid: UUID,
        role: str,
        content: str,
    ) -> None:
        """Add message to Layer 2 (full history)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO messages (session_id, role, content)
                VALUES ($1, $2, $3)
                """,
                session_uuid,
                role,
                content,
            )
            await conn.execute(
                """
                UPDATE sessions
                SET message_count = message_count + 1, last_used_at = NOW()
                WHERE id = $1
                """,
                session_uuid,
            )

    async def interrupt(self, session_id: str) -> None:
        """Interrupt active chat processing."""
        task = self._active_tasks.get(session_id)
        if task and not task.done():
            task.cancel()
