"""Unit tests for EmbeddingService."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from integrations.embedding_service import (
    EMBEDDING_BATCH_SIZE,
    EmbeddingService,
    get_embedding_service,
)


@pytest.fixture
def embedding_service() -> EmbeddingService:
    mock_client = MagicMock()
    return EmbeddingService(client=mock_client)


@pytest.fixture(autouse=True)
def reset_singleton() -> Generator[None, None, None]:
    """Reset singleton between tests."""
    EmbeddingService._instance = None
    yield
    EmbeddingService._instance = None


@pytest.mark.asyncio
async def test_embed_text_success(embedding_service: EmbeddingService) -> None:
    """Test embed_text returns embedding vector."""
    # Mock response
    mock_response = MagicMock()
    mock_response.data = [MagicMock()]
    mock_response.data[0].embedding = [0.1] * 1536

    embedding_service._client.embeddings.create = AsyncMock(return_value=mock_response)

    result = await embedding_service.embed_text("Hello world")

    assert len(result) == 1536
    embedding_service._client.embeddings.create.assert_called_once()


@pytest.mark.asyncio
async def test_embed_text_error_propagates(embedding_service: EmbeddingService) -> None:
    """Test embed_text propagates API errors."""
    embedding_service._client.embeddings.create = AsyncMock(side_effect=Exception("API Error"))

    with pytest.raises(Exception, match="API Error"):
        await embedding_service.embed_text("Test")


@pytest.mark.asyncio
async def test_embed_batch_success(embedding_service: EmbeddingService) -> None:
    """Test embed_batch returns list of embeddings."""
    texts = ["Text 1", "Text 2", "Text 3"]

    # Mock response with embeddings in potentially random order
    mock_response = MagicMock()
    mock_response.data = [
        MagicMock(index=2, embedding=[0.3] * 1536),
        MagicMock(index=0, embedding=[0.1] * 1536),
        MagicMock(index=1, embedding=[0.2] * 1536),
    ]

    embedding_service._client.embeddings.create = AsyncMock(return_value=mock_response)

    result = await embedding_service.embed_batch(texts)

    assert len(result) == 3
    # Should be sorted by index
    assert result[0][0] == 0.1
    assert result[1][0] == 0.2
    assert result[2][0] == 0.3


@pytest.mark.asyncio
async def test_embed_batch_empty_list(embedding_service: EmbeddingService) -> None:
    """Test embed_batch returns empty list for empty input."""
    result = await embedding_service.embed_batch([])
    assert result == []


@pytest.mark.asyncio
async def test_embed_batch_exceeds_limit(embedding_service: EmbeddingService) -> None:
    """Test embed_batch raises ValueError for oversized batch."""
    texts = ["x"] * (EMBEDDING_BATCH_SIZE + 1)

    with pytest.raises(ValueError, match="exceeds limit"):
        await embedding_service.embed_batch(texts)


@pytest.mark.asyncio
async def test_embed_batch_error_propagates(embedding_service: EmbeddingService) -> None:
    """Test embed_batch propagates API errors."""
    embedding_service._client.embeddings.create = AsyncMock(side_effect=Exception("Batch Error"))

    with pytest.raises(Exception, match="Batch Error"):
        await embedding_service.embed_batch(["Test"])


def test_content_hash() -> None:
    """Test content_hash generates consistent SHA-256."""
    content = "Hello, world!"
    hash1 = EmbeddingService.content_hash(content)
    hash2 = EmbeddingService.content_hash(content)

    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 hex is 64 chars


def test_content_hash_different_content() -> None:
    """Test content_hash produces different hashes for different content."""
    hash1 = EmbeddingService.content_hash("Content A")
    hash2 = EmbeddingService.content_hash("Content B")

    assert hash1 != hash2


@pytest.mark.asyncio
async def test_get_client_lazy_init() -> None:
    """Test _get_client lazily initializes the client."""
    service = EmbeddingService()
    assert service._client is None

    with patch("integrations.embedding_service.create_openai_client") as mock_factory:
        mock_client = MagicMock()
        mock_factory.return_value = mock_client

        result = await service._get_client()

        assert result == mock_client
        mock_factory.assert_called_once()


def test_get_embedding_service_singleton() -> None:
    """Test get_embedding_service returns singleton."""
    service1 = get_embedding_service()
    service2 = get_embedding_service()

    assert service1 is service2


def test_get_embedding_service_creates_new() -> None:
    """Test get_embedding_service creates instance when None."""
    assert EmbeddingService._instance is None

    service = get_embedding_service()

    assert service is not None
    assert EmbeddingService._instance is service
