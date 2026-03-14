import subprocess
import logging
import os
from typing import Tuple

logger = logging.getLogger(__name__)

def run_tests_in_docker(repo_path: str, tests_path: str) -> Tuple[bool, str]:
    """
    Runs pytest inside a Docker container mounting the repo and tests paths.
    Returns (success_boolean, test_output_string).
    """
    repo_path = os.path.abspath(repo_path)
    tests_path = os.path.abspath(tests_path)
    
    # We mount the tests directly to /app/tests inside the container.
    command = [
        "docker", "run", "--rm",
        "-v", f"{repo_path}:/app/repo",
        "-v", f"{tests_path}:/app/tests",
        "freelance-test-runner",
        # Custom command inside the container to make the repo modules available
        "bash", "-c", "export PYTHONPATH=/app/repo && pytest /app/tests"
    ]
    
    try:
        result = subprocess.run(
            command,
            check=False, # We want to handle failures manually based on pytest return codes
            capture_output=True,
            text=True
        )
        output = result.stdout + "\n" + result.stderr
        
        # Pytest exit code 0 means all tests passed. Exit code 1 means tests ran but some failed.
        # Exit code 5 means no tests were collected. 
        if result.returncode == 0:
            return True, output
        else:
            return False, output
            
    except Exception as e:
        logger.error(f"Failed to run docker container: {str(e)}")
        return False, str(e)
