"""Ajoute visibility et organization_id à xsvc_services et xsvc_submissions

Revision ID: 0001_service_visibility
Revises:
Create Date: 2026-08-19

Idempotente — voir la note équivalente dans
app/marketplace/migrations/versions/0001_plugin_visibility.py : sur une base
neuve, create_all a déjà créé les colonnes depuis le modèle actuel ; cette
migration ne sert que pour une base de production existante.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_service_visibility"
down_revision = None
branch_labels = None
depends_on = None


def _existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    services_columns = _existing_columns("xsvc_services")
    if "visibility" not in services_columns:
        op.add_column(
            "xsvc_services",
            sa.Column(
                "visibility", sa.String(16), nullable=False, server_default="public"
            ),
        )
    if "organization_id" not in services_columns:
        op.add_column(
            "xsvc_services", sa.Column("organization_id", sa.String(36), nullable=True)
        )
        op.create_index(
            "ix_xsvc_services_organization_id", "xsvc_services", ["organization_id"]
        )

    submissions_columns = _existing_columns("xsvc_submissions")
    if "visibility" not in submissions_columns:
        op.add_column(
            "xsvc_submissions",
            sa.Column(
                "visibility", sa.String(16), nullable=False, server_default="public"
            ),
        )
    if "organization_id" not in submissions_columns:
        op.add_column(
            "xsvc_submissions",
            sa.Column("organization_id", sa.String(36), nullable=True),
        )


def downgrade() -> None:
    submissions_columns = _existing_columns("xsvc_submissions")
    if "organization_id" in submissions_columns:
        op.drop_column("xsvc_submissions", "organization_id")
    if "visibility" in submissions_columns:
        op.drop_column("xsvc_submissions", "visibility")

    services_columns = _existing_columns("xsvc_services")
    if "organization_id" in services_columns:
        op.drop_index("ix_xsvc_services_organization_id", table_name="xsvc_services")
        op.drop_column("xsvc_services", "organization_id")
    if "visibility" in services_columns:
        op.drop_column("xsvc_services", "visibility")
