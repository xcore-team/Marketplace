"""IPC actions exposées par xdevkeys aux autres plugins."""
from __future__ import annotations

from xcore.sdk import AutoDispatchMixin, action, error, ok, validate_payload

_AUTH_SCHEMA = {"raw_key": (str, ...)}
_SECRET_SCHEMA = {"user_id": (str, ...)}


class IPCCommands(AutoDispatchMixin):
    """
    Actions disponibles via call_plugin("xdevkeys", action, payload).

        await self.call_plugin("xdevkeys", "devkeys.authenticate", {"raw_key": "xdk_..."})
        await self.call_plugin("xdevkeys", "devkeys.get_signing_secret", {"user_id": "..."})
    """

    @action("devkeys.authenticate")
    @validate_payload(_AUTH_SCHEMA, type_response="model", unset=False)
    async def _ipc_authenticate(self, payload) -> dict:
        try:
            async with self._db.session() as session:
                from .services.api_key import ApiKeyService
                record = await ApiKeyService(session).authenticate(payload.raw_key)
                if record is None:
                    return error("Clé API invalide ou révoquée", code="unauthorized")
                await session.commit()
                return ok(user_id=record.user_id, key_id=record.id)
        except Exception as exc:
            return error(str(exc), code="error")

    @action("devkeys.get_signing_secret")
    @validate_payload(_SECRET_SCHEMA, type_response="model", unset=False)
    async def _ipc_get_signing_secret(self, payload) -> dict:
        try:
            async with self._db.session() as session:
                from .services.signing_key import SigningKeyService
                secret = await SigningKeyService(session, self._master_key).get_secret(payload.user_id)
                if secret is None:
                    return error("Aucune clé de signature configurée", code="not_found")
                return ok(secret=secret)
        except Exception as exc:
            return error(str(exc), code="error")
