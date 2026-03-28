from __future__ import annotations

import json
import logging
from typing import Any

import fakeredis.aioredis
import redis.asyncio as redis_async

logger = logging.getLogger(__name__)


class CacheService:
    def __init__(self, redis_url: str | None) -> None:
        self.redis_url = redis_url
        self.client = None
        self.backend = "uninitialized"

    async def connect(self) -> None:
        if not self.redis_url:
            self.client = fakeredis.aioredis.FakeRedis(decode_responses=True)
            self.backend = "fakeredis"
            return

        try:
            client = redis_async.from_url(self.redis_url, decode_responses=True)
            await client.ping()
        except Exception as exc:
            logger.warning("Redis unavailable, falling back to fakeredis: %s", exc)
            self.client = fakeredis.aioredis.FakeRedis(decode_responses=True)
            self.backend = "fakeredis"
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
