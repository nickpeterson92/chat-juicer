"""
Context search tool for project knowledge base.

Provides semantic search over project context using embeddings.
"""

from __future__ import annotations

import asyncpg


async def search_project_context(
    query: str,
    top_k: int = 5,
    min_score: float = 0.7,
) -> str:
    """Search the current project's knowledge base for relevant context.

    Uses semantic similarity to find related session summaries, messages,
    and file content from the current project.

    Args:
        query: Natural language search query describing what you're looking for
        top_k: Maximum number of results to return (1-20, default 5)
        min_score: Minimum similarity score threshold (0.0-1.0, default 0.7)

    Returns:
        Formatted search results with relevant context chunks
    """
    # This is a placeholder - actual implementation is in the wrapper
    # that provides session context (project_id, pool, embedding_service)
    return "Error: search_project_context requires session context wrapper"


async def _search_project_context_impl(
    query: str,
    project_id: str,
    pool: asyncpg.Pool,
    top_k: int = 5,
    min_score: float = 0.7,
) -> str:
    """Internal implementation with session context.

    Called by the session-aware wrapper in wrappers.py.
    """
    from uuid import UUID

    from api.services.context_service import ContextService
    from integrations.embedding_service import get_embedding_service

    # Validate project_id
    if not project_id:
        return "No project associated with current session. Use projects to organize context."

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        return f"Invalid project_id format: {project_id}"

    # Get services
    context_service = ContextService(pool)
    embedding_service = get_embedding_service()

    # Generate query embedding
    query_embedding = await embedding_service.embed_text(query)

    # Search for matching chunks
    results = await context_service.search_chunks(
        project_id=project_uuid,
        query_embedding=query_embedding,
        top_k=min(max(top_k, 1), 20),  # Clamp to 1-20
        score_threshold=max(0.0, min(min_score, 1.0)),  # Clamp to 0-1
    )

    if not results:
        return f"No relevant context found for query: '{query}' (min_score={min_score})"

    # Format results
    output_lines = [f"Found {len(results)} relevant context chunks:\n"]

    for i, chunk in enumerate(results, 1):
        source_label = {
            "session_summary": "Session Summary",
            "message": "Message",
            "file": "File",
        }.get(chunk.source_type, chunk.source_type)

        output_lines.append(f"--- Result {i} ({source_label}, score: {chunk.score:.2f}) ---")
        output_lines.append(chunk.content.strip())
        output_lines.append("")

    return "\n".join(output_lines)
