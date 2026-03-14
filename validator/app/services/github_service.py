import requests
import logging
from app.config import config

logger = logging.getLogger(__name__)

class GithubService:
    def __init__(self):
        self.token = config.GITHUB_TOKEN
        self.owner = config.GITHUB_OWNER
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }

    def create_repository(self, repo_name: str, description: str = "") -> dict:
        """Creates a private GitHub repository."""
        if not self.token:
            logger.warning("GITHUB_TOKEN not set, skipping repository creation.")
            return {"html_url": f"https://github.com/mock/{repo_name}"}

        url = "https://api.github.com/user/repos"
        payload = {
            "name": repo_name,
            "description": description,
            "private": True
        }
        
        response = requests.post(url, json=payload, headers=self.headers)
        if response.status_code in [201, 200]:
            return response.json()
        elif response.status_code == 422: # Already exists
            logger.info(f"Repository {repo_name} may already exist.")
            # For prototype, assume we can just use the existing URL if owner is known
            if self.owner:
                 return {"html_url": f"https://github.com/{self.owner}/{repo_name}"}
        
        response.raise_for_status()
        return {}

    def add_collaborator(self, repo_name: str, username: str) -> bool:
        """Adds a freelancer collaborator to the repository."""
        if not self.token or not self.owner:
            logger.warning("GITHUB_TOKEN or GITHUB_OWNER not set, skipping collaborator invite.")
            return False

        url = f"https://api.github.com/repos/{self.owner}/{repo_name}/collaborators/{username}"
        response = requests.put(url, headers=self.headers)
        
        if response.status_code in [201, 204]:
            return True
        logger.error(f"Failed to add collaborator {username} to {repo_name}: {response.text}")
        return False
