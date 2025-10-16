"""
Utility functions for token management, rate limiting, and optimization.
"""

from functools import lru_cache
from typing import Any

import tiktoken

from core.constants import TOKEN_CACHE_SIZE

# Cache for tiktoken encoders to avoid recreation
_encoder_cache = {}


def _get_encoder(model: str) -> Any:
    """Get cached encoder for model."""
    if model not in _encoder_cache:
        try:
            # Try to get encoding for the specific model
            _encoder_cache[model] = tiktoken.encoding_for_model(model)
        except KeyError:
            # If model not recognized, use cl100k_base encoding
            _encoder_cache[model] = tiktoken.get_encoding("cl100k_base")
    return _encoder_cache[model]


@lru_cache(maxsize=TOKEN_CACHE_SIZE)
def _count_tokens_cached(text: str, model: str) -> int:
    """Cached token counting - caches last N unique text/model pairs based on TOKEN_CACHE_SIZE."""
    encoding = _get_encoder(model)
    return len(encoding.encode(text))


def count_tokens(text: str, model: str = "gpt-5-mini") -> dict[str, Any]:
    """
    Count exact tokens using tiktoken for accurate token counting.

    Args:
        text: The text to count tokens for
        model: The model name (default: gpt-5-mini)

    Returns:
        Dict with exact token counts and metadata
    """
    # Use cached token counting - let it fail if tiktoken has issues
    exact_count = _count_tokens_cached(text, model)

    # Also provide character and word stats for context
    char_count = len(text)
    word_count = len(text.split())

    # Calculate actual chars per token for this specific text
    chars_per_token = char_count / exact_count if exact_count > 0 else 0

    return {
        "exact_tokens": exact_count,
        "char_count": char_count,
        "word_count": word_count,
        "chars_per_token": round(chars_per_token, 2),
        "model": model,
        "encoding": _get_encoder(model).name,
    }
