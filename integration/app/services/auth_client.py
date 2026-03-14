"""HTTP client for the Auth Service."""
import httpx
from typing import Optional
from app.config import settings


class AuthClient:
    def __init__(self):
        self.base_url = settings.AUTH_SERVICE_URL
        self.timeout = 15.0

    def create_dispute(
        self,
        job_id: str,
        client_id: str,
        freelancer_id: str,
        skill: str,
        user_token: str,
    ) -> dict:
        """Call POST /disputes on Auth Service forwarding the user's JWT."""
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(
                f"{self.base_url}/disputes",
                json={
                    "job_id": job_id,
                    "client_id": client_id,
                    "freelancer_id": freelancer_id,
                    "skill": skill,
                },
                headers={"Authorization": f"Bearer {user_token}"},
            )
            resp.raise_for_status()
            return resp.json()

    def get_dispute(self, dispute_id: str, user_token: str) -> Optional[dict]:
        """Get dispute details from Auth Service."""
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.get(
                    f"{self.base_url}/disputes/{dispute_id}",
                    headers={"Authorization": f"Bearer {user_token}"},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return None

    def get_user_profile(self, user_id: str, user_token: str) -> Optional[dict]:
        """Get user public profile including reputation."""
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.get(
                    f"{self.base_url}/users/{user_id}/profile",
                    headers={"Authorization": f"Bearer {user_token}"},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return None
