"""Gate 7 — Signing (XCore HMAC-SHA256 + Merkle root + Rekor)."""

from __future__ import annotations

import hashlib
import logging
import re
import time
from pathlib import Path

from ..common import _run
from ..models import (
    SCORE_AUTO_REJECT,
    SCORE_MAP,
    Finding,
    GateResult,
    GateStatus,
    Severity,
    make_result,
)

logger = logging.getLogger("hub.marketplace.gates")


def _merkle_root(source_dir: Path) -> str:
    try:
        from xcore.kernel.security.hashing import hash_dir

        return hash_dir(source_dir, algorithm="sha256")
    except ImportError:
        h = hashlib.sha256()
        for p in sorted(source_dir.rglob("*")):
            if p.is_file():
                h.update(p.relative_to(source_dir).as_posix().encode())
                h.update(p.read_bytes())
        return h.hexdigest()


async def gate_7(
    source_dir: Path,
    secret_key: bytes,
    strict: bool = True,
) -> tuple[GateResult, str | None, dict | None]:
    """Retourne (GateResult, merkle_root, sig_bundle)."""
    started = time.time()
    findings: list[Finding] = []
    score = 0
    merkle: str | None = None
    bundle: dict | None = None

    try:
        merkle = _merkle_root(source_dir)
        logger.info(f"[gate_7] Merkle root : {merkle[:16]}…")
    except Exception as e:
        findings.append(
            Finding(f"[SIGNING] Merkle root échoué : {e}", Severity.CRITICAL)
        )
        score += SCORE_MAP[Severity.CRITICAL]
        return (
            make_result("gate_7_signing", GateStatus.BLOCKED, score, findings, started),
            None,
            None,
        )

    try:
        from xcore.kernel.security.signature import sign_plugin, verify_plugin
        from xcore.kernel.security.validation import ManifestValidator

        manifest, _, _ = ManifestValidator().load_and_validate(source_dir)
        sig_path = sign_plugin(manifest, secret_key)
        verify_plugin(manifest, secret_key)
        bundle = {
            "hmac_sha256": sig_path.read_text(),
            "merkle_root": merkle,
            "algo": "HMAC-SHA256",
        }
        logger.info("[gate_7] Signature XCore OK ✅")
    except ImportError:
        import hmac as _hmac

        digest = _hmac.new(secret_key, merkle.encode(), hashlib.sha256).hexdigest()
        bundle = {
            "hmac_sha256": digest,
            "merkle_root": merkle,
            "algo": "HMAC-SHA256-fallback",
        }
    except Exception as e:
        sev = Severity.CRITICAL if strict else Severity.HIGH
        findings.append(Finding(f"[SIGNING] Signature échouée : {e}", sev))
        score += SCORE_MAP[sev]

    if bundle and (source_dir / "plugin.sig").exists():
        rc, stdout, _ = _run(
            [
                "rekor-cli",
                "upload",
                "--artifact",
                str(source_dir / "plugin.sig"),
                "--pki-format",
                "x509",
            ],
            timeout=20,
        )
        if rc == 0:
            m = re.search(r"Index:\s*(\d+)", stdout)
            if m:
                bundle["rekor_log_index"] = int(m.group(1))
                logger.info(f"[gate_7] Rekor index : {m.group(1)}")
        else:
            findings.append(
                Finding(
                    "[SIGNING] Rekor indisponible — log de transparence ignoré",
                    Severity.INFO,
                )
            )

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return (
        make_result("gate_7_signing", status, score, findings, started),
        merkle,
        bundle,
    )
