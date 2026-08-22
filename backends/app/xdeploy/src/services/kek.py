"""Custody de la KEK (Key-Encryption-Key) du Hub — la seule pièce que
xcore-agent ne peut jamais posséder : "The Hub is the only party that ever
holds the KEK" (agent/hub_client.py's docstring côté xcore-agent). Chaque
artefact a son propre DEK (généré par le packer à la construction — voir
packer/builder.py::seal_directory), enveloppé sous cette KEK au moment de la
publication (POST /v1/projects/{id}/publish) et déballé au moment du
déploiement (POST /v1/deployments/authorize), jamais persisté en clair.

AES-256-GCM plutôt que le XOR+PBKDF2 utilisé par xdevkeys pour ses signing
keys HMAC (services/crypto.py côté xdevkeys) : ce périmètre-ci protège des
clés de déchiffrement de code source réel, un enjeu de sécurité plus élevé —
justifie un AEAD standard plutôt que la construction ad hoc déjà en place
ailleurs dans ce repo.
"""
from __future__ import annotations

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class KekError(Exception):
    """DEK illisible sous cette KEK — clé absente/changée, ou ciphertext altéré."""


def wrap_dek(dek: bytes, kek: bytes) -> str:
    """Chiffre `dek` (32 octets) sous `kek` (32 octets) — retourne hex
    (nonce(12) || ciphertext+tag)."""
    nonce = os.urandom(12)
    ciphertext = AESGCM(kek).encrypt(nonce, dek, None)
    return (nonce + ciphertext).hex()


def unwrap_dek(wrapped_hex: str, kek: bytes) -> bytes:
    try:
        raw = bytes.fromhex(wrapped_hex)
        nonce, ciphertext = raw[:12], raw[12:]
        return AESGCM(kek).decrypt(nonce, ciphertext, None)
    except Exception as exc:
        raise KekError(
            "DEK illisible sous la KEK actuelle — XDEPLOY_KEK a peut-être "
            "changé depuis la publication de cet artefact."
        ) from exc
