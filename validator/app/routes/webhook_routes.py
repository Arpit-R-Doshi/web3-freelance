from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.webhook_service import WebhookService
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhooks"])

@router.post("/github")
async def github_webhook(request: Request, db: Session = Depends(get_db)):
    """Endpoint to receive GitHub push webhooks."""
    payload = await request.json()
    logger.info(f"Received webhook event for repository: {payload.get('repository', {}).get('name')}")
    
    webhook_service = WebhookService(db)
    
    # Since docker/subprocess testing can take time, in a true prod environment we would queue this via celery/redis.
    # For MVP prototype, we handle synchronously (or use Fastapi background tasks). Let's just process synchronously.
    webhook_service.process_github_push(payload)
    
    return {"status": "success"}
