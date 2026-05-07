from .admin import admin_router
from .categories import categories_router
from .plugins import plugins_router
from .submissions import submissions_router
from .github import github_router

__all__ = ["admin_router", "categories_router", "plugins_router", "submissions_router", "github_router"]
