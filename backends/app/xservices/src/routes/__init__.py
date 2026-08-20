from .admin import admin_router
from .categories import categories_router
from .install import service_install_router
from .services import services_router
from .submissions import submissions_router

__all__ = [
    "admin_router",
    "categories_router",
    "service_install_router",
    "services_router",
    "submissions_router",
]
