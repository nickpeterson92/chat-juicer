"""
Context search API routes.

Provides vector similarity search for project context.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.dependencies import get_context_service, get_embedding_service
from api.middleware.auth import get_current_user
from api.services.context_service import ContextService
from integrations.embedding_service import EmbeddingService
from models.api_models import UserInfo

router = APIRouter(prefix="/context", tags=["context"])

# Type alias for authenticated user dependency
CurrentUser = Annotated[UserInfo, Depends(get_current_user)]


# =============================================================================
# Request/Response Models
# =============================================================================


class ContextSearchRequest(BaseModel):
    """Request body for context search."""

    project_id: str = Field(..., description="Project UUID to search within")
    query: str = Field(..., min_length=1, max_length=10000, description="Search query")
    top_k: int = Field(default=5, ge=1, le=20, description="Max results to return")
    min_score: float = Field(default=0.7, ge=0.0, le=1.0, description="Minimum similarity score threshold")


class ContextChunkResult(BaseModel):
    """A single context chunk result."""

    chunk_id: str = Field(..., description="Chunk UUID")
    source_type: str = Field(..., description="Type: session_summary, message, or file")
    source_id: str = Field(..., description="Source entity UUID")
    chunk_index: int = Field(..., description="Chunk index within source")
    content: str = Field(..., description="Chunk text content")
    score: float = Field(..., description="Similarity score (0-1)")
    metadata: dict[str, Any] | None = Field(default=None, description="Additional metadata")


class ContextSearchResponse(BaseModel):
    """Response from context search."""

    query: str = Field(..., description="Original query")
    results: list[ContextChunkResult] = Field(..., description="Matching chunks")
    total_chunks_searched: int = Field(..., description="Total chunks in project")


# =============================================================================
# Routes
# =============================================================================


@router.post(
    "/search",
    response_model=ContextSearchResponse,
    summary="Search project context",
    description="Search for relevant context chunks using vector similarity.",
)
async def search_context(
    request: ContextSearchRequest,
    user: CurrentUser,
    context_service: Annotated[ContextService, Depends(get_context_service)],
    embedding_service: Annotated[EmbeddingService, Depends(get_embedding_service)],
) -> ContextSearchResponse:
    """Search project context using semantic similarity."""
    try:
        project_id = UUID(request.project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project_id format",
        ) from None

    # Generate query embedding
    query_embedding = await embedding_service.embed_text(request.query)

    # Search for matching chunks
    results = await context_service.search_chunks(
        project_id=project_id,
        query_embedding=query_embedding,
        top_k=request.top_k,
        score_threshold=request.min_score,
    )

    # Get total chunk count for context
    total_chunks = await context_service.get_chunk_count_for_project(project_id)

    return ContextSearchResponse(
        query=request.query,
        results=[
            ContextChunkResult(
                chunk_id=str(r.chunk_id),
                source_type=r.source_type,
                source_id=str(r.source_id),
                chunk_index=r.chunk_index,
                content=r.content,
                score=r.score,
                metadata=r.metadata,
            )
            for r in results
        ],
        total_chunks_searched=total_chunks,
    )
