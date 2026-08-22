from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import PageOut, UserAdminOut, UserBanRequest, UserGitHubOut, UserRoleAssign


def users_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/users", tags=["admin:users"])

    @router.get("", response_model=PageOut[UserAdminOut])
    async def list_users(
        search: Optional[str] = Query(None, description="Recherche par email"),
        is_active: Optional[bool] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        current_user: AuthPayload = Depends(require_permission("user:list")),
    ) -> Any:
        async with db.session() as session:
            params = {
                "search": search,
                "pattern": f"%{search}%" if search else None,
                "is_active": is_active,
                "limit": limit,
                "offset": offset,
            }
            total_row = await session.execute(
                sql_text("""
                    SELECT COUNT(*) AS n FROM xauth_users u
                    WHERE (:search IS NULL OR u.email LIKE :pattern)
                    AND (:is_active IS NULL OR u.is_active = :is_active)
                """),
                params,
            )
            total = total_row.fetchone().n
            rows = await session.execute(
                sql_text("""
                    SELECT
                        u.id, u.email, u.is_active, u.mfa_enabled, u.created_at,
                        COUNT(DISTINCT p.id) AS plugin_count,
                        COUNT(DISTINCT s.id) AS submission_count,
                        gh.github_login
                    FROM xauth_users u
                    LEFT JOIN market_plugins p ON p.developer_id = u.id
                    LEFT JOIN market_submissions s ON s.developer_id = u.id
                    LEFT JOIN market_github_tokens gh ON gh.user_id = u.id
                    WHERE (:search IS NULL OR u.email LIKE :pattern)
                    AND (:is_active IS NULL OR u.is_active = :is_active)
                    GROUP BY u.id, u.email, u.is_active, u.mfa_enabled, u.created_at, gh.github_login
                    ORDER BY u.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            )
            items = []
            for row in rows.fetchall():
                roles_row = await session.execute(
                    sql_text("""
                        SELECT r.name FROM xauth_roles r
                        JOIN xauth_tenant_members tm ON tm.role_id = r.id
                        WHERE tm.user_id = :uid
                    """),
                    {"uid": row.id},
                )
                roles = [r.name for r in roles_row.fetchall()]
                items.append(UserAdminOut(
                    id=row.id,
                    email=row.email,
                    github_login=row.github_login,
                    is_active=row.is_active,
                    mfa_enabled=row.mfa_enabled,
                    created_at=row.created_at,
                    plugin_count=row.plugin_count,
                    submission_count=row.submission_count,
                    roles=roles,
                ))
            return PageOut(items=items, total=total, limit=limit, offset=offset, has_more=offset + limit < total)

    @router.get("/{user_id}", response_model=UserAdminOut)
    async def get_user(
        user_id: str,
        current_user: AuthPayload = Depends(require_permission("user:read")),
    ) -> Any:
        async with db.session() as session:
            row = await session.execute(
                sql_text("""
                    SELECT u.id, u.email, u.is_active, u.mfa_enabled, u.created_at,
                           COUNT(DISTINCT p.id) AS plugin_count,
                           COUNT(DISTINCT s.id) AS submission_count,
                           gh.github_login
                    FROM xauth_users u
                    LEFT JOIN market_plugins p ON p.developer_id = u.id
                    LEFT JOIN market_submissions s ON s.developer_id = u.id
                    LEFT JOIN market_github_tokens gh ON gh.user_id = u.id
                    WHERE u.id = :uid
                    GROUP BY u.id, u.email, u.is_active, u.mfa_enabled, u.created_at, gh.github_login
                """),
                {"uid": user_id},
            )
            user = row.fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="Utilisateur introuvable")

            roles_row = await session.execute(
                sql_text("""
                    SELECT r.name FROM xauth_roles r
                    JOIN xauth_tenant_members tm ON tm.role_id = r.id
                    WHERE tm.user_id = :uid
                """),
                {"uid": user_id},
            )
            roles = [r.name for r in roles_row.fetchall()]
            return UserAdminOut(
                id=user.id, email=user.email, github_login=user.github_login,
                is_active=user.is_active, mfa_enabled=user.mfa_enabled,
                created_at=user.created_at, plugin_count=user.plugin_count,
                submission_count=user.submission_count, roles=roles,
            )

    @router.get("/{user_id}/github", response_model=UserGitHubOut)
    async def get_user_github(
        user_id: str,
        current_user: AuthPayload = Depends(require_permission("user:read")),
    ) -> Any:
        async with db.session() as session:
            row = await session.execute(
                sql_text("""
                    SELECT github_login, github_user_id, linked_at
                    FROM market_github_tokens
                    WHERE user_id = :uid
                """),
                {"uid": user_id},
            )
            gh = row.fetchone()
            if gh is None:
                raise HTTPException(status_code=404, detail="Compte GitHub non lié")
            return UserGitHubOut(
                github_login=gh.github_login,
                github_user_id=gh.github_user_id,
                linked_at=gh.linked_at,
            )

    @router.patch("/{user_id}/ban", status_code=status.HTTP_204_NO_CONTENT)
    async def ban_user(
        user_id: str,
        body: UserBanRequest,
        current_user: AuthPayload = Depends(require_permission("user:ban")),
    ) -> None:
        async with db.session() as session:
            await session.execute(
                sql_text("UPDATE xauth_users SET is_active = :val WHERE id = :uid"),
                {"val": False, "uid": user_id},
            )
            await session.commit()

    @router.patch("/{user_id}/unban", status_code=status.HTTP_204_NO_CONTENT)
    async def unban_user(
        user_id: str,
        current_user: AuthPayload = Depends(require_permission("user:ban")),
    ) -> None:
        async with db.session() as session:
            await session.execute(
                sql_text("UPDATE xauth_users SET is_active = :val WHERE id = :uid"),
                {"val": True, "uid": user_id},
            )
            await session.commit()

    @router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_user(
        user_id: str,
        current_user: AuthPayload = Depends(require_permission("user:delete")),
    ) -> None:
        if user_id == current_user["sub"]:
            raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
        async with db.session() as session:
            result = await session.execute(
                sql_text("DELETE FROM xauth_users WHERE id = :uid"),
                {"uid": user_id},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Utilisateur introuvable")
            await session.commit()

    @router.post("/{user_id}/roles", status_code=status.HTTP_204_NO_CONTENT)
    async def assign_role(
        user_id: str,
        body: UserRoleAssign,
        current_user: AuthPayload = Depends(require_permission("permission:assign")),
    ) -> None:
        async with db.session() as session:
            await session.execute(
                sql_text("""
                    UPDATE xauth_tenant_members SET role_id = :role_id
                    WHERE user_id = :uid AND tenant_id = :tenant_id
                """),
                {"role_id": body.role_id, "uid": user_id, "tenant_id": body.tenant_id},
            )
            await session.commit()

    return router
