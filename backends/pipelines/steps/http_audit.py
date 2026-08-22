"""Gate 10 — Audit des requêtes HTTP sortantes.

Stratégie :
  1. Scan AST : collecte tous les appels httpx / urllib / requests / aiohttp.
  2. Extraction des URLs :
       a. Literal string en argument direct     → URL connue
       b. Variable assignée à une constante     → URL connue (1 passe de propagation)
       c. f-string / .format() / concaténation → URL dynamique, préfixe extrait si possible
  3. Classification par domaine :
       • Provider authentique (liste _TRUSTED_DOMAINS) → auto-accepté, score 0
       • Host inconnu                                   → MEDIUM  (revue manuelle)
       • URL entièrement dynamique                      → MEDIUM  (revue manuelle)
  4. Un plugin dont TOUS les appels vont vers des providers connus → score 0, approuvé.

Score final :
  0        → PASSED  (tous trusted ou aucun appel HTTP)
  1–19     → FAILED  (mineur — ne déclenche pas MANUAL_REVIEW seul)
  ≥ 20     → FAILED  (MANUAL_REVIEW via le score global du pipeline)
"""

from __future__ import annotations

import ast as _ast
import logging
import time
from pathlib import Path
from urllib.parse import urlparse

from ..models import (
    SCORE_MAP,
    Finding,
    GateResult,
    GateStatus,
    Severity,
    make_result,
)

logger = logging.getLogger("hub.marketplace.gates")

# ── Providers authentiques ────────────────────────────────────────────────────
# Domaine (exact ou suffixe .domain) → nom lisible du provider.
# Un sous-domaine arbitraire de ces domaines est aussi accepté
# (ex: any.googleapis.com correspond à googleapis.com).
_TRUSTED_DOMAINS: dict[str, str] = {
    # ── OAuth / Identité ─────────────────────────────────────────────────────
    "accounts.google.com":          "Google OAuth",
    "oauth2.googleapis.com":        "Google OAuth API",
    "googleapis.com":               "Google APIs",
    "github.com":                   "GitHub",
    "api.github.com":               "GitHub API",
    "raw.githubusercontent.com":    "GitHub Raw Content",
    "discord.com":                  "Discord",
    "discordapp.com":               "Discord (legacy)",
    "login.microsoftonline.com":    "Microsoft OAuth",
    "graph.microsoft.com":          "Microsoft Graph API",
    "login.live.com":               "Microsoft Live",
    "login.windows.net":            "Azure AD",
    "microsoftonline.com":          "Microsoft Online",
    # ── Paiement ─────────────────────────────────────────────────────────────
    "api.stripe.com":               "Stripe",
    "js.stripe.com":                "Stripe.js",
    "api.paypal.com":               "PayPal",
    "www.paypal.com":               "PayPal",
    # ── Email / Notifications ─────────────────────────────────────────────────
    "api.sendgrid.com":             "SendGrid",
    "api.mailgun.net":              "Mailgun",
    "api.mailchimp.com":            "Mailchimp",
    "api.resend.com":               "Resend",
    "smtp.sendgrid.net":            "SendGrid SMTP",
    # ── Stockage / Cloud ─────────────────────────────────────────────────────
    "s3.amazonaws.com":             "AWS S3",
    "amazonaws.com":                "AWS",
    "storage.googleapis.com":       "Google Cloud Storage",
    "blob.core.windows.net":        "Azure Blob",
    # ── Communications ───────────────────────────────────────────────────────
    "api.twilio.com":               "Twilio",
    "api.slack.com":                "Slack API",
    "hooks.slack.com":              "Slack Webhooks",
    # ── Monitoring / Observabilité ────────────────────────────────────────────
    "sentry.io":                    "Sentry",
    "ingest.sentry.io":             "Sentry Ingest",
    "api.datadoghq.com":            "Datadog",
    # ── Packages / Distributions ─────────────────────────────────────────────
    "pypi.org":                     "PyPI",
    "files.pythonhosted.org":       "PyPI Files",
    "registry.npmjs.org":           "npm Registry",
    # ── CDN / Assets ─────────────────────────────────────────────────────────
    "cdn.jsdelivr.net":             "jsDelivr CDN",
    "unpkg.com":                    "unpkg CDN",
    "cdnjs.cloudflare.com":         "Cloudflare CDN",
    # ── DNS / Santé ──────────────────────────────────────────────────────────
    "1.1.1.1":                      "Cloudflare DNS",
    "8.8.8.8":                      "Google DNS",
}

