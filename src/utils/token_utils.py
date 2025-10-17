"""
Utility functions for token management, rate limiting, and optimization.
"""

from functools import lru_cache
from hashlib import blake2b
from typing import Any

import tiktoken

from core.constants import TOKEN_CACHE_SIZE

# Cache for tiktoken encoders to avoid recreation
_encoder_cache = {}

# Hash-to-count mapping for better cache hit rates with similar content
_hash_to_count_cache: dict[str, int] = {}


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


def _hash_text(text: str) -> str:
    """Fast hash of text for cache keys (Blake2b for speed)."""
    return blake2b(text.encode("utf-8"), digest_size=16).hexdigest()


@lru_cache(maxsize=TOKEN_CACHE_SIZE * 2)
def _count_tokens_cached(text_hash: str, text: str, model: str) -> int:
    """Cached token counting with hash-based keys for better hit rates.

    Uses both hash and text to avoid collisions while improving cache performance.
    Cache size doubled to accommodate hash-based approach.
    """
    # Check if we've seen this exact hash before
    cache_key = f"{text_hash}:{model}"
    if cache_key in _hash_to_count_cache:
        return _hash_to_count_cache[cache_key]

    # Calculate tokens
    encoding = _get_encoder(model)
    count = len(encoding.encode(text))

    # Cache by hash for future lookups
    _hash_to_count_cache[cache_key] = count

    # LRU cache will also store this for the text-based lookup
    return count


def count_tokens(text: str, model: str = "gpt-5-mini") -> dict[str, Any]:
    """
    Count exact tokens using tiktoken for accurate token counting.

    Args:
        text: The text to count tokens for
        model: The model name (default: gpt-5-mini)

    Returns:
        Dict with exact token counts and metadata
    """
    # Use cached token counting with hash-based keys for better cache hit rates
    text_hash = _hash_text(text)
    exact_count = _count_tokens_cached(text_hash, text, model)

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
