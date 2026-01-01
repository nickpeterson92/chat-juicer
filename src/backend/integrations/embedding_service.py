"""
Embedding service for generating text embeddings via Azure OpenAI.

Uses text-embedding-3-small model (1536 dimensions) for semantic search.
"""

from __future__ import annotations

import hashlib

from typing import TYPE_CHECKING

from core.constants import get_settings
from utils.client_factory import create_openai_client
from utils.logger import get_logger

if TYPE_CHECKING:
    from openai import AsyncOpenAI

logger = get_logger(__name__)

# Embedding configuration
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
EMBEDDING_BATCH_SIZE = 100  # Azure OpenAI limit per request


class EmbeddingService:
    """Generate embeddings via Azure OpenAI text-embedding-3-small.

    This service wraps the OpenAI embeddings API to provide:
    - Single text embedding
    - Batch text embedding (up to 100 texts)
    - Content hash generation for deduplication
    """

    # Class-level singleton instance
    _instance: EmbeddingService | None = None

    def __init__(self, client: AsyncOpenAI | None = None) -> None:
        """Initialize embedding service.

        Args:
            client: Optional AsyncOpenAI client. If not provided, creates one from settings.
        """
        self._client = client
        self._initialized = False

    async def _get_client(self) -> AsyncOpenAI:
        """Lazily initialize OpenAI client."""
        if self._client is None:
            settings = get_settings()
            self._client = create_openai_client(
                api_key=settings.azure_openai_api_key or "",
                base_url=str(settings.azure_openai_endpoint) if settings.azure_openai_endpoint else None,
            )
        return self._client

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a single text.

        Args:
            text: The text to embed.

        Returns:
            1536-dimensional embedding vector.

        Raises:
            Exception: If embedding generation fails.
        """
        client = await self._get_client()

        try:
            response = await client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=text,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error("Embedding generation failed", extra={"error": str(e), "text_length": len(text)})
            raise

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed (max 100 per batch).

        Returns:
            List of 1536-dimensional embedding vectors.

        Raises:
            ValueError: If batch size exceeds limit.
            Exception: If embedding generation fails.
        """
        if len(texts) > EMBEDDING_BATCH_SIZE:
            raise ValueError(f"Batch size {len(texts)} exceeds limit of {EMBEDDING_BATCH_SIZE}")

        if not texts:
            return []

        client = await self._get_client()

        try:
            response = await client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts,
                dimensions=EMBEDDING_DIMENSIONS,
            )
            # Sort by index to ensure order matches input
            sorted_data = sorted(response.data, key=lambda x: x.index)
            return [item.embedding for item in sorted_data]
        except Exception as e:
            logger.error("Batch embedding generation failed", extra={"error": str(e), "batch_size": len(texts)})
            raise

    @staticmethod
    def content_hash(content: str) -> str:
        """Generate SHA-256 hash for content deduplication.

        Args:
            content: The content to hash.

        Returns:
            Hex-encoded SHA-256 hash.
        """
        return hashlib.sha256(content.encode()).hexdigest()


def get_embedding_service() -> EmbeddingService:
    """Get or create singleton embedding service instance."""
    if EmbeddingService._instance is None:
        EmbeddingService._instance = EmbeddingService()
    return EmbeddingService._instance
