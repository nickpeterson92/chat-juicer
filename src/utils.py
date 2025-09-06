"""
Utility functions for token management, rate limiting, and optimization.
"""

import json
import re
import time

import tiktoken

from constants import RATE_LIMIT_BASE_DELAY, RATE_LIMIT_MAX_WAIT, RATE_LIMIT_RETRY_MAX


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
        # Try to get exact encoding for the model
        try:
            # Try to get encoding for the specific model
            encoding = tiktoken.encoding_for_model(model)
        except KeyError:
            # If model not recognized, use cl100k_base encoding
            # This is the encoding used by GPT-4 and newer models
            encoding = tiktoken.get_encoding("cl100k_base")

        # Get exact token count
        tokens = encoding.encode(text)
        exact_count = len(tokens)

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
            "encoding": encoding.name,
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


def optimize_content_for_tokens(
    content: str, format_type: str = "text", model: str = "gpt-4o-mini"
) -> tuple[str, dict]:
    """
    Optimize content for minimal token usage while preserving information.
    Now with exact token counting using tiktoken for intelligent optimization decisions.

    Args:
        content: The text content to optimize
        format_type: Type of content (markdown, csv, json, text, etc.)
        model: Model name for token counting (default: gpt-4o-mini)

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
        "removed_headers": 0,
        "removed_footers": 0,
        "whitespace_trimmed": 0,
        "redundant_removed": 0,
    }

    # Only optimize if content is large enough to benefit (>1000 tokens)
    # Small documents don't need aggressive optimization
    if initial_tokens <= 1000:
        # Content is small enough, no optimization needed
        stats["final_length"] = original_length
        stats["final_lines"] = len(lines)
        stats["final_tokens"] = initial_tokens
        stats["bytes_saved"] = 0
        stats["tokens_saved"] = 0
        stats["percentage_saved"] = 0
        stats["optimization_skipped"] = True
        stats["skip_reason"] = f"Content too small ({initial_tokens} tokens <= 1000)"
        return content, stats

    # Step 1: Remove excessive blank lines (keep max 1 between sections)
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

    # Step 2: Detect and remove common headers/footers
    if len(optimized_lines) > 10:
        # Common header patterns (first 5 lines)
        header_patterns = [
            r"^[-=]{3,}$",  # Separator lines
            r"^Page \d+",  # Page numbers
            r"^\s*Confidential",  # Confidentiality notices
            r"^\s*Copyright",  # Copyright notices
            r"^\s*Generated on",  # Generation timestamps
            r"^\s*Printed on",  # Print timestamps
        ]

        # Check first 5 lines for headers
        lines_to_remove = []
        for i in range(min(5, len(optimized_lines))):
            for pattern in header_patterns:
                if re.match(pattern, optimized_lines[i], re.IGNORECASE):
                    lines_to_remove.append(i)
                    stats["removed_headers"] += 1
                    break

        # Remove headers (in reverse to maintain indices)
        for i in reversed(lines_to_remove):
            if i < len(optimized_lines):
                optimized_lines.pop(i)

        # Check last 5 lines for footers
        footer_patterns = [
            *header_patterns,
            r"^\s*End of (document|file|report)",
            r"^\s*\d+\s*$",  # Lone page numbers
        ]

        lines_to_remove = []
        start_idx = max(0, len(optimized_lines) - 5)
        for i in range(start_idx, len(optimized_lines)):
            for pattern in footer_patterns:
                if re.match(pattern, optimized_lines[i], re.IGNORECASE):
                    lines_to_remove.append(i)
                    stats["removed_footers"] += 1
                    break

        # Remove footers
        for i in reversed(lines_to_remove):
            if i < len(optimized_lines):
                optimized_lines.pop(i)

    # Step 3: Format-specific optimizations
    if format_type in {"csv", "markdown_table"}:
        # Remove redundant column separators
        optimized_lines = [re.sub(r"\s*\|\s*", "|", line) for line in optimized_lines]
        stats["whitespace_trimmed"] = sum(1 for line in optimized_lines if "|" in line)

    elif format_type == "json":
        # Compact JSON formatting (remove extra spaces around : and ,)
        content_joined = "\n".join(optimized_lines)
        content_joined = re.sub(r"\s*:\s*", ":", content_joined)
        content_joined = re.sub(r"\s*,\s*", ",", content_joined)
        optimized_lines = content_joined.splitlines()
        stats["whitespace_trimmed"] = len(optimized_lines)

    # Step 4: Trim trailing whitespace from all lines
    optimized_lines = [line.rstrip() for line in optimized_lines]

    # Step 5: Remove redundant separators (multiple dashes, equals, etc.)
    final_lines = []
    prev_separator = False
    for line in optimized_lines:
        # Check if line is just separators
        if re.match(r"^[\s\-=_*#]{3,}$", line):
            if not prev_separator:
                final_lines.append(line[:20])  # Keep shortened separator
                prev_separator = True
            else:
                stats["redundant_removed"] += 1
        else:
            final_lines.append(line)
            prev_separator = False

    # Step 6: For markdown, optimize heading spacing
    if format_type == "markdown" or "markdown" in format_type:
        compressed: list[str] = []
        for i, line in enumerate(final_lines):
            # Remove blank lines before headings (markdown renders spacing)
            if line.startswith("#") and i > 0 and compressed and compressed[-1] == "":
                compressed.pop()
                stats["removed_blank_lines"] += 1
            compressed.append(line)
        final_lines = compressed

    # Join back together
    optimized_content = "\n".join(final_lines)

    # Calculate final stats with exact token counts
    final_token_count = estimate_tokens(optimized_content, model)
    final_tokens = final_token_count.get("exact_tokens") or final_token_count.get("estimated_tokens", 0)

    stats["final_length"] = len(optimized_content)
    stats["final_lines"] = len(final_lines)
    stats["final_tokens"] = final_tokens
    stats["bytes_saved"] = original_length - stats["final_length"]
    stats["tokens_saved"] = initial_tokens - final_tokens
    stats["percentage_saved"] = round((stats["bytes_saved"] / original_length * 100), 1) if original_length > 0 else 0
    stats["token_percentage_saved"] = (
        round((stats["tokens_saved"] / initial_tokens * 100), 1) if initial_tokens > 0 else 0
    )

    return optimized_content, stats


def handle_rate_limit(func, *args, logger=None, **kwargs):
    """
    Handle rate limiting with exponential backoff.

    Args:
        func: The function to call (typically azure_client.responses.create)
        *args: Positional arguments for the function
        logger: Logger instance for logging (optional)
        **kwargs: Keyword arguments for the function

    Returns:
        The response from the function

    Raises:
        Exception if max retries exceeded
    """
    retry_count = 0
    last_error = None

    def _call_safely(callable_func, *f_args, **f_kwargs):
        try:
            return callable_func(*f_args, **f_kwargs), None
        except Exception as exc:
            return None, exc

    while retry_count < RATE_LIMIT_RETRY_MAX:
        # Log attempt
        if retry_count > 0 and logger:
            logger.info(f"Retry attempt {retry_count}/{RATE_LIMIT_RETRY_MAX}")

        # Attempt the API call without try/except in the loop
        response, error = _call_safely(func, *args, **kwargs)

        if error is None:
            # Log token usage if available
            if logger and hasattr(response, "usage") and response.usage:
                logger.info(
                    f"Tokens used - Prompt: {response.usage.prompt_tokens}, "
                    f"Completion: {response.usage.completion_tokens}, "
                    f"Total: {response.usage.total_tokens}"
                )
            return response

        # Handle error
        error_str = str(error)
        last_error = error

        # Check if it's a rate limit error
        if "rate limit" in error_str.lower() or "429" in error_str:
            # Calculate exponential backoff with cap
            wait_time = min(RATE_LIMIT_BASE_DELAY * (2**retry_count), RATE_LIMIT_MAX_WAIT)

            # Send UI notification about rate limit
            msg = json.dumps(
                {
                    "type": "rate_limit_hit",
                    "retry_count": retry_count + 1,
                    "wait_time": wait_time,
                    "message": f"Rate limit hit. Waiting {wait_time}s before retry...",
                }
            )
            print(f"__JSON__{msg}__JSON__", flush=True)

            if logger:
                logger.warning(f"Rate limit hit. Waiting {wait_time}s before retry {retry_count + 1}")
            time.sleep(wait_time)
            retry_count += 1
        else:
            # Not a rate limit error, re-raise
            raise error

    # Max retries exceeded
    error_msg = f"Rate limit retry max ({RATE_LIMIT_RETRY_MAX}) exceeded"
    if logger:
        logger.error(error_msg)
    msg = json.dumps(
        {
            "type": "rate_limit_failed",
            "message": error_msg,
        }
    )
    print(f"__JSON__{msg}__JSON__", flush=True)
    raise last_error if last_error else Exception(error_msg)
