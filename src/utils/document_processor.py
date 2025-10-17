"""
Document processing utilities for Chat Juicer.
Handles document conversion, summarization, and content optimization.
"""

from __future__ import annotations

from typing import Any

from core.constants import DOCUMENT_SUMMARIZATION_THRESHOLD, get_settings
from core.prompts import DOCUMENT_SUMMARIZATION_PROMPT
from utils.logger import logger
from utils.token_utils import count_tokens

# Optional dependency: MarkItDown for document conversion
try:
    from markitdown import MarkItDown

    # Create singleton converter instance with plugins enabled
    _markitdown_converter: Any = MarkItDown(enable_plugins=True)
except ImportError:  # pragma: no cover - optional dependency
    MarkItDown = None  # type: ignore[misc,assignment]
    _markitdown_converter = None


class _AsyncClientManager:
    """Singleton manager for AsyncOpenAI client with lazy initialization.

    Eliminates global variables while maintaining lazy initialization pattern.
    """

    _instance: Any = None
    _initialized: bool = False

    @classmethod
    def get_client(cls) -> Any:
        """Get or create the AsyncOpenAI client for summarization.

        Returns:
            AsyncOpenAI client instance or None if initialization failed
        """
        if cls._initialized:
            return cls._instance

        cls._initialized = True  # Mark as attempted even if it fails

        try:
            from openai import AsyncOpenAI  # Lazy import for optional dependency

            try:
                settings = get_settings()
                cls._instance = AsyncOpenAI(api_key=settings.azure_openai_api_key, base_url=settings.azure_endpoint_str)
                logger.debug(
                    f"Initialized AsyncOpenAI client for summarization with deployment: {settings.azure_openai_deployment}"
                )
            except Exception as e:
                logger.warning(f"Failed to initialize OpenAI client for summarization: {e}")
        except ImportError as ie:
            logger.warning(f"OpenAI library not available for summarization: {ie}")

        return cls._instance


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
    client = _AsyncClientManager.get_client()
    if not client:
        logger.warning("OpenAI client not available for summarization, returning original content")
        return content

    try:
        settings = get_settings()
        deployment = settings.azure_openai_deployment

        # Create concise summarization prompt using template from prompts.py
        prompt = DOCUMENT_SUMMARIZATION_PROMPT.format(
            file_name=file_name, tokens=DOCUMENT_SUMMARIZATION_THRESHOLD, content=content
        )

        # Make async API call - no temperature parameter for reasoning models
        response = await client.chat.completions.create(
            model=deployment,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that creates CONCISE document summaries."},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=DOCUMENT_SUMMARIZATION_THRESHOLD,  # Set max completion tokens to the threshold
        )

        # Log response metadata for debugging
        finish_reason = response.choices[0].finish_reason if response.choices else "no_choices"
        logger.debug(f"Summarization response: finish_reason={finish_reason}, model={response.model}")

        summarized = response.choices[0].message.content

        # Handle length cutoff - always use original when hitting token limit
        if finish_reason == "length":
            logger.warning(f"Summary for {file_name} hit token limit (finish_reason=length), using original content")
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
