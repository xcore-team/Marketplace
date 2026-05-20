"""Chiffrement symétrique léger pour les signing keys (XOR + PBKDF2)."""
from __future__ import annotations

import hashlib
import os


def encrypt_secret(plaintext: str, master_key: bytes, user_id: str) -> str:
    """Chiffre `plaintext` et retourne un hex (salt||ciphertext)."""
    data = plaintext.encode()
    salt = os.urandom(16)
    keystream = hashlib.pbkdf2_hmac(
        "sha256", master_key + user_id.encode(), salt, 100_000, dklen=len(data)
    )
    ct = bytes(a ^ b for a, b in zip(data, keystream))
    return (salt + ct).hex()


def decrypt_secret(ciphertext_hex: str, master_key: bytes, user_id: str) -> str:
    """Déchiffre un hex produit par encrypt_secret."""
    raw = bytes.fromhex(ciphertext_hex)
    salt, ct = raw[:16], raw[16:]
    keystream = hashlib.pbkdf2_hmac(
        "sha256", master_key + user_id.encode(), salt, 100_000, dklen=len(ct)
    )
    return bytes(a ^ b for a, b in zip(ct, keystream)).decode()
