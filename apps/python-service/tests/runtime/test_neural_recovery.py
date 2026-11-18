import asyncio
from module.sensory.sensory_hearing.recovery import RecoveryLoop

def test_initial_failure_and_disconnect_share_one_cancellable_loop():
    async def scenario():
        attempts = 0
        reached = asyncio.Event()
        async def attempt():
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise ConnectionError('fixture unavailable')
            reached.set()
            await asyncio.Event().wait()
        async def sleep(_seconds):
            await asyncio.sleep(0)
        recovery = RecoveryLoop(attempt, sleep=sleep)
        recovery.start()
        first = recovery.task
        recovery.start()
        assert recovery.task is first
        await asyncio.wait_for(reached.wait(), 1)
        assert attempts == 3
        await recovery.stop()
        assert recovery.task is None
        await asyncio.sleep(0)
        assert attempts == 3
    asyncio.run(scenario())
