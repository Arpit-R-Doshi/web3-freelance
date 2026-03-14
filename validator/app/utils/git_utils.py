import subprocess
import logging

logger = logging.getLogger(__name__)

def clone_repo(repo_url: str, local_path: str):
    """Clones a repository to a local path."""
    try:
        subprocess.run(
            ["git", "clone", repo_url, local_path],
            check=True,
            capture_output=True,
            text=True
        )
        logger.info(f"Successfully cloned repository {repo_url} into {local_path}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to clone repository: {e.stderr}")
        raise

def pull_repo(local_path: str):
    """Pulls the latest changes in a local repository."""
    try:
        subprocess.run(
            ["git", "pull"],
            cwd=local_path,
            check=True,
            capture_output=True,
            text=True
        )
        logger.info(f"Successfully pulled latest changes in {local_path}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to pull repository in {local_path}: {e.stderr}")
        raise
