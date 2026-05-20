from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.api_key import ApiKey


_PREFIX = "xdk_"


def _generate_raw() -> str:
    return _PREFIX + secrets.token_urlsafe(48)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _make_prefix(raw: str) -> str:
    # "xdk_" + les 8 premiers chars du token
    return raw[:12]


class ApiKeyService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(self, user_id: str, name: str) -> tuple[ApiKey, str]:
        """Génère une clé et retourne (record, raw_key). raw_key affiché une seule fois."""
        raw = _generate_raw()
        record = ApiKey(
            user_id=user_id,
            name=name,
            prefix=_make_prefix(raw),
            key_hash=_hash_key(raw),
        )
        self._s.add(record)
        await self._s.flush()
        return record, raw

    async def list_by_user(self, user_id: str) -> list[ApiKey]:
        result = await self._s.execute(
            select(ApiKey)
            .where(ApiKey.user_id == user_id, ApiKey.is_active == True)
            .order_by(ApiKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def revoke(self, key_id: str, user_id: str) -> bool:
        record = await self._s.scalar(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
        )
        if record is None:
            return False
        record.is_active = False
        return True

    async def authenticate(self, raw_key: str) -> Optional[ApiKey]:
        """Vérifie la clé brute — met à jour last_used_at si valide."""
        key_hash = _hash_key(raw_key)
        record = await self._s.scalar(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
        )
        if record:
            record.last_used_at = datetime.utcnow()
        return record
