"""
Embedding background worker.

Async background task that processes:
1. Sessions needing summary refresh (turn count thresholds)
2. Substantial messages (>100 tokens) without chunks
3. Files with project_id without chunks

Runs on a loop with configurable interval.
"""

from __future__ import annotations

import asyncio
import contextlib

from typing import TYPE_CHECKING, Any

import asyncpg

from api.services.context_service import ContextService
from api.services.summarization_service import SummarizationService
from integrations.embedding_service import EmbeddingService, get_embedding_service
from utils.logger import logger
from utils.token_utils import count_tokens

if TYPE_CHECKING:
    pass

# Worker configuration
WORKER_INTERVAL_SECONDS = 10  # Check for work every N seconds
MESSAGE_TOKEN_THRESHOLD = 100  # Minimum tokens to embed a message
MAX_ITEMS_PER_CYCLE = 10  # Maximum items to process per cycle


class EmbeddingWorker:
    """Background worker for embedding generation.

    Processes sessions, messages, and files that need embeddings.
    Uses cooperative async pattern to avoid blocking.
    """

    # Class-level singleton instance
    _instance: EmbeddingWorker | None = None

    def __init__(
        self,
        pool: asyncpg.Pool,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        """Initialize embedding worker.

        Args:
            pool: Database connection pool
            embedding_service: Optional embedding service (uses singleton if not provided)
        """
        self.pool = pool
        self.embedding_service = embedding_service or get_embedding_service()
        self.context_service = ContextService(pool)
        self.summarization_service = SummarizationService(pool)
        self._running = False
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Start the background worker."""
        if self._running:
            logger.warning("Embedding worker already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Embedding worker started")

    async def stop(self) -> None:
        """Stop the background worker gracefully."""
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        logger.info("Embedding worker stopped")

    async def _run_loop(self) -> None:
        """Main worker loop."""
        import traceback

        while self._running:
            try:
                await self._process_cycle()
            except Exception as e:
                logger.error(
                    "Embedding worker cycle failed",
                    extra={"error": str(e), "traceback": traceback.format_exc()},
                )

            await asyncio.sleep(WORKER_INTERVAL_SECONDS)

    async def _process_cycle(self) -> None:
        """Process one worker cycle."""
        # 1. Sessions needing summary refresh
        await self._process_session_summaries()

        # 2. Substantial messages without chunks
        await self._process_messages()

        # 3. Files without chunks (future)
        # await self._process_files()

    async def _process_session_summaries(self) -> None:
        """Process sessions that need summary generation/update."""
        sessions = await self.summarization_service.find_sessions_needing_summary(limit=MAX_ITEMS_PER_CYCLE)

        # Process outside the loop to avoid PERF203
        await self._embed_sessions_batch(sessions)

    async def _embed_sessions_batch(self, sessions: list[dict[str, Any]]) -> None:
        """Embed a batch of sessions, handling errors individually."""
        for session in sessions:
            await self._safe_embed_session_summary(session)

    async def _safe_embed_session_summary(self, session: dict[str, Any]) -> None:
        """Safely embed a session summary, logging any errors."""
        try:
            await self._embed_session_summary(session)
        except Exception as e:
            logger.error(
                "Failed to embed session summary",
                extra={"session_id": session["session_id"], "error": str(e)},
            )

    async def _embed_session_summary(self, session: dict[str, Any]) -> None:
        """Generate and embed summary for a single session."""
        session_id = session["session_id"]
        project_id = session["project_id"]

        # Generate summary
        summary = await self.summarization_service.generate_summary(session_id)
        if not summary:
            logger.debug("No summary generated", extra={"session_id": session_id})
            return

        # Generate embedding
        embedding = await self.embedding_service.embed_text(summary)
        content_hash = self.embedding_service.content_hash(summary)
        token_count = count_tokens(summary)

        # Upsert to context_chunks
        await self.context_service.upsert_session_summary(
            project_id=project_id,
            session_id=session["id"],  # Use UUID id, not string session_id
            content=summary,
            content_hash=content_hash,
            embedding=embedding,
            token_count=token_count,
            metadata={"session_id": session_id, "title": session.get("title")},
        )

        logger.info(
            "Embedded session summary",
            extra={
                "session_id": session_id,
                "summary_tokens": token_count,
            },
        )

    async def _process_messages(self) -> None:
        """Process substantial messages without chunks."""
        # Find messages that:
        # - Belong to sessions with project_id
        # - Are assistant messages
        # - Have >100 tokens
        # - Don't have chunks yet
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT m.id, m.session_id, m.content, s.project_id
                FROM messages m
                JOIN sessions s ON m.session_id = s.session_id
                WHERE s.project_id IS NOT NULL
                  AND m.role = 'assistant'
                  AND m.content IS NOT NULL
                  AND LENGTH(m.content) > 400
                  AND NOT EXISTS (
                      SELECT 1 FROM context_chunks cc
                      WHERE cc.source_id = m.id
                        AND cc.source_type = 'message'
                  )
                ORDER BY m.created_at DESC
                LIMIT $1
                """,
                MAX_ITEMS_PER_CYCLE,
            )

        # Process outside the loop to avoid PERF203
        await self._embed_messages_batch(list(rows))

    async def _embed_messages_batch(self, rows: list[asyncpg.Record]) -> None:
        """Embed a batch of messages, handling errors individually."""
        for row in rows:
            await self._safe_embed_message(row)

    async def _safe_embed_message(self, row: asyncpg.Record) -> None:
        """Safely embed a message, logging any errors."""
        try:
            await self._embed_message(row)
        except Exception as e:
            logger.error(
                "Failed to embed message",
                extra={"message_id": str(row["id"]), "error": str(e)},
            )

    async def _embed_message(self, row: asyncpg.Record) -> None:
        """Embed a single message."""
        content = row["content"]

        # Check token count
        token_count = count_tokens(content)
        if token_count < MESSAGE_TOKEN_THRESHOLD:
            return

        # Generate embedding
        embedding = await self.embedding_service.embed_text(content)
        content_hash = self.embedding_service.content_hash(content)

        # Insert chunk
        await self.context_service.insert_chunk(
            project_id=row["project_id"],
            source_type="message",
            source_id=row["id"],
            chunk_index=0,
            content=content,
            content_hash=content_hash,
            embedding=embedding,
            token_count=token_count,
            metadata={"session_id": row["session_id"]},
        )

        logger.debug(
            "Embedded message",
            extra={"message_id": str(row["id"]), "tokens": token_count},
        )


async def start_embedding_worker(pool: asyncpg.Pool) -> EmbeddingWorker:
    """Start the global embedding worker.

    Args:
        pool: Database connection pool

    Returns:
        Running worker instance
    """
    if EmbeddingWorker._instance is None:
        EmbeddingWorker._instance = EmbeddingWorker(pool)
    await EmbeddingWorker._instance.start()
    return EmbeddingWorker._instance


async def stop_embedding_worker() -> None:
    """Stop the global embedding worker."""
    if EmbeddingWorker._instance:
        await EmbeddingWorker._instance.stop()
        EmbeddingWorker._instance = None
