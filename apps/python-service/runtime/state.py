"""Process-local credentials; never exported by identity or persisted."""
import asyncio
import hmac
from .identity import identity


class RuntimeState:
    def __init__(self):
        self._token = None
        self.stop_requested = asyncio.Event()

    def configure(self, frame):
        self._token = frame['ownerToken']
        identity['instanceId'] = frame['expectedServiceInstanceId']

    def authorize(self, token):
        return bool(self._token and isinstance(token, str) and hmac.compare_digest(self._token, token))

    def shutdown(self):
        self.stop_requested.set()


runtime = RuntimeState()
