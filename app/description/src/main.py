from xcore.sdk import TrustedBase


class Plugin(TrustedBase):
    async def on_load(self) -> None:
        db = self.get_service("db")
        cache = self.get_service("cache")

    async def on_unload(self) -> None:
        pass

    async def on_reload(self) -> None:
        pass
