from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any


class InMemoryCache:
    """Simple cache baseline for cost control before distributed cache adoption."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[datetime, Any]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if datetime.now(timezone.utc) >= expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        self._store[key] = (expires_at, value)


def cached_lookup(
    cache: InMemoryCache, key: str, ttl_seconds: int, resolver: Callable[[], Any]
) -> Any:
    cached = cache.get(key)
    if cached is not None:
        return cached
    value = resolver()
    cache.set(key, value, ttl_seconds=ttl_seconds)
    return value
