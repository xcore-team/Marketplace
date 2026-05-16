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
    now = time.monotonic()
    window_start = now - _PERIOD_SECONDS

    with _lock:
        timestamps = _store[user_id]
        _store[user_id] = [t for t in timestamps if t > window_start]
        if len(_store[user_id]) >= _MAX_SUBMISSIONS:
            retry_after = int(_PERIOD_SECONDS - (now - _store[user_id][0]))
            return False, max(retry_after, 1)
        _store[user_id].append(now)
        return True, 0
