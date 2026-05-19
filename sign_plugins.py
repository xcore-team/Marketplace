#!/usr/bin/env python3
"""
Signe tous les plugins trusted du marketplace.
Usage: uv run python sign_plugins.py [--check]
  --check : vérifie les signatures sans les régénérer
"""

import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

# ── Constantes identiques à xcore/kernel/security/signature.py ───────────────
SIG_FILENAME = "plugin.sig"
SECURITY_IGNORE = {
    "__pycache__",
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    "*.md",
    "*.json",
    "plugin.sig",
    "plugin.yaml",
    "plugin.json",
}

ROOT = Path(__file__).parent


def load_secret() -> bytes:
    env_file = ROOT / ".env"
    if not env_file.exists():
        sys.exit("❌ .env introuvable")
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line.startswith("SECRET_KEY") and "=" in line:
            return line.split("=", 1)[1].strip().strip('"').strip("'").encode()
    sys.exit("❌ SECRET_KEY introuvable dans .env")


def should_ignore(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    if any(part in SECURITY_IGNORE or part.startswith(".") for part in rel.parts):
        return True
    if path.name in SECURITY_IGNORE:
        return True
    if path.suffix in {".pyc", ".pyo"}:
        return True
    if path.is_symlink():
        return True
    return False


def read_manifest(plugin_dir: Path) -> dict:
    yaml_path = plugin_dir / "plugin.yaml"
    if not yaml_path.exists():
        return {}
    # lecture minimale sans dépendance PyYAML
    data = {}
    for line in yaml_path.read_text().splitlines():
        if ":" in line and not line.startswith(" ") and not line.startswith("#"):
            k, _, v = line.partition(":")
            data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def compute_hmac(plugin_dir: Path, entry_point: str, secret_key: bytes) -> str:
    root = plugin_dir.resolve()
    h = hmac.new(secret_key, digestmod=hashlib.sha256)

    # 1. Hash du manifeste
    yaml_path = root / "plugin.yaml"
    if yaml_path.exists():
        h.update(yaml_path.read_bytes())

    # 2. Hash des sources (dossier de l'entry_point)
    src_dir = (root / Path(entry_point).parent).resolve()
    if not src_dir.exists():
        raise FileNotFoundError(f"Répertoire source introuvable : {src_dir}")

    files = sorted(
        p for p in src_dir.rglob("*") if p.is_file() and not should_ignore(p, root)
    )
    for path in files:
        rel = path.relative_to(root).as_posix()
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        with open(path, "rb") as f:
            while chunk := f.read(8192):
                h.update(chunk)
        h.update(b"\0")

    return h.hexdigest()


def sign_plugin(plugin_dir: Path, secret_key: bytes, check_only: bool = False) -> bool:
    manifest = read_manifest(plugin_dir)
    name = manifest.get("name", plugin_dir.name)
    version = manifest.get("version", "0.0.0")
    mode = manifest.get("execution_mode", "")
    entry_point = manifest.get("entry_point", "src/main.py")

    if mode != "trusted":
        print(f"  ⏭  [{name}] mode={mode} — ignoré (non trusted)")
        return True

    try:
        digest = compute_hmac(plugin_dir, entry_point, secret_key)
    except FileNotFoundError as e:
        print(f"  ⚠  [{name}] {e}")
        return False

    sig_path = plugin_dir / SIG_FILENAME

    if check_only:
        if not sig_path.exists():
            print(f"  ❌ [{name}] .sig manquant")
            return False
        try:
            stored = json.loads(sig_path.read_text()).get("digest", "")
        except Exception:
            print(f"  ❌ [{name}] .sig illisible")
            return False
        ok = hmac.compare_digest(digest, stored)
        print(f"  {'✅' if ok else '❌'} [{name}] {'OK' if ok else 'INVALIDE'}")
        return ok

    sig_path.write_text(
        json.dumps(
            {
                "plugin": name,
                "version": version,
                "digest": digest,
                "algo": "HMAC-SHA256",
            },
            indent=2,
        )
    )
    print(f"  ✅ [{name}] v{version} → {sig_path.relative_to(ROOT)}")
    return True


def entry_point():
    check_only = "--check" in sys.argv
    secret_key = load_secret()

    plugins_dir = ROOT / "app"
    plugins = sorted(
        p for p in plugins_dir.iterdir() if p.is_dir() and (p / "plugin.yaml").exists()
    )

    if not plugins:
        print("Aucun plugin trouvé dans app/")
        return

    mode_label = "Vérification" if check_only else "Signature"
    print(f"\n{'─' * 50}")
    print(f"  {mode_label} des plugins — {len(plugins)} trouvé(s)")
    print(f"{'─' * 50}")

    results = [sign_plugin(p, secret_key, check_only) for p in plugins]

    print(f"{'─' * 50}")
    ok = sum(results)
    total = len(results)
    print(f"  {ok}/{total} {'vérifiés' if check_only else 'signés'} avec succès\n")

    if not all(results):
        sys.exit(1)
