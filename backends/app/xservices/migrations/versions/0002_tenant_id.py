"""Renomme organization_id en tenant_id sur xsvc_services et xsvc_submissions

Revision ID: 0002_tenant_id
Revises: 0001_service_visibility
Create Date: 2026-08-19

Réconciliation xorgs -> app/auth Tenant — voir la révision équivalente dans
app/marketplace/migrations/versions/0002_tenant_id.py, même raisonnement
(aucune donnée réelle à migrer, DROP + ADD plutôt qu'un rename).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_tenant_id"
down_revision = "0001_service_visibility"
branch_labels = None
depends_on = None


def _existing_columns(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    services_columns = _existing_columns("xsvc_services")
    if "organization_id" in services_columns:
        op.drop_index("ix_xsvc_services_organization_id", table_name="xsvc_services")
        op.drop_column("xsvc_services", "organization_id")
    if "tenant_id" not in services_columns:
        op.add_column("xsvc_services", sa.Column("tenant_id", sa.String(36), nullable=True))
        op.create_index("ix_xsvc_services_tenant_id", "xsvc_services", ["tenant_id"])

    submissions_columns = _existing_columns("xsvc_submissions")
    if "organization_id" in submissions_columns:
        op.drop_column("xsvc_submissions", "organization_id")
    if "tenant_id" not in submissions_columns:
        op.add_column("xsvc_submissions", sa.Column("tenant_id", sa.String(36), nullable=True))


def downgrade() -> None:
    submissions_columns = _existing_columns("xsvc_submissions")
    if "tenant_id" in submissions_columns:
        op.drop_column("xsvc_submissions", "tenant_id")
    if "organization_id" not in submissions_columns:
        op.add_column(
            "xsvc_submissions", sa.Column("organization_id", sa.String(36), nullable=True)
        )

    services_columns = _existing_columns("xsvc_services")
    if "tenant_id" in services_columns:
        op.drop_index("ix_xsvc_services_tenant_id", table_name="xsvc_services")
        op.drop_column("xsvc_services", "tenant_id")
    if "organization_id" not in services_columns:
        op.add_column(
            "xsvc_services", sa.Column("organization_id", sa.String(36), nullable=True)
        )
        op.create_index(
            "ix_xsvc_services_organization_id", "xsvc_services", ["organization_id"]
        )
