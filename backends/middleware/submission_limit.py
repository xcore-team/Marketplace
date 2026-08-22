from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

# 10 soumissions max par utilisateur par heure
_MAX_SUBMISSIONS = 10
_PERIOD_SECONDS = 3600

_store: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def check_submission_rate(user_id: str) -> tuple[bool, int]:
    """Retourne (allowed, retry_after_seconds)."""
    return check_rate_limit(
        "submissions",
        user_id,
        max_calls=_MAX_SUBMISSIONS,
        period_seconds=_PERIOD_SECONDS,
    )


def check_rate_limit(
    bucket: str, key: str, *, max_calls: int, period_seconds: int
) -> tuple[bool, int]:
    """Limiteur de débit générique en mémoire, fenêtre glissante.

    `bucket` isole des compteurs indépendants (ex: "submissions", "ci_recompute",
    "org_invitations") pour qu'un même utilisateur ait un quota distinct par
    fonctionnalité — épuiser le quota de soumissions ne doit pas bloquer les
    invitations. Retourne (allowed, retry_after_seconds).

    En mémoire process-local — suffisant pour un seul worker API ; à migrer vers
    Redis si le service tourne un jour derrière plusieurs instances.
    """
    now = time.monotonic()
    window_start = now - period_seconds
    store_key = f"{bucket}:{key}"

    with _lock:
        timestamps = _store[store_key]
        _store[store_key] = [t for t in timestamps if t > window_start]
        if len(_store[store_key]) >= max_calls:
            retry_after = int(period_seconds - (now - _store[store_key][0]))
            return False, max(retry_after, 1)
        _store[store_key].append(now)
        return True, 0
