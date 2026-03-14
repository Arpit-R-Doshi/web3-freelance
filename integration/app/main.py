from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx

from app.config import settings
from app.database import init_db
from app.routes import projects, actions, internal

app = FastAPI(
    title="Nexus Integration Service",
    description="Orchestrates Auth, Validator, and Blockchain services",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(actions.router)
app.include_router(internal.router)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health_check():
    service_status = {}
    for name, url in [
        ("auth", settings.AUTH_SERVICE_URL),
        ("validator", settings.VALIDATOR_SERVICE_URL),
    ]:
        try:
            r = httpx.get(f"{url}/", timeout=3)
            service_status[name] = "up" if r.status_code < 500 else "degraded"
        except Exception:
            service_status[name] = "down"
    return {"status": "ok", "services": service_status}


@app.get("/")
def root():
    return {"message": "Nexus Integration Service is running", "docs": "/docs"}
