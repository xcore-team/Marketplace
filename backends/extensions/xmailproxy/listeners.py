"""
Listeners — réception des messages depuis ext.pubsub ou Redis direct.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from xcore.sdk import get_logger

logger = get_logger("xcore.mail_proxy")


class ListenersMixin:
    """
    Mixin fournissant les boucles d'écoute Redis / ext.pubsub.

    Attend que la classe hôte expose :
        - self._pubsub_ext
        - self._redis
        - self._channels
        - self._dispatch(data: dict) -> Awaitable[None]   (fourni par DispatchMixin)
    """

    _pubsub_ext: Any
    _redis: Any
    _channels: list[str]

    async def _listen_pubsub(self, channel: str) -> None:
        """Listener via ext.pubsub.provider.stream() — supporte Redis/HiveMQ/Memory."""
        logger.debug("[mail_proxy] Écoute pubsub canal '%s'", channel)
        try:
            async for sse_chunk in self._pubsub_ext.provider.stream(channel, user_id=None):
                # Le provider yield des strings SSE : "data: {...}\n\n"
                for line in sse_chunk.splitlines():
                    if line.startswith("data:"):
                        raw = line[len("data:"):].strip()
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            logger.warning("[mail_proxy] Chunk pubsub non-JSON ignoré")
                            continue
                        asyncio.create_task(self._dispatch(data))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("[mail_proxy] Erreur listener pubsub canal '%s' : %s", channel, exc)

    async def _listen_redis(self) -> None:
        """Listener Redis direct (fallback quand ext.pubsub n'est pas câblé)."""
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(*self._channels)
        logger.debug("[mail_proxy] Souscrit Redis à %s", self._channels)

        try:
            while True:
                try:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if msg and msg["type"] == "message":
                        try:
                            data = json.loads(msg["data"])
                        except json.JSONDecodeError:
                            logger.warning("[mail_proxy] Message non-JSON ignoré")
                            continue
                        asyncio.create_task(self._dispatch(data))
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.error("[mail_proxy] Erreur listener Redis : %s", exc)
                    await asyncio.sleep(1)
        finally:
            await pubsub.unsubscribe(*self._channels)
            await pubsub.close()