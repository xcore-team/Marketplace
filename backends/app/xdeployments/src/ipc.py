"""IPC actions exposées par xdeployments aux autres plugins."""
from __future__ import annotations

from xcore.sdk import AutoDispatchMixin, action, error, ok, validate_payload

_PURGE_SCHEMA = {
    "keep_per_bucket": (int, 50),
    "max_age_days": (int, 90),
}


class IPCCommands(AutoDispatchMixin):
    """
    Actions disponibles via call_plugin("xdeployments", action, payload).

        await self.call_plugin("xdeployments", "deployments.purge", {"keep_per_bucket": 50})
    """

    @action("deployments.purge")
    @validate_payload(_PURGE_SCHEMA, type_response="model", unset=False)
    async def _ipc_purge(self, payload) -> dict:
        try:
            async with self._db.session() as session:
                from .services.deployment import DeploymentService
                deleted = await DeploymentService(session).purge_old(
                    keep_per_bucket=payload.keep_per_bucket,
                    max_age_days=payload.max_age_days,
                )
                await session.commit()
                return ok(deleted=deleted)
        except Exception as exc:
            return error(str(exc), code="error")
