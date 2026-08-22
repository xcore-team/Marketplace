"""Tests unitaires — check_rate_limit (middleware/submission_limit.py)."""

from __future__ import annotations

from middleware.submission_limit import check_rate_limit


def test_allows_up_to_max_calls():
    for _ in range(3):
        allowed, retry_after = check_rate_limit(
            "test_bucket_a", "user-1", max_calls=3, period_seconds=3600
        )
        assert allowed is True
        assert retry_after == 0


def test_blocks_after_max_calls():
    for _ in range(2):
        check_rate_limit("test_bucket_b", "user-1", max_calls=2, period_seconds=3600)

    allowed, retry_after = check_rate_limit(
        "test_bucket_b", "user-1", max_calls=2, period_seconds=3600
    )
    assert allowed is False
    assert retry_after > 0


def test_buckets_are_independent():
    for _ in range(2):
        check_rate_limit("test_bucket_c1", "user-1", max_calls=2, period_seconds=3600)

    # Un autre bucket pour le même utilisateur n'est pas affecté.
    allowed, _ = check_rate_limit(
        "test_bucket_c2", "user-1", max_calls=2, period_seconds=3600
    )
    assert allowed is True


def test_users_are_independent():
    for _ in range(2):
        check_rate_limit("test_bucket_d", "user-1", max_calls=2, period_seconds=3600)

    allowed, _ = check_rate_limit(
        "test_bucket_d", "user-2", max_calls=2, period_seconds=3600
    )
    assert allowed is True
