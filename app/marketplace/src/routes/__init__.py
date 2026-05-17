from .categories import categories_router
from .plugins import plugins_router
from .submissions import submissions_router
from .github import github_router
from .webhooks import webhooks_router

__all__ = ["categories_router", "plugins_router", "submissions_router", "github_router", "webhooks_router"]
