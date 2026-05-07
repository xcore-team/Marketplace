from __future__ import annotations

from sqlalchemy import select
from xcore.sdk import AutoDispatchMixin, action, error, ok, validate_payload

GET_PLUGIN_SCHEMA = {"slug": (str, ...)}
GET_SUBMISSION_SCHEMA = {"submission_id": (str, ...)}
LIST_PLUGINS_SCHEMA = {"limit": (int, 50), "offset": (int, 0)}


class IPCCommands(AutoDispatchMixin):
    """
    Actions IPC disponibles via call_plugin("marketplace", action, payload).

        await self.call_plugin("marketplace", "market.get_plugin", {"slug": "my-plugin"})
        await self.call_plugin("marketplace", "market.list_plugins", {"limit": 20})
        await self.call_plugin("marketplace", "market.get_submission", {"submission_id": "..."})
    """

    @action("market.get_plugin")
    @validate_payload(GET_PLUGIN_SCHEMA, type_response="model", unset=False)
    async def _ipc_get_plugin(self, payload) -> dict:
        try:
            async with self._db.session() as session:
                from .services.plugin import PluginService

                plugin = await PluginService(session).get_by_slug(payload.slug)
                if plugin is None:
                    return error("Plugin introuvable", code="not_found")
                return ok(plugin={
                    "id": plugin.id,
                    "name": plugin.name,
                    "slug": plugin.slug,
                    "description": plugin.description,
                    "is_published": plugin.is_published,
                    "versions": [
                        {"version": v.version, "anomaly_score": v.anomaly_score,
                         "merkle_root": v.merkle_root, "is_stable": v.is_stable}
                        for v in plugin.versions
                    ],
                })
        except Exception as exc:
            return error(str(exc), code="error")

    @action("market.list_plugins")
    @validate_payload(LIST_PLUGINS_SCHEMA, type_response="model", unset=False)
    async def _ipc_list_plugins(self, payload) -> dict:
        try:
            async with self._db.session() as session:
                from .services.plugin import PluginService

                plugins = await PluginService(session).list_published(
                    limit=payload.limit, offset=payload.offset
                )
                return ok(plugins=[
                    {"id": p.id, "name": p.name, "slug": p.slug, "description": p.description}
                    for p in plugins
                ])
        except Exception as exc:
            return error(str(exc), code="error")

    @action("market.get_submission")
    @validate_payload(GET_SUBMISSION_SCHEMA, type_response="model", unset=False)
    async def _ipc_get_submission(self, payload) -> dict:
        try:
            from .models.submission import Submission

            async with self._db.session() as session:
                sub = await session.scalar(
                    select(Submission).where(Submission.id == payload.submission_id)
                )
                if sub is None:
                    return error("Soumission introuvable", code="not_found")
                return ok(submission={
                    "id": sub.id,
                    "plugin_name": sub.plugin_name,
                    "plugin_version": sub.plugin_version,
                    "status": sub.status,
                    "anomaly_score": sub.anomaly_score,
                    "source": sub.source,
                    "created_at": sub.created_at.isoformat(),
                })
        except Exception as exc:
            return error(str(exc), code="error")
