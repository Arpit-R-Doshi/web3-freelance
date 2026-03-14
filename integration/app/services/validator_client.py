"""HTTP client for the Validator Service."""
import httpx
from typing import Optional
from app.config import settings


class ValidatorClient:
    def __init__(self):
        self.base_url = settings.VALIDATOR_SERVICE_URL
        self.timeout = 30.0

    def create_project(self, name: str, description: str, freelancer_github: str) -> dict:
        """Call POST /projects on Validator Service."""
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.base_url}/projects",
                json={
                    "name": name,
                    "description": description,
                    "freelancer_github": freelancer_github,
                },
            )
            resp.raise_for_status()
            return resp.json()

    def get_project_status(self, validator_project_id: int) -> Optional[dict]:
        """Call GET /projects/{id}/status on Validator Service."""
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.get(
                    f"{self.base_url}/projects/{validator_project_id}/status"
                )
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return None
