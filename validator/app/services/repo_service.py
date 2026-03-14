import os
from app.config import config
from app.utils.git_utils import clone_repo, pull_repo

class RepoService:
    def __init__(self):
        self.base_path = config.BASE_REPO_PATH
        os.makedirs(self.base_path, exist_ok=True)

    def setup_local_repo(self, repo_url: str, repo_name: str) -> str:
        """Clones or pulls the repository locally. Returns the local path."""
        # Convert HTTPS URL to auth URL if token is available
        auth_url = repo_url
        if config.GITHUB_TOKEN and "github.com" in repo_url:
            parts = repo_url.split("https://")
            if len(parts) == 2:
                auth_url = f"https://oauth2:{config.GITHUB_TOKEN}@{parts[1]}"
                
        local_path = os.path.join(self.base_path, repo_name)
        
        if os.path.exists(local_path) and os.path.isdir(os.path.join(local_path, ".git")):
            pull_repo(local_path)
        else:
            clone_repo(auth_url, local_path)
            
        return local_path
