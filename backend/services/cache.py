from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


class MemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[str, float | None]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        async with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if expires_at is not None and expires_at <= time.monotonic():
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        expires_at = time.monotonic() + ex if ex is not None else None
        async with self._lock:
            self._store[key] = (value, expires_at)

    async def aclose(self) -> None:
        async with self._lock:
            self._store.clear()


class CacheService:
    def __init__(self, redis_url: str | None) -> None:
        self.redis_url = redis_url
        self.client = None
        self.backend = "uninitialized"

    async def connect(self) -> None:
        if not self.redis_url:
            self.client = MemoryCache()
            self.backend = "memory"
            return

        try:
            import redis.asyncio as redis_async

            client = redis_async.from_url(self.redis_url, decode_responses=True)
            await client.ping()
        except Exception as exc:
            logger.warning("Redis unavailable, falling back to memory cache: %s", exc)
            self.client = MemoryCache()
            self.backend = "memory"
            return

        self.client = client
        self.backend = "redis"

    async def close(self) -> None:
        if self.client is not None:
            close_method = getattr(self.client, "aclose", None) or getattr(self.client, "close", None)
            if close_method is not None:
                await close_method()

    async def get_json(self, key: str) -> Any | None:
        if self.client is None:
            return None
        value = await self.client.get(key)
        if value is None:
            return None
        return json.loads(value)

    async def set_json(self, key: str, value: Any, ttl: int) -> None:
        if self.client is None:
            return
        await self.client.set(key, json.dumps(value), ex=ttl)
