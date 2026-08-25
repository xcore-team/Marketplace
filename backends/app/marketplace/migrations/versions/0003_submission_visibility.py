"""Ajoute visibility à market_submissions

Revision ID: 0003_submission_visibility
Revises: 0002_tenant_id
Create Date: 2026-08-20

PluginService.create() acceptait déjà un paramètre visibility (utilisé côté
xservices/ServiceSubmission), mais rien ne le renseignait côté plugins —
Submission n'avait pas cette colonne, donc toute publication finissait
"public" quel que soit le choix du développeur (voir models/submission.py,
routes/github.py, routes/submissions.py, tasks.py). Idempotente comme
0001/0002 — create_all() a déjà créé la colonne sur une base neuve.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_submission_visibility"
down_revision = "0002_tenant_id"
branch_labels = None
depends_on = None

_TABLE = "market_submissions"


def _existing_columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(_TABLE)}


def upgrade() -> None:
    if "visibility" not in _existing_columns():
        op.add_column(
            _TABLE,
            sa.Column("visibility", sa.String(16), nullable=False, server_default="public"),
        )


def downgrade() -> None:
    if "visibility" in _existing_columns():
        op.drop_column(_TABLE, "visibility")
