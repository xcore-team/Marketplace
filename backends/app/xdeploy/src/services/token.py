"""Jeton de session émis par POST /v1/auth — stateless (HMAC-signé, jamais
persisté), pas un JWT RS256 comme app/auth : un jeton par déploiement, sur
la durée d'un seul appel `xcore-agent deploy`, distinct exprès de l'auth
plateforme. Décodé sur chaque requête suivante (validation de signature +
expiration), sans aller-retour DB — un même compromis que celui déjà fait
ailleurs dans ce repo pour des jetons courte durée.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

_TTL_SECONDS = 3600


class TokenError(Exception):
    """Jeton invalide, mal signé ou expiré."""


@dataclass(frozen=True)
class SessionClaims:
    project_id: str
    publisher_id: str


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def issue(session_secret: bytes, *, project_id: str, publisher_id: str) -> str:
    payload = {
        "project_id": project_id,
        "publisher_id": publisher_id,
        "exp": int(time.time()) + _TTL_SECONDS,
    }
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(session_secret, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify(session_secret: bytes, token: str) -> SessionClaims:
    try:
        body, sig = token.split(".", 1)
        expected_sig = _b64(hmac.new(session_secret, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected_sig):
            raise TokenError("signature de session invalide")
        payload = json.loads(_unb64(body))
        if payload["exp"] < time.time():
            raise TokenError("session expirée — relancez `xcore-agent deploy`")
        return SessionClaims(project_id=payload["project_id"], publisher_id=payload["publisher_id"])
    except TokenError:
        raise
    except Exception as exc:
        raise TokenError("jeton de session illisible") from exc
