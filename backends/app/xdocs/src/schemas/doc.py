from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class PluginDocOut(BaseModel):
    id: str
    plugin_id: str
    version: str
    readme: Optional[str] = None
    integration: Optional[str] = None
    contributor: Optional[Dict[str, Any]] = None
    extracted_at: datetime

    model_config = {"from_attributes": True}
