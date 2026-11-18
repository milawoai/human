import asyncio
import json
import os
import socket
import sys

import aiohttp


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def test_owned_python_http_and_eof_exit_with_neural_unavailable():
    async def scenario(mode):
        port, neural_port = free_port(), free_port()
        assert port not in (12002, 12003) and neural_port not in (12002, 12003)
        token = 'p' * 64
        process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'runtime.runner',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ, 'HUMAN_RUNTIME_OWNED': '1', 'HUMAN_PYTHON_PORT': str(port)})
        process.stdin.write((json.dumps({'type': 'bootstrap', 'protocolVersion': 1,
            'ownerInstanceId': 'fixture-owner', 'expectedServiceInstanceId': 'fixture-python',
            'ownerToken': token, 'neuralUrl': f'http://127.0.0.1:{neural_port}/neural'}) + '\n').encode())
        await process.stdin.drain()
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=1)) as client:
                base = f'http://127.0.0.1:{port}/runtime'
                identity = None
                for _ in range(100):
                    try:
                        async with client.get(base + '/identity') as response:
                            identity = await response.json()
                        break
                    except (aiohttp.ClientError, TimeoutError):
                        await asyncio.sleep(.05)
                assert identity and identity['instanceId'] == 'fixture-python'
                async with client.post(base + '/shutdown') as response:
                    assert response.status == 401
                if mode == 'http':
                    async with client.post(base + '/shutdown', headers={'x-human-owner-token': token}) as response:
                        assert response.status == 202
                else:
                    process.stdin.close()
                await asyncio.wait_for(process.wait(), 5)
                assert process.returncode == 0
            stdout, stderr = await process.communicate()
            assert token.encode() not in stdout + stderr
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
    for mode in ('http', 'eof'):
        asyncio.run(scenario(mode))
