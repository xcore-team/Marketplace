from __future__ import annotations

from pathlib import Path
from typing import Any


_TEMPLATES_DIR = Path(__file__).parent.parent.parent.parent / "data" / "templates"


def _render(template_name: str, context: dict) -> str:
    """Render a Jinja2 HTML template from data/templates/."""
    try:
        from jinja2 import Environment, FileSystemLoader, select_autoescape
    except ImportError as e:
        raise RuntimeError("jinja2 is required. Install with: uv add jinja2") from e

    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    tpl = env.get_template(f"{template_name}.html")
    return tpl.render(**context)


class EmailTransport:
    """
    Wrapper autour de l'extension email Xcore.
    Les templates HTML sont rendus localement via Jinja2 (data/templates/)
    avant d'être transmis au transport xcore.
    """

    def __init__(
        self, email_ext: Any, app_base_url: str, app_name: str, web_app_url: str | None = None
    ) -> None:
        self._ext = email_ext
        self.base_url = app_base_url.rstrip("/")
        self.app_name = app_name
        # Origine du FRONTEND web (React/Vite) — distincte de base_url (celle
        # du backend lui-même, utilisée pour /support ou la page de rebond
        # /app/auth/redirect). En dev les deux diffèrent (8000 vs 5173) ; en
        # prod elles coïncident souvent (vercel.json proxie /app/* sur le
        # même domaine que le frontend), d'où le repli sur app_base_url si
        # web_app_url n'est pas fourni explicitement.
        self.web_app_url = (web_app_url or app_base_url).rstrip("/")

    async def send(
        self,
        to: str,
        subject: str,
        template: str,
        context: dict,
    ) -> bool:
        context.setdefault("app_name", self.app_name)
        context.setdefault("base_url", self.base_url)
        context.setdefault("web_app_url", self.web_app_url)
        context.setdefault("support_url", f"{self.base_url}/support")

        html = _render(template, context)
        return await self._ext.send(
            to=to,
            subject=subject,
            body=html,
            is_html=True,
        )

    def queue(self, to: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Fire-and-forget — non bloquant."""
        return self._ext.queue(to=to, subject=subject, body=body, is_html=is_html)

    def queue_template(self, to: str, subject: str, template: str, context: dict) -> bool:
        """Fire-and-forget avec rendu Jinja2 local."""
        context.setdefault("app_name", self.app_name)
        context.setdefault("base_url", self.base_url)
        context.setdefault("web_app_url", self.web_app_url)
        context.setdefault("support_url", f"{self.base_url}/support")
        html = _render(template, context)
        return self._ext.queue(to=to, subject=subject, body=html, is_html=True)
