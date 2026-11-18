"""Socket callbacks; recovery scheduling lives exclusively in RecoveryLoop."""
import logging

logger = logging.getLogger(__name__)


def setup_events(client):
    sio = client._sio

    @sio.on("connect", namespace="/neural")
    async def connected():
        client._connected = True
        await client._register_actor()

    @sio.on("disconnect", namespace="/neural")
    async def disconnected(*_args):
        client._connected = client._registered = False
        client._capabilities_ready = client._subscriptions_ready = False
        client._ready.clear()
        client._stop_heartbeat()
        client._disconnected.set()
        if client._on_connection_lost:
            await client._on_connection_lost()

    @sio.on("registered", namespace="/neural")
    async def registered(data):
        if data.get('serviceInstanceId') != client.instance_id:
            return
        client._registered = True
        client.neural_instance_id = data.get('neuralInstanceId')
        await client._register_capabilities()
        await client._subscribe_topics()

    def check_ready():
        if client.is_ready:
            client._ready.set()
            client._recovery.mark_ready()
            client._start_heartbeat()

    @sio.on("capabilities_registered", namespace="/neural")
    async def capabilities(_data):
        client._capabilities_ready = True
        check_ready()

    @sio.on("subscribed", namespace="/neural")
    async def subscribed(_data):
        client._subscriptions_ready = True
        check_ready()

    @sio.on("error", namespace="/neural")
    async def registration_error(_data):
        # An online conflicting Actor must not leave a physically connected but
        # permanently unregistered client. Let the one recovery loop retry.
        client._disconnected.set()

    @sio.on("message", namespace="/neural")
    async def message(data):
        if client.is_ready and data.get('kind') in ('command', 'control') and client._on_command:
            await client._on_command(data)
