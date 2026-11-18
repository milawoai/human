import asyncio
from module.sensory.sensory_hearing.neural_client import NeuralClient


def test_python_registers_only_its_own_capabilities():
    async def scenario():
        client = NeuralClient()
        sent = []
        async def emit(event, data, **_kwargs):
            sent.append((event, data))
        client._sio.emit = emit
        await client._register_capabilities()
        capabilities = sent[0][1]['capabilities']
        assert len(capabilities) == 3
        assert all(cap['actor']['actorId'] == 'sensory-hearing' for cap in capabilities)
    asyncio.run(scenario())
