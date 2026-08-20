"""app/xdeploy — Hub .xdeploy réel.

Implémente le contrat REST proposé et documenté dans
xcore_agent/agent/hub_client.py (HttpHubClient), côté xcore-agent : jusqu'ici
ce contrat n'était branché à aucun vrai serveur ("XCore Hub itself does not
exist yet" — voir le docstring de ce module côté agent). C'est ce plugin qui
comble ce trou, en réutilisant xdevkeys pour l'authentification (xdevkey +
deployment_credential) et app/xdeployments comme journal partagé.

Ne remplace PAS le flux marketplace (app/marketplace/src/routes/install.py +
agent/marketplace_client.py) — celui-ci reste le contrat réel et déjà validé
pour un seul plugin/service à la fois, non chiffré. `.xdeploy` sert les
projets multi-plugins scellés (voir xcore-agent build/deploy).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from xcore.sdk import AutoDispatchMixin, TrustedBase

from .models import Base
from .routes.hub import hub_router

logger = logging.getLogger("hub.xdeploy")


class Plugin(AutoDispatchMixin, TrustedBase):
    async def on_load(self) -> None:
        self.app = APIRouter()
        db = self.get_service("db")
        env = self.ctx.env

        kek_hex = env.get("XDEPLOY_KEK", "")
        if not kek_hex:
            logger.warning(
                "[xdeploy] XDEPLOY_KEK absent — clé de repli non sécurisée "
                "utilisée, à ne JAMAIS garder en production"
            )
            kek = b"insecure-dev-kek-change-in-prod"
        else:
            kek = bytes.fromhex(kek_hex) if len(kek_hex) == 64 else kek_hex.encode()

        session_secret_raw = env.get("XDEPLOY_SESSION_SECRET", "")
        if not session_secret_raw:
            logger.warning(
                "[xdeploy] XDEPLOY_SESSION_SECRET absent — clé de repli non "
                "sécurisée utilisée, à ne JAMAIS garder en production"
            )
            session_secret = b"insecure-dev-session-secret-change-in-prod"
        else:
            session_secret = session_secret_raw.encode()

        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[xdeploy] Tables créées / vérifiées")

        self.app.include_router(
            hub_router(db, ctx=self.call_plugin, kek=kek, session_secret=session_secret)
        )
        logger.info("[xdeploy] Prêt — /v1/auth /v1/projects/{id}/publish /v1/projects/{id}/artifacts/{version} /v1/deployments/authorize /v1/deployments/report")

    async def on_unload(self) -> None:
        logger.info("[xdeploy] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
