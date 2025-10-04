"""
Document processing utilities for Chat Juicer.
Handles document conversion, summarization, and content optimization.
"""

from __future__ import annotations

from typing import Any

from core.constants import get_settings
from infrastructure.logger import logger
from infrastructure.utils import count_tokens

# Optional dependency: MarkItDown for document conversion
try:
    from markitdown import MarkItDown

    # Create singleton converter instance with plugins enabled
    _markitdown_converter: Any = MarkItDown(enable_plugins=True)
except ImportError:  # pragma: no cover - optional dependency
    MarkItDown = None  # type: ignore[misc,assignment]
    _markitdown_converter = None

# Lazy initialization of OpenAI client for summarization
_async_client: Any = None
_client_initialized = False


def _get_async_client() -> Any:
    """Get or create the AsyncOpenAI client for summarization (lazy initialization)."""
    global _async_client, _client_initialized  # noqa: PLW0603

    if _client_initialized:
        return _async_client

    _client_initialized = True  # Mark as attempted even if it fails

    try:
        from openai import AsyncOpenAI

        try:
            settings = get_settings()
            _async_client = AsyncOpenAI(api_key=settings.azure_openai_api_key, base_url=settings.azure_endpoint_str)
            logger.debug(
                f"Initialized AsyncOpenAI client for summarization with deployment: {settings.azure_openai_deployment}"
            )
        except Exception as e:
            logger.warning(f"Failed to initialize OpenAI client for summarization: {e}")
    except ImportError as ie:
        logger.warning(f"OpenAI library not available for summarization: {ie}")

    return _async_client


async def summarize_content(content: str, file_name: str = "document", model: str = "gpt-5-mini") -> str:
    """
    Summarize large document content using Azure OpenAI.

    Args:
        content: The document content to summarize
        file_name: Name of the file being summarized (for context)
        model: Model to use for token counting

    Returns:
        Summarized content or original if summarization fails
    """
    client = _get_async_client()
    if not client:
        logger.warning("OpenAI client not available for summarization, returning original content")
        return content

    try:
        settings = get_settings()
        deployment = settings.azure_openai_deployment

        # Create concise summarization prompt
        prompt = f"""Create a concise but technically complete summary of the following document ({file_name}).

Prioritize:
- Core technical concepts and architectural decisions
- Critical relationships between components, systems, or entities
- Key implementation approaches and design patterns
- Important constraints, requirements, or limitations

Omit:
- Verbose explanations and redundant content
- Minor details that don't affect technical understanding
- Excessive examples (keep only the most illustrative ones)

Keep the summary information-dense while preserving technical accuracy.

Document content:
{content}"""

        # Make async API call - no temperature parameter for reasoning models
        response = await client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that creates concise document summaries."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=4000,  # Allow room for detailed summaries
        )

        # Log response metadata for debugging
        finish_reason = response.choices[0].finish_reason if response.choices else "no_choices"
        logger.debug(f"Summarization response: finish_reason={finish_reason}, model={response.model}")

        summarized = response.choices[0].message.content

        # Handle length cutoff - partial summaries are still useful
        if finish_reason == "length":
            logger.warning(f"Summary for {file_name} hit token limit (finish_reason=length), using partial summary")
            # If we got partial content, use it; otherwise return original
            if not summarized or not summarized.strip():
                logger.error(f"Length cutoff resulted in empty content for {file_name}, using original")
                return content
        elif not summarized or not summarized.strip():
            # Other finish reasons with empty content
            logger.error(
                f"API returned empty/null summary for {file_name} - "
                f"finish_reason={finish_reason}, "
                f"deployment={deployment}, "
                f"prompt_length={len(prompt)} chars"
            )
            return content

        # Log summarization stats
        original_tokens = count_tokens(content, model)
        summary_tokens = count_tokens(summarized, model)

        orig_count = original_tokens["exact_tokens"]
        summ_count = summary_tokens["exact_tokens"]

        logger.info(
            f"Summarized {file_name}: {orig_count:,} tokens → {summ_count:,} tokens "
            f"({int((1 - summ_count / orig_count) * 100)}% reduction)"
        )

        return str(summarized)

    except Exception as e:
        logger.error(f"Summarization failed: {e}", exc_info=True)
        return content  # Return original on error


def get_markitdown_converter() -> Any:
    """
    Get the MarkItDown converter instance.

    Returns:
        MarkItDown converter instance or None if not available
    """
    return _markitdown_converter
