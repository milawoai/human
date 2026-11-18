"""One cancellable loop owns initial connection and all subsequent recovery."""
import asyncio
import logging
import random

logger = logging.getLogger(__name__)


class RecoveryLoop:
    def __init__(self, attempt, sleep=asyncio.sleep):
        self.attempt = attempt
        self.sleep = sleep
        self.task = None
        self.failures = 0

    def start(self):
        if self.task is None or self.task.done():
            self.task = asyncio.create_task(self._run())

    def mark_ready(self):
        self.failures = 0

    async def _run(self):
        while True:
            try:
                await self.attempt()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.warning("[Neural] Recovery pending (%s)", type(error).__name__)
            delay = min(15, 2 ** min(self.failures, 4))
            self.failures += 1
            await self.sleep(delay * random.uniform(0.8, 1.2))

    async def stop(self):
        task, self.task = self.task, None
        if task is not None:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
