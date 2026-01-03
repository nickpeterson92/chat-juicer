"""Unit tests for TTLCache and caching utilities."""

import time

import pytest

from utils.cache import (
    TTLCache,
    cached,
    get_session_cache,
    get_session_list_cache,
)


@pytest.fixture
def cache() -> TTLCache:
    return TTLCache(max_size=5, default_ttl=1.0)


@pytest.mark.asyncio
async def test_cache_set_and_get(cache: TTLCache) -> None:
    """Test basic set and get operations."""
    await cache.set("key1", "value1")
    result = await cache.get("key1")
    assert result == "value1"


@pytest.mark.asyncio
async def test_cache_get_miss(cache: TTLCache) -> None:
    """Test get returns None for missing key."""
    result = await cache.get("nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_cache_expiration(cache: TTLCache) -> None:
    """Test cache entry expires after TTL."""
    cache = TTLCache(max_size=5, default_ttl=0.01)  # 10ms TTL
    await cache.set("key1", "value1")

    # Should be available immediately
    result = await cache.get("key1")
    assert result == "value1"

    # Wait for expiration
    time.sleep(0.02)

    result = await cache.get("key1")
    assert result is None


@pytest.mark.asyncio
async def test_cache_lru_eviction(cache: TTLCache) -> None:
    """Test LRU eviction when cache is full."""
    # Fill cache to max_size (5)
    for i in range(5):
        await cache.set(f"key{i}", f"value{i}")

    # Add one more, should evict oldest (key0)
    await cache.set("key5", "value5")

    # key0 should be evicted
    result = await cache.get("key0")
    assert result is None

    # key5 should exist
    result = await cache.get("key5")
    assert result == "value5"


@pytest.mark.asyncio
async def test_cache_update_existing(cache: TTLCache) -> None:
    """Test updating an existing key."""
    await cache.set("key1", "value1")
    await cache.set("key1", "value2")

    result = await cache.get("key1")
    assert result == "value2"


@pytest.mark.asyncio
async def test_cache_delete(cache: TTLCache) -> None:
    """Test deleting a key."""
    await cache.set("key1", "value1")
    deleted = await cache.delete("key1")
    assert deleted is True

    result = await cache.get("key1")
    assert result is None


@pytest.mark.asyncio
async def test_cache_delete_nonexistent(cache: TTLCache) -> None:
    """Test deleting a nonexistent key returns False."""
    deleted = await cache.delete("nonexistent")
    assert deleted is False


@pytest.mark.asyncio
async def test_cache_clear(cache: TTLCache) -> None:
    """Test clearing all entries."""
    await cache.set("key1", "value1")
    await cache.set("key2", "value2")
    await cache.clear()

    result = await cache.get("key1")
    assert result is None
    result = await cache.get("key2")
    assert result is None


def test_cache_stats(cache: TTLCache) -> None:
    """Test cache statistics."""
    stats = cache.stats()
    assert stats["size"] == 0
    assert stats["max_size"] == 5
    assert stats["hits"] == 0
    assert stats["misses"] == 0


@pytest.mark.asyncio
async def test_cache_stats_hit_rate() -> None:
    """Test cache stats track hits and misses."""
    cache = TTLCache(max_size=5, default_ttl=60.0)

    await cache.set("key1", "value1")
    await cache.get("key1")  # Hit
    await cache.get("key1")  # Hit
    await cache.get("nonexistent")  # Miss

    stats = cache.stats()
    assert stats["hits"] == 2
    assert stats["misses"] == 1
    assert stats["hit_rate"] == "66.7%"


@pytest.mark.asyncio
async def test_cache_custom_ttl(cache: TTLCache) -> None:
    """Test setting custom TTL per entry."""
    await cache.set("key1", "value1", ttl=0.01)  # 10ms
    await cache.set("key2", "value2", ttl=60.0)  # 60s

    time.sleep(0.02)

    # key1 should be expired
    assert await cache.get("key1") is None
    # key2 should still exist
    assert await cache.get("key2") == "value2"


def test_get_session_cache() -> None:
    """Test get_session_cache returns TTLCache."""
    cache = get_session_cache()
    assert isinstance(cache, TTLCache)


def test_get_session_list_cache() -> None:
    """Test get_session_list_cache returns TTLCache."""
    cache = get_session_list_cache()
    assert isinstance(cache, TTLCache)


@pytest.mark.asyncio
async def test_cached_decorator() -> None:
    """Test @cached decorator caches function results."""
    cache = TTLCache(max_size=10, default_ttl=60.0)
    call_count = 0

    @cached(cache, key_fn=lambda x: f"key:{x}")
    async def expensive_function(x: str) -> str:
        nonlocal call_count
        call_count += 1
        return f"result:{x}"

    # First call should execute function
    result1 = await expensive_function("arg1")
    assert result1 == "result:arg1"
    assert call_count == 1

    # Second call should use cache
    result2 = await expensive_function("arg1")
    assert result2 == "result:arg1"
    assert call_count == 1  # Not incremented


@pytest.mark.asyncio
async def test_cached_decorator_none_not_cached() -> None:
    """Test @cached decorator does not cache None results."""
    cache = TTLCache(max_size=10, default_ttl=60.0)
    call_count = 0

    @cached(cache, key_fn=lambda x: f"key:{x}")
    async def returns_none(x: str) -> None:
        nonlocal call_count
        call_count += 1

    await returns_none("arg1")
    await returns_none("arg1")

    # Should have called twice (None not cached)
    assert call_count == 2
