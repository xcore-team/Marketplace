"""
Constantes partagées pour l'extension xmailproxy.
"""

from __future__ import annotations

# Actions marketplace → template name (rétrocompatibilité)
MARKETPLACE_TEMPLATES: dict[str, str] = {
    "submission_received":    "marketplace_submission_received",
    "pipeline_approved":      "marketplace_pipeline_approved",
    "pipeline_rejected":      "marketplace_pipeline_rejected",
    "pipeline_manual_review": "marketplace_pipeline_manual_review",
    "pipeline_failed":        "marketplace_pipeline_failed",
    "admin_new_submission":   "marketplace_admin_new_submission",
    "admin_approved":         "marketplace_admin_approved",
    "admin_rejected":         "marketplace_admin_rejected",
    "admin_manual_review":    "marketplace_admin_manual_review",
}

# Actions qui copient les admins en plus du dev
NOTIFY_ADMIN: set[str] = {
    "pipeline_approved",
    "pipeline_rejected",
    "pipeline_manual_review",
}