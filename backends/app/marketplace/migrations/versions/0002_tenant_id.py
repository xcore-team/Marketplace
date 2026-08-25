"""Renomme organization_id en tenant_id sur market_plugins

Revision ID: 0002_tenant_id
Revises: 0001_plugin_visibility
Create Date: 2026-08-19

Réconciliation xorgs -> app/auth Tenant (voir models/plugin.py) : le plugin
xorgs est retiré, sa notion d'organisation cède la place au tenant déjà
utilisé partout ailleurs (JWT, RBAC, invites). Aucune donnée réelle à migrer
au moment de cette révision (organization_id n'a jamais été peuplé en
production) — DROP + ADD plutôt qu'un rename, pour rester simple et éviter
le mode batch SQLite. Idempotente comme 0001, pour la même raison
(create_all() a déjà créé tenant_id sur une base neuve).
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_tenant_id"
down_revision = "0001_plugin_visibility"
branch_labels = None
depends_on = None

_TABLE = "market_plugins"


def _existing_columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(_TABLE)}


def upgrade() -> None:
    columns = _existing_columns()

    if "organization_id" in columns:
        op.drop_index("ix_market_plugins_organization_id", table_name=_TABLE)
        op.drop_column(_TABLE, "organization_id")
    if "tenant_id" not in columns:
        op.add_column(_TABLE, sa.Column("tenant_id", sa.String(36), nullable=True))
        op.create_index("ix_market_plugins_tenant_id", _TABLE, ["tenant_id"])


def downgrade() -> None:
    columns = _existing_columns()

    if "tenant_id" in columns:
        op.drop_index("ix_market_plugins_tenant_id", table_name=_TABLE)
        op.drop_column(_TABLE, "tenant_id")
    if "organization_id" not in columns:
        op.add_column(_TABLE, sa.Column("organization_id", sa.String(36), nullable=True))
        op.create_index("ix_market_plugins_organization_id", _TABLE, ["organization_id"])