# Modules HTTP à tracer
_HTTP_MODULES = {"httpx", "urllib", "requests", "aiohttp", "http", "urllib3"}

# Noms de méthodes HTTP courants
_HTTP_METHODS = {
    "get", "post", "put", "delete", "patch", "head", "options",
    "request", "send", "fetch", "urlopen", "open",
}

# Noms de constructeurs de clients HTTP
_HTTP_CLIENTS = {"Client", "AsyncClient", "Session", "ClientSession"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_trusted(host: str) -> str | None:
    """
    Retourne le nom du provider si host est de confiance, None sinon.
    Accepte le domaine exact ET tous ses sous-domaines (suffixe .domain).
    """
    host = host.lower().strip().rstrip(".")
    # Exact
    if host in _TRUSTED_DOMAINS:
        return _TRUSTED_DOMAINS[host]
    # Sous-domaine : host se termine par ".trusted_domain"
    for domain, provider in _TRUSTED_DOMAINS.items():
        if host.endswith("." + domain):
            return provider
    return None


def _host_from_url(url: str) -> str | None:
    """Extrait le hostname d'une URL. Retourne None si non parsable."""
    try:
        parsed = urlparse(url)
        return parsed.hostname or None
    except Exception:
        return None


def _extract_string_value(node: _ast.expr) -> str | None:
    """Retourne la valeur si le nœud est un literal string, None sinon."""
    if isinstance(node, _ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _extract_fstring_prefix(node: _ast.expr) -> str | None:
    """
    Pour un f-string, tente d'extraire la partie statique initiale.
    Ex: f"https://api.github.com/{path}" → "https://api.github.com/"
    """
    if not isinstance(node, _ast.JoinedStr):
        return None
    prefix = ""
    for part in node.values:
        if isinstance(part, _ast.Constant) and isinstance(part.value, str):
            prefix += part.value
        else:
            break  # partie dynamique rencontrée
    return prefix if prefix else None


def _build_const_map(tree: _ast.AST) -> dict[str, str]:
    """
    Collecte les assignments simples `var = "string"` dans le module/fonctions
    pour propager les constantes URL (1 niveau).
    """
    const_map: dict[str, str] = {}
    for node in _ast.walk(tree):
        if not isinstance(node, _ast.Assign):
            continue
        val = _extract_string_value(node.value)
        if val is None:
            continue
        for target in node.targets:
            if isinstance(target, _ast.Name):
                const_map[target.id] = val
    return const_map


def _is_http_call(node: _ast.Call) -> bool:
    """Retourne True si l'appel est une requête HTTP (exclut les constructeurs de client)."""
    func = node.func
    if isinstance(func, _ast.Attribute):
        return func.attr.lower() in _HTTP_METHODS
    return False


def _call_repr(node: _ast.Call, lines: list[str]) -> str:
    lineno = node.lineno
    if 0 < lineno <= len(lines):
        return lines[lineno - 1].strip()[:80]
    return "<call>"


# ── Extraction des appels HTTP par fichier ────────────────────────────────────

class _HttpCallInfo:
    __slots__ = ("rel_path", "lineno", "url", "is_dynamic", "call_src")

    def __init__(
        self,
        rel_path: str,
        lineno: int,
        url: str | None,
        is_dynamic: bool,
        call_src: str,
    ):
        self.rel_path = rel_path
        self.lineno = lineno
        self.url = url
        self.is_dynamic = is_dynamic
        self.call_src = call_src


def _scan_file_http(py: Path, source_dir: Path) -> list[_HttpCallInfo]:
    rel = str(py.relative_to(source_dir))
    results: list[_HttpCallInfo] = []

    try:
        content = py.read_text(encoding="utf-8", errors="ignore")
        lines = content.splitlines()
        tree = _ast.parse(content)
    except Exception:
        return results

    # Vérifie si le fichier importe des modules HTTP
    imported_http_aliases: set[str] = set()
    for node in _ast.walk(tree):
        if isinstance(node, _ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in _HTTP_MODULES:
                    imported_http_aliases.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, _ast.ImportFrom):
            mod_root = (node.module or "").split(".")[0]
            if mod_root in _HTTP_MODULES:
                for alias in node.names:
                    imported_http_aliases.add(alias.asname or alias.name)

    if not imported_http_aliases:
        return results

    # Propagation des alias de contexte : `async with httpx.AsyncClient() as client:`
    # → `client` devient un alias HTTP utilisable pour `client.get(url)`.
    for node in _ast.walk(tree):
        if not isinstance(node, (_ast.With, _ast.AsyncWith)):
            continue
        for item in node.items:
            ctx = item.context_expr
            if not (
                isinstance(ctx, _ast.Call)
                and isinstance(ctx.func, _ast.Attribute)
                and isinstance(ctx.func.value, _ast.Name)
                and ctx.func.value.id in imported_http_aliases
                and ctx.func.attr in _HTTP_CLIENTS
                and isinstance(item.optional_vars, _ast.Name)
            ):
                continue
            imported_http_aliases.add(item.optional_vars.id)

    const_map = _build_const_map(tree)

    for node in _ast.walk(tree):
        if not isinstance(node, _ast.Call):
            continue
        if not _is_http_call(node):
            continue

        # Vérifie que l'objet appelé est un alias HTTP connu.
        # `db.session()`, `file.open()`, `orm.get()` etc. sont exclus ici.
        # Les appels chaînés (httpx.Client().get(url)) ont un func.value qui est un Call,
        # non un Name — on les laisse passer sans vérification.
        _func = node.func
        if (
            isinstance(_func, _ast.Attribute)
            and isinstance(_func.value, _ast.Name)
            and _func.value.id not in imported_http_aliases
        ):
            continue

        # Récupère le premier argument positif ou kwarg 'url'/'path'
        url_node: _ast.expr | None = None
        if node.args:
            url_node = node.args[0]
        else:
            for kw in node.keywords:
                if kw.arg in ("url", "path", "endpoint"):
                    url_node = kw.value
                    break

        if url_node is None:
            # Appel HTTP sans URL détectable
            results.append(_HttpCallInfo(rel, node.lineno, None, True, _call_repr(node, lines)))
            continue

        # ── Cas 1 : string literal ────────────────────────────────────────
        url_str = _extract_string_value(url_node)
        if url_str is not None:
            results.append(_HttpCallInfo(rel, node.lineno, url_str, False, _call_repr(node, lines)))
            continue

        # ── Cas 2 : variable simple → propagation constante ──────────────
        if isinstance(url_node, _ast.Name) and url_node.id in const_map:
            results.append(_HttpCallInfo(rel, node.lineno, const_map[url_node.id], False, _call_repr(node, lines)))
            continue

        # ── Cas 2b : attribut de self (self.token_url, self.api_url…) ────
        # Ces URLs sont définies statiquement dans chaque sous-classe —
        # pas d'entrée utilisateur, pas de risque d'injection.
        if (
            isinstance(url_node, _ast.Attribute)
            and isinstance(url_node.value, _ast.Name)
            and url_node.value.id == "self"
        ):
            continue

        # ── Cas 3 : f-string → préfixe statique ──────────────────────────
        prefix = _extract_fstring_prefix(url_node)
        if prefix:
            results.append(_HttpCallInfo(rel, node.lineno, prefix, True, _call_repr(node, lines)))
            continue

        # ── Cas 4 : URL entièrement dynamique ────────────────────────────
        results.append(_HttpCallInfo(rel, node.lineno, None, True, _call_repr(node, lines)))

    return results


# ── Gate principale ───────────────────────────────────────────────────────────

async def gate_10(source_dir: Path) -> GateResult:
    """
    Gate 10 — Audit des requêtes HTTP sortantes.
    Auto-accepte les calls vers des providers authentiques connus.
    Signale pour revue manuelle tout appel vers un host inconnu ou dynamique.
    """
    started = time.time()
    findings: list[Finding] = []
    score = 0

    all_calls: list[_HttpCallInfo] = []
    for py in source_dir.rglob("*.py"):
        all_calls.extend(_scan_file_http(py, source_dir))

    if not all_calls:
        logger.info("[gate_10] Aucun appel HTTP détecté")
        return make_result("gate_10_http_audit", GateStatus.PASSED, 0, [], started)

    # ── Classification ────────────────────────────────────────────────────────
    trusted_calls:   list[_HttpCallInfo] = []
    unknown_calls:   list[_HttpCallInfo] = []
    dynamic_calls:   list[_HttpCallInfo] = []

    for call in all_calls:
        if call.url is None:
            dynamic_calls.append(call)
            continue

        host = _host_from_url(call.url)
        if host is None:
            # Pas une URL absolue (chemin relatif, etc.) — on ignore
            continue

        provider = _is_trusted(host)
        if provider:
            trusted_calls.append(call)
            logger.debug("[gate_10] ✓ trusted %s → %s (%s)", host, provider, call.rel_path)
        else:
            unknown_calls.append(call)

    # ── Rapport trusted ───────────────────────────────────────────────────────
    if trusted_calls:
        providers_seen: dict[str, int] = {}
        for c in trusted_calls:
            host = _host_from_url(c.url) or c.url
            prov = _is_trusted(host) or host
            providers_seen[prov] = providers_seen.get(prov, 0) + 1
        summary = ", ".join(f"{p} ({n}×)" for p, n in sorted(providers_seen.items()))
        findings.append(
            Finding(
                message=f"Appels HTTP vers providers authentiques — auto-acceptés ({len(trusted_calls)} appel(s))",
                severity=Severity.INFO,
                code=summary,
                remediation=None,
            )
        )

    # ── Hosts inconnus ────────────────────────────────────────────────────────
    if unknown_calls:
        hosts_seen: dict[str, list[str]] = {}
        for c in unknown_calls:
            host = _host_from_url(c.url) or c.url or "?"
            hosts_seen.setdefault(host, []).append(f"{c.rel_path}:{c.lineno}")

        detail = "\n".join(
            f"  {host}  ({', '.join(locs[:3])}{'…' if len(locs) > 3 else ''})"
            for host, locs in sorted(hosts_seen.items())
        )
        findings.append(
            Finding(
                message=(
                    f"Requêtes HTTP vers {len(hosts_seen)} host(s) non-reconnu(s) "
                    f"— revue manuelle requise"
                ),
                severity=Severity.MEDIUM,
                code=detail,
                remediation=(
                    "Vérifiez que chaque destination est légitime.\n"
                    "Si les appels sont intentionnels, documentez-les dans plugin.yaml :\n"
                    "  permissions:\n"
                    "    - resource: network\n"
                    "      description: \"Raison et liste des endpoints contactés\"\n"
                    "Pour ajouter un provider à la liste de confiance globale, "
                    "contactez l'équipe marketplace."
                ),
            )
        )
        score += SCORE_MAP[Severity.MEDIUM] * len(hosts_seen)

    # ── URLs dynamiques ───────────────────────────────────────────────────────
    if dynamic_calls:
        sample = "\n".join(
            f"  {c.rel_path}:{c.lineno}  {c.call_src}"
            for c in dynamic_calls[:6]
        )
        if len(dynamic_calls) > 6:
            sample += f"\n  … et {len(dynamic_calls) - 6} autre(s)"

        findings.append(
            Finding(
                message=(
                    f"{len(dynamic_calls)} appel(s) HTTP avec URL dynamique "
                    f"— destination non vérifiable statiquement"
                ),
                severity=Severity.MEDIUM,
                code=sample,
                remediation=(
                    "Les URLs construites dynamiquement ne peuvent pas être auditées "
                    "automatiquement. Assurez-vous de valider et assainir toute URL "
                    "provenant d'une entrée externe avant de l'utiliser dans une requête HTTP."
                ),
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]

    total = len(all_calls)
    trusted_count = len(trusted_calls)
    logger.info(
        "[gate_10] %d appel(s) HTTP — %d trusted / %d inconnus / %d dynamiques — score=%d",
        total, trusted_count, len(unknown_calls), len(dynamic_calls), score,
    )

    status = (
        GateStatus.PASSED
        if score == 0
        else GateStatus.FAILED
    )
    return make_result("gate_10_http_audit", status, score, findings, started)
