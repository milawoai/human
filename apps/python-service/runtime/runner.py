"""Owned launch entry. Manual `uvicorn main:app` remains an external service."""
import asyncio
import os
import sys
import uvicorn
from .owner_channel import read_owner
from .state import runtime


async def serve():
    if os.environ.get('HUMAN_RUNTIME_OWNED') == '1':
        frame = await read_owner(sys.stdin, runtime.shutdown)
        runtime.configure(frame)
        os.environ['HUMAN_NEURAL_URL'] = frame['neuralUrl']
        if runtime.stop_requested.is_set():
            return
    config = uvicorn.Config('main:app', host='127.0.0.1',
                            port=int(os.environ.get('HUMAN_PYTHON_PORT', '12003')), log_level='warning', timeout_graceful_shutdown=5)
    server = uvicorn.Server(config)

    async def watch_owner():
        await runtime.stop_requested.wait()
        server.should_exit = True

    watcher = asyncio.create_task(watch_owner())
    try:
        await server.serve()
        if getattr(server.lifespan, 'shutdown_failed', False):
            raise RuntimeError('Python resource shutdown failed')
    finally:
        watcher.cancel()
        await asyncio.gather(watcher, return_exceptions=True)


if __name__ == '__main__':
    try:
        asyncio.run(serve())
    except Exception:
        print('[Runtime] Python startup failed', file=sys.stderr)
        sys.exit(1)
