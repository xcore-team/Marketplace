from __future__ import annotations

from ..base import EmailTransport


class InviteEmailSender(EmailTransport):
    """Emails liés aux invitations."""

    async def send_invitation(
        self,
        to: str,
        invite_token: str,
        tenant_name: str,
        invited_by: str,
        expires_hours: int = 72,
    ) -> bool:
        # XCoreHub est un produit 100% web (pas d'app desktop associée,
        # contrairement à "ERP" dont ce plugin auth est issu à l'origine) —
        # lien direct vers la route du frontend (InviteAcceptPage.tsx,
        # /invite/:token), jamais un deep-link erp:// : celui-ci ouvrait un
        # dialogue "Ouvrir xdg-open ?" dans le navigateur du destinataire,
        # qui n'a évidemment aucune app enregistrée pour ce schéma.
        accept_url = f"{self.web_app_url}/invite/{invite_token}"
        return await self.send(
            to=to,
            subject=f"Vous êtes invité à rejoindre {tenant_name}",
            template="invitation",
            context={
                "tenant_name": tenant_name,
                "invited_by": invited_by,
                "accept_url": accept_url,
                "expires_hours": expires_hours,
            },
        )
