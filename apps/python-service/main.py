"""
Human Python Service - FastAPI
"""
import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from module.sensory.sensory_hearing.controllers import SpeechRecognitionController
from module.sensory.sensory_hearing.query_router import router as query_router as hearing_query_router
from module.sensory.sensory_speaking.controllers import SpeechSynthesisController
from module.sensory.sensory_speaking.query_router import router as speaking_query_router

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

# ASR 控制器
speech_controller = SpeechRecognitionController(debug=False)
app.include_router(speech_controller.get_router(), prefix="/api/v1")
app.include_router(hearing_query_router)

# TTS 控制器
speaking_controller = SpeechSynthesisController(debug=False)
app.include_router(speaking_controller.get_router(), prefix="/api/v1")
app.include_router(speaking_query_router)


@app.on_event("startup")
async def on_startup():
    """应用启动时连接 Neural Core。"""
    logger.info("[Main] 应用启动，正在初始化 Neural Core 连接...")
    await speech_controller.start_neural()
    await speaking_controller.start_neural()


@app.on_event("shutdown")
async def on_shutdown():
    """应用关闭时断开 Neural Core。"""
    logger.info("[Main] 应用关闭，正在断开 Neural Core...")
    await speech_controller.stop_neural()
    await speaking_controller.stop_neural()


@app.post("/api/hello")
async def hello() -> dict:
    """健康检查接口"""
    logger.info("hello endpoint called")
    return {"status": "success", "service": "Human Python Service", "port": 12003}
