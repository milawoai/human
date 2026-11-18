"""Daemon reader handles bootstrap + EOF; only the asyncio thread changes state."""
import asyncio
import json
import threading
from urllib.parse import urlparse


async def read_owner(stream, on_lost, timeout=5):
    loop = asyncio.get_running_loop()
    ready = loop.create_future()

    def publish(value=None, error=None):
        if ready.done():
            return
        if error:
            ready.set_exception(error)
        else:
            ready.set_result(value)

    def read():
        try:
            line = stream.readline(4097)
            if not line.endswith('\n') or len(line.encode()) > 4096:
                raise ValueError('Invalid owner frame')
            frame = json.loads(line)
            url = urlparse(frame.get('neuralUrl', ''))
            if (frame.get('type') != 'bootstrap' or frame.get('protocolVersion') != 1
                    or not all(isinstance(frame.get(key), str) and 0 < len(frame[key]) <= 128
                               for key in ('expectedServiceInstanceId', 'ownerInstanceId'))
                    or not isinstance(frame.get('ownerToken'), str) or not 32 <= len(frame['ownerToken']) <= 256
                    or url.scheme != 'http' or url.hostname != '127.0.0.1' or url.path != '/neural'
                    or url.username or url.password or url.query or url.fragment):
                raise ValueError('Invalid owner bootstrap')
            loop.call_soon_threadsafe(publish, frame)
            # Keep reading for EOF without retaining further input in memory.
            while stream.read(1):
                pass
            loop.call_soon_threadsafe(on_lost)
        except Exception:
            try:
                loop.call_soon_threadsafe(publish, None, ValueError('Owner channel failed'))
                loop.call_soon_threadsafe(on_lost)
            except RuntimeError:
                pass  # The event loop has already exited.

    threading.Thread(target=read, name='owner-channel', daemon=True).start()
    return await asyncio.wait_for(ready, timeout)
