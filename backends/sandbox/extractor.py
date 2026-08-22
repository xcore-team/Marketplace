"""sandbox/extractor.py — Décompression sécurisée d'un plugin vers /tmp."""

from __future__ import annotations

import shutil
import uuid
import zipfile
from pathlib import Path

# Taille maximale extraite autorisée (100 MB)
MAX_EXTRACTED_BYTES = 100 * 1024 * 1024


class ExtractionError(Exception):
    pass


def extract_plugin(zip_path: str | Path) -> Path:
    """
    Extrait une archive ZIP vers /tmp/<uuid>/ et retourne le répertoire.

    Raises:
        ExtractionError: si le fichier est invalide, trop grand, ou contient des chemins suspects (zip-slip).
    """
    zip_path = Path(zip_path)
    if not zip_path.is_file():
        raise ExtractionError(f"Archive introuvable : {zip_path}")

    if not zipfile.is_zipfile(zip_path):
        raise ExtractionError(f"Fichier invalide (non-ZIP) : {zip_path}")

    dest = Path("/tmp") / f"xcore_sandbox_{uuid.uuid4().hex}"
    dest.mkdir(parents=True, exist_ok=False)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            _check_members(zf, dest)
            zf.extractall(dest)
    except ExtractionError:
        shutil.rmtree(dest, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(dest, ignore_errors=True)
        raise ExtractionError(f"Erreur lors de l'extraction : {exc}") from exc

    return _resolve_root(dest)


def cleanup(extracted_dir: Path) -> None:
    """Supprime le répertoire temporaire extrait."""
    shutil.rmtree(extracted_dir, ignore_errors=True)


# ─── helpers ────────────────────────────────────────────────────────────────


def _resolve_root(dest: Path) -> Path:
    """Trouve le répertoire contenant plugin.yaml, quelle que soit la profondeur."""
    matches = list(dest.rglob("plugin.yaml"))
    if not matches:
        # Pas de plugin.yaml — fallback sur unique sous-dossier ou racine
        children = [p for p in dest.iterdir() if not p.name.startswith(".")]
        if len(children) == 1 and children[0].is_dir():
            return children[0]
        return dest
    if len(matches) > 1:
        # Plusieurs plugin.yaml — on prend le plus proche de la racine
        matches.sort(key=lambda p: len(p.parts))
    return matches[0].parent


def _check_members(zf: zipfile.ZipFile, dest: Path) -> None:
    total = 0
    for info in zf.infolist():
        # Zip-slip protection
        target = (dest / info.filename).resolve()
        if not str(target).startswith(str(dest.resolve())):
            raise ExtractionError(f"Chemin suspect détecté (zip-slip) : {info.filename}")

        total += info.file_size
        if total > MAX_EXTRACTED_BYTES:
            raise ExtractionError(
                f"Archive trop grande : {total} octets > limite {MAX_EXTRACTED_BYTES}"
            )
