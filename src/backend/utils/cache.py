"""In-memory TTL cache for performance optimization.

Simple LRU cache with TTL expiration for reducing database queries.
Suitable for single-instance deployments.
"""

from __future__ import annotations

import asyncio
import time

from collections import OrderedDict
from collections.abc import Callable
from functools import wraps
from typing import Any, TypeVar

T = TypeVar("T")


class TTLCache:
    """Simple in-memory cache with TTL and max size.

    Thread-safe for asyncio (uses asyncio.Lock).
    """

    def __init__(self, max_size: int = 1000, default_ttl: float = 60.0) -> None:
        """Initialize cache.

        Args:
            max_size: Maximum number of entries (LRU eviction when exceeded)
            default_ttl: Default time-to-live in seconds
        """
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._lock = asyncio.Lock()
        self._hits = 0
        self._misses = 0

    async def get(self, key: str) -> Any | None:
        """Get value from cache if not expired."""
        async with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None

            value, expires_at = self._cache[key]
            if time.monotonic() > expires_at:
                # Expired
                del self._cache[key]
                self._misses += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._hits += 1
            return value

    async def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Set value in cache with TTL."""
        ttl = ttl if ttl is not None else self._default_ttl
        expires_at = time.monotonic() + ttl

        async with self._lock:
            # Remove old entry if exists
            if key in self._cache:
                del self._cache[key]

            # Evict oldest entries if at capacity
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)

            self._cache[key] = (value, expires_at)

    async def delete(self, key: str) -> bool:
        """Remove entry from cache."""
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    async def clear(self) -> None:
        """Clear all entries."""
        async with self._lock:
            self._cache.clear()

    def stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        total = self._hits + self._misses
        hit_rate = self._hits / total if total > 0 else 0.0
        return {
            "size": len(self._cache),
            "max_size": self._max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": f"{hit_rate:.1%}",
        }


# Global cache instances
_session_cache = TTLCache(max_size=500, default_ttl=60.0)  # Session metadata
_session_list_cache = TTLCache(max_size=100, default_ttl=30.0)  # Session lists per user


def get_session_cache() -> TTLCache:
    """Get the session metadata cache."""
    return _session_cache


def get_session_list_cache() -> TTLCache:
    """Get the session list cache."""
    return _session_list_cache


def cached(
    cache: TTLCache,
    key_fn: Callable[..., str],
    ttl: float | None = None,
) -> Callable[..., Any]:
    """Decorator for caching async function results.

    Args:
        cache: TTLCache instance to use
        key_fn: Function to generate cache key from arguments
        ttl: Optional TTL override

    Example:
        @cached(session_cache, key_fn=lambda session_id: f"session:{session_id}")
        async def get_session(session_id: str) -> dict:
            ...
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            key = key_fn(*args, **kwargs)

            # Try cache first
            cached_value = await cache.get(key)
            if cached_value is not None:
                return cached_value  # type: ignore[no-any-return]

            # Execute function
            result = await func(*args, **kwargs)  # type: ignore[misc]

            # Cache result (only if not None)
            if result is not None:
                await cache.set(key, result, ttl)

            return result  # type: ignore[no-any-return]

        return wrapper  # type: ignore[return-value]

    return decorator
