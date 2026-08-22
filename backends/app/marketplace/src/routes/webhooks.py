from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, HttpUrl
from sqlalchemy import select
from xcore.kernel.api import AuthPayload, get_current_user

from ..models.webhook import DeveloperWebhook


class WebhookCreate(BaseModel):
    url: HttpUrl
    secret: Optional[str] = None
    events: str = "*"


class WebhookOut(BaseModel):
    id: str
    url: str
    events: str
    is_active: bool
    created_at: datetime
    last_triggered_at: Optional[datetime] = None
    last_status_code: Optional[int] = None
    last_error: Optional[str] = None

    model_config = {"from_attributes": True}


def webhooks_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/webhooks", tags=["webhooks"])

    @router.get("", response_model=List[WebhookOut])
    async def list_webhooks(user: AuthPayload = Depends(get_current_user)) -> Any:
        """Liste les webhooks du développeur connecté."""
        async with db.session() as session:
            result = await session.execute(
                select(DeveloperWebhook)
                .where(DeveloperWebhook.developer_id == user["sub"])
                .order_by(DeveloperWebhook.created_at.desc())
            )
            return list(result.scalars().all())

    @router.post("", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
    async def create_webhook(
        body: WebhookCreate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Enregistre un webhook. Événements : approved, rejected, manual_review, ou * pour tout."""
        async with db.session() as session:
            wh = DeveloperWebhook(
                developer_id=user["sub"],
                url=str(body.url),
                secret=body.secret,
                events=body.events,
            )
            session.add(wh)
            await session.commit()
            await session.refresh(wh)
            return wh

    @router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_webhook(
        webhook_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> None:
        async with db.session() as session:
            wh = await session.scalar(
                select(DeveloperWebhook)
                .where(DeveloperWebhook.id == webhook_id, DeveloperWebhook.developer_id == user["sub"])
            )
            if wh is None:
                raise HTTPException(status_code=404, detail="Webhook introuvable")
            await session.delete(wh)
            await session.commit()

    @router.patch("/{webhook_id}/toggle", response_model=WebhookOut)
    async def toggle_webhook(
        webhook_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        async with db.session() as session:
            wh = await session.scalar(
                select(DeveloperWebhook)
                .where(DeveloperWebhook.id == webhook_id, DeveloperWebhook.developer_id == user["sub"])
            )
            if wh is None:
                raise HTTPException(status_code=404, detail="Webhook introuvable")
            wh.is_active = not wh.is_active
            await session.commit()
            await session.refresh(wh)
            return wh

    return router
