import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from core.config import settings
from core.database import init_db
from core.websocket_manager import manager
from routes import auth, services, metrics, alerts, websocket, analytics, incidents
from workers.anomaly_worker import start_worker, stop_worker
from ml.trainer import retrain_all_models
from workers.s3_archiver import run_log_archiver

# 1. Setup Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("devpulse")

# 2. Setup APScheduler
scheduler = AsyncIOScheduler()

async def log_telemetry_status():
    """Periodic background job via APScheduler monitoring backend metrics."""
    active_users = len(manager.active_connections)
    connection_count = sum(len(websockets) for websockets in manager.active_connections.values())
    logger.info(
        f"[Status Job] DevPulse Health: Active users online: {active_users}, "
        f"Total WebSocket connections: {connection_count}"
    )

# 3. Setup FastAPI Lifespan (Startup / Shutdown)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup Actions ---
    logger.info("Initializing DevPulse Backend...")
    
    # Run DB migrations/initialization
    init_db()
    
    # A. Register health status logging job (every 60s)
    scheduler.add_job(log_telemetry_status, 'interval', seconds=60)
    
    # B. Register ML Isolation Forest model retraining job (every 30 minutes)
    scheduler.add_job(retrain_all_models, 'interval', minutes=30)
    
    # C. Register S3 historical metrics archiver (every hour)
    scheduler.add_job(run_log_archiver, 'interval', hours=1)
    
    scheduler.start()
    logger.info("APScheduler initialized, registered jobs, and started.")
    
    # D. Launch Anomaly Detection Stream Worker
    start_worker()
    logger.info("Anomaly detection stream worker started.")
    
    yield
    
    # --- Shutdown Actions ---
    logger.info("Shutting down DevPulse Backend...")
    
    # Gracefully stop the anomaly stream worker
    stop_worker()
    logger.info("Anomaly detection stream worker stopped.")
    
    # Shutdown APScheduler
    scheduler.shutdown()
    logger.info("APScheduler shutdown completed.")

# 4. Instantiate FastAPI application
app = FastAPI(
    title="DevPulse API",
    description="AI-Powered DevOps Observability Dashboard Backend",
    version="1.0.0",
    lifespan=lifespan
)

# 5. Apply CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 6. Register Routes
app.include_router(auth.router)
app.include_router(services.router)
app.include_router(metrics.router)
app.include_router(alerts.router)
app.include_router(websocket.router)
app.include_router(analytics.router)
app.include_router(incidents.router)


# 7. Health Check Endpoint
@app.get("/health", tags=["system"])
def health_check():
    """Verify application status and connectivity."""
    return {
        "status": "ok",
        "timestamp": time.time()
    }
