"""
Document processing utilities for Chat Juicer.
Handles document conversion, summarization, and content optimization.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from agents import Agent, Runner

if TYPE_CHECKING:
    from markitdown import MarkItDown

from core.constants import DEFAULT_MODEL, DOCUMENT_SUMMARIZATION_THRESHOLD, get_settings
from utils.client_factory import create_sync_openai_client
from utils.logger import logger
from utils.token_utils import count_tokens

# Optional dependency: MarkItDown for document conversion
try:
    from markitdown import MarkItDown as _MarkItDown

    _MarkItDownAvailable = True
except ImportError:  # pragma: no cover - optional dependency
    _MarkItDownAvailable = False

# Lazy-initialized converter cache (mutable container avoids global statement)
_converter_cache: dict[str, _MarkItDown | None] = {}


async def summarize_content(content: str, file_name: str = "document", model: str = "gpt-5-mini") -> str:
    """
    Summarize large document content using Agent/Runner pattern.

    Args:
        content: The document content to summarize
        file_name: Name of the file being summarized (for context)
        model: Model to use for token counting

    Returns:
        Summarized content or original if summarization fails
    """
    try:
        from typing import cast

        from agents import TResponseInputItem

        from core.prompts import DOCUMENT_SUMMARIZATION_REQUEST

        deployment = DEFAULT_MODEL

        # Create a one-off document summarization agent with generic instructions
        summary_agent = Agent(
            name="DocumentSummarizer",
            model=deployment,
            instructions="You are a helpful assistant that creates CONCISE but TECHNICALLY COMPLETE document summaries.",
        )

        # Pass document content as first user message
        content_message = {"role": "user", "content": content}

        # Append summarization request as second message
        summary_request = {
            "role": "user",
            "content": DOCUMENT_SUMMARIZATION_REQUEST.format(
                file_name=file_name, tokens=DOCUMENT_SUMMARIZATION_THRESHOLD
            ),
        }

        # Cast to TResponseInputItem for type safety (runtime-compatible dict)
        messages = [cast(TResponseInputItem, content_message), cast(TResponseInputItem, summary_request)]

        # Use Agent/Runner pattern with appended message
        result = await Runner.run(
            summary_agent,
            input=messages,
            session=None,  # No session for document summarization (one-shot operation)
        )

        summarized = result.final_output or ""

        if not summarized or not summarized.strip():
            logger.error(
                f"Agent returned empty/null summary for {file_name} - "
                f"deployment={deployment}, "
                f"content_length={len(content)} chars"
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

        return summarized

    except Exception as e:
        logger.error(f"Document summarization failed for {file_name}: {e}", exc_info=True)
        return content  # Return original on error


def get_markitdown_converter() -> MarkItDown | None:
    """
    Get the MarkItDown converter instance with LLM client for image processing.
    Lazily initializes converter with user's configured Azure OpenAI deployment.

    Returns:
        MarkItDown converter instance or None if not available
    """
    # Return existing converter if already initialized
    if "instance" in _converter_cache:
        return _converter_cache["instance"]

    # Check if MarkItDown is available
    if not _MarkItDownAvailable:
        logger.warning("MarkItDown not installed - document conversion unavailable")
        return None

    try:
        # Get user's configured deployment settings
        settings = get_settings()

        # Configure client based on API provider
        if settings.api_provider == "azure":
            api_key = settings.azure_openai_api_key
            endpoint = settings.azure_endpoint_str
            deployment = DEFAULT_MODEL

            logger.info(f"Initializing MarkItDown with Azure deployment: {deployment}")
            llm_client = create_sync_openai_client(api_key, base_url=endpoint)

        elif settings.api_provider == "openai":
            api_key = settings.openai_api_key
            deployment = DEFAULT_MODEL

            logger.info(f"Initializing MarkItDown with OpenAI model: {deployment}")
            llm_client = create_sync_openai_client(api_key)

        else:
            logger.error(f"Unknown API provider: {settings.api_provider}")
            return None

        # Initialize MarkItDown with LLM client for image processing
        _converter_cache["instance"] = _MarkItDown(llm_client=llm_client, llm_model=deployment)
        logger.info("MarkItDown initialized successfully with LLM client for image processing")

        return _converter_cache["instance"]

    except Exception as e:
        logger.error(f"Failed to initialize MarkItDown with LLM client: {e}", exc_info=True)
        return None
