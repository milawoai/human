from fastapi import APIRouter, HTTPException, Request, Response
from .identity import identity
from .state import runtime

router = APIRouter(prefix='/runtime')


@router.get('/identity')
async def get_identity():
    return dict(identity)


@router.post('/shutdown', status_code=202)
async def shutdown(request: Request):
    if (request.headers.get('origin') or not request.client
            or request.client.host not in ('127.0.0.1', '::1')
            or not runtime.authorize(request.headers.get('x-human-owner-token'))):
        raise HTTPException(401)
    runtime.shutdown()
    return {'accepted': True}
