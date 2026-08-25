"""Ajoute visibility et organization_id à market_plugins

Revision ID: 0001_plugin_visibility
Revises:
Create Date: 2026-08-19

Idempotente à dessein : `Plugin.on_load()` fait `Base.metadata.create_all`
*avant* `runner.upgrade()`, donc sur une base neuve les colonnes existent
déjà (create_all les crée depuis le modèle SQLAlchemy actuel). Cette
migration ne sert donc réellement que pour une base de production existante,
créée avant l'ajout de visibility/organization_id au modèle — d'où la
vérification d'existence avant chaque ADD COLUMN.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_plugin_visibility"
down_revision = None
branch_labels = None
depends_on = None

_TABLE = "market_plugins"


def _existing_columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(_TABLE)}


def upgrade() -> None:
    columns = _existing_columns()

    if "visibility" not in columns:
        op.add_column(
            _TABLE,
            sa.Column("visibility", sa.String(16), nullable=False, server_default="public"),
        )
    if "organization_id" not in columns:
        op.add_column(_TABLE, sa.Column("organization_id", sa.String(36), nullable=True))
        op.create_index(
            "ix_market_plugins_organization_id", _TABLE, ["organization_id"]
        )


def downgrade() -> None:
    columns = _existing_columns()

    if "organization_id" in columns:
        op.drop_index("ix_market_plugins_organization_id", table_name=_TABLE)
        op.drop_column(_TABLE, "organization_id")
    if "visibility" in columns:
        op.drop_column(_TABLE, "visibility")
