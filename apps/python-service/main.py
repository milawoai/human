"""
Human Python Service - FastAPI
"""
import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from module.sensory.sensory_hearing.controllers import SpeechRecognitionController

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="Human Python Service", version="0.1.0")

# 启用 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

speech_controller = SpeechRecognitionController(debug=False)
app.include_router(speech_controller.get_router(), prefix="/api/v1")


@app.post("/api/hello")
async def hello() -> dict:
    """健康检查接口"""
    logger.info("hello endpoint called")
    return {"status": "success", "service": "Human Python Service", "port": 12003}
