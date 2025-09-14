"""
Utility functions for token management, rate limiting, and optimization.
"""

import re

from functools import lru_cache

import tiktoken

# Cache for tiktoken encoders to avoid recreation
_encoder_cache = {}


def _get_encoder(model: str):
    """Get cached encoder for model."""
    if model not in _encoder_cache:
        try:
            # Try to get encoding for the specific model
            _encoder_cache[model] = tiktoken.encoding_for_model(model)
        except KeyError:
            # If model not recognized, use cl100k_base encoding
            _encoder_cache[model] = tiktoken.get_encoding("cl100k_base")
    return _encoder_cache[model]


@lru_cache(maxsize=128)
def _count_tokens_cached(text: str, model: str) -> int:
    """Cached token counting - caches last 128 unique text/model pairs."""
    encoding = _get_encoder(model)
    return len(encoding.encode(text))


def estimate_tokens(text: str, model: str = "gpt-4o-mini") -> dict:
    """
    Count exact tokens using tiktoken for accurate token counting.

    Args:
        text: The text to count tokens for
        model: The model name (default: gpt-4o-mini)

    Returns:
        Dict with exact and estimated token counts
    """
    try:
        # Use cached token counting
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

    except Exception as e:
        # If tiktoken fails for any reason, fall back to estimation
        char_count = len(text)
        word_count = len(text.split())

        # Detect content type for better estimation
        code_indicators = sum(
            [
                text.count("{"),
                text.count("}"),
                text.count("("),
                text.count(")"),
                text.count(";"),
                text.count("="),
            ]
        )

        # Calculate code density (0-1)
        code_density = min(code_indicators / (word_count + 1), 1.0)

        # Weighted average based on content type
        chars_per_token = 3.0 + 1.0 * (1 - code_density) if code_density > 0.3 else 4.0

        return {
            "exact_tokens": None,  # Indicate this is an estimate
            "estimated_tokens": int(char_count / chars_per_token),
            "char_count": char_count,
            "word_count": word_count,
            "chars_per_token": round(chars_per_token, 2),
            "content_type": "technical" if code_density > 0.3 else "natural",
            "error": f"Tiktoken unavailable: {e!s}",
        }


def optimize_content_for_tokens(content: str, format_type: str = "text", model: str = "gpt-5-mini") -> tuple[str, dict]:
    """
    Optimize content for minimal token usage while preserving information.

    Args:
        content: The text content to optimize
        format_type: Type of content (markdown, csv, json, text, etc.)
        model: Model name for token counting (default: gpt-5-mini)

    Returns:
        Tuple of (optimized_content, optimization_stats)
    """
    original_length = len(content)
    lines = content.splitlines()

    # Get initial token count
    initial_token_count = estimate_tokens(content, model)
    initial_tokens = initial_token_count.get("exact_tokens") or initial_token_count.get("estimated_tokens", 0)

    # Statistics tracking
    stats = {
        "original_length": original_length,
        "original_lines": len(lines),
        "original_tokens": initial_tokens,
        "removed_blank_lines": 0,
        "whitespace_trimmed": 0,
    }

    # Only optimize if content is large enough to benefit (>1000 tokens)
    if initial_tokens <= 1000:
        stats["final_length"] = original_length
        stats["final_lines"] = len(lines)
        stats["final_tokens"] = initial_tokens
        stats["bytes_saved"] = 0
        stats["tokens_saved"] = 0
        stats["percentage_saved"] = 0
        stats["optimization_skipped"] = True
        stats["skip_reason"] = f"Content too small ({initial_tokens} tokens <= 1000)"
        return content, stats

    # Remove excessive blank lines (keep max 1 between sections)
    optimized_lines = []
    prev_blank = False
    for line in lines:
        if line.strip() == "":
            if not prev_blank:
                optimized_lines.append("")
                prev_blank = True
            else:
                stats["removed_blank_lines"] += 1
        else:
            optimized_lines.append(line)
            prev_blank = False

    # Trim trailing whitespace from all lines
    optimized_lines = [line.rstrip() for line in optimized_lines]
    stats["whitespace_trimmed"] = sum(1 for line in optimized_lines if line)

    # Format-specific optimizations
    if format_type == "json":
        # Compact JSON formatting
        content_joined = "\n".join(optimized_lines)
        content_joined = re.sub(r"\s*:\s*", ":", content_joined)
        content_joined = re.sub(r"\s*,\s*", ",", content_joined)
        optimized_lines = content_joined.splitlines()
    elif format_type in {"csv", "markdown_table"}:
        # Remove redundant column separators
        optimized_lines = [re.sub(r"\s*\|\s*", "|", line) for line in optimized_lines]

    # Join back together
    optimized_content = "\n".join(optimized_lines)

    # Calculate final stats with exact token counts
    final_token_count = estimate_tokens(optimized_content, model)
    final_tokens = final_token_count.get("exact_tokens") or final_token_count.get("estimated_tokens", 0)

    stats["final_length"] = len(optimized_content)
    stats["final_lines"] = len(optimized_lines)
    stats["final_tokens"] = final_tokens
    stats["bytes_saved"] = original_length - stats["final_length"]
    stats["tokens_saved"] = initial_tokens - final_tokens
    stats["percentage_saved"] = round((stats["bytes_saved"] / original_length * 100), 1) if original_length > 0 else 0
    stats["token_percentage_saved"] = (
        round((stats["tokens_saved"] / initial_tokens * 100), 1) if initial_tokens > 0 else 0
    )

    return optimized_content, stats
