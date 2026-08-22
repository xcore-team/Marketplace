from __future__ import annotations

from ..base import EmailTransport


class PasswordEmailSender(EmailTransport):
    """Emails liés à la gestion des mots de passe."""

    async def reset(
        self,
        to: str,
        username: str,
        reset_token: str,
        expires_minutes: int = 30,
    ) -> bool:
        # Lien direct vers la route du frontend (AuthPage.tsx lit ?token=
        # pour passer en mode "reset") — même correctif que send_invitation :
        # XCoreHub est 100% web, un deep-link erp://password-reset (hérité du
        # produit desktop "ERP" dont ce plugin auth est issu) n'a aucun sens
        # ici et ouvrait un dialogue "Ouvrir xdg-open ?" chez le destinataire.
        reset_url = f"{self.web_app_url}/auth?token={reset_token}"
        return await self.send(
            to=to,
            subject="Réinitialisation de votre mot de passe",
            template="password_reset",
            context={
                "username": username,
                "reset_url": reset_url,
                "expires_in_minutes": expires_minutes,
            },
        )

    async def changed(self, to: str, username: str) -> bool:
        return await self.send(
            to=to,
            subject="Votre mot de passe a été modifié",
            template="password_changed",
            context={"username": username},
        )
