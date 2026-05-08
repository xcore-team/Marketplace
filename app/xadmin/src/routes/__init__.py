from .users import users_router
from .plugins import plugins_router
from .submissions import submissions_router
from .categories import categories_router
from .stats import stats_router
from .audit import audit_router
from .system import system_router

__all__ = [
    "users_router", "plugins_router", "submissions_router",
    "categories_router", "stats_router", "audit_router", "system_router",
]
