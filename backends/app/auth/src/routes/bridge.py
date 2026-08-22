from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from ..utils.deeplink import ALLOWED_BRIDGE_SCHEMES


def bridge_router(app_name: str) -> APIRouter:
    router = APIRouter(tags=["bridge"])

    @router.get("/redirect", response_class=HTMLResponse)
    async def redirect_bridge(target: str, title: str | None = None, message: str | None = None) -> Any:
        """
        Page de rebond https générique : reçoit une cible http(s) et affiche un
        bouton pour continuer dessus. Ne gère plus aucun deep-link desktop
        (`erp://...`) — ce produit est 100% web, sans app associée à ouvrir ;
        voir ALLOWED_BRIDGE_SCHEMES.
        """
        # Import différé pour éviter un cycle d'import au chargement du module
        # (services.email.__init__ importe les senders, qui importent
        # ..utils.deeplink — jamais routes.bridge, mais on garde ce module
        # sans dépendance descendante vers services par prudence).
        from ..services.email.base import _render

        scheme = urlsplit(target).scheme
        if scheme not in ALLOWED_BRIDGE_SCHEMES:
            raise HTTPException(
                status_code=400,
                detail=f"Schéma de retour non autorisé : '{scheme or target}'.",
            )

        html = _render(
            "redirect_bridge",
            {
                "app_name": app_name,
                "title": title or f"Retour vers {app_name}",
                "message": message or "Continuez vers votre destination.",
                "deep_link": target,
                "status": "success",
                "badge_label": "Redirection",
            },
        )
        return HTMLResponse(content=html)

    return router
