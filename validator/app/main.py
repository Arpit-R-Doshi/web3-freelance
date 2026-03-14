import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routes import project_routes, webhook_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Database Tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Prototype Platform for Automated Freelance Work Verification",
    version="1.0.0"
)

# CORS Middleware Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project_routes.router)
app.include_router(webhook_routes.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to the Freelance Verification Platform API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
