import json
import logging
from groq import Groq
from app.config import config

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        # We handle no key by just logging or mocking if needed, but per requirements we need fully functional
        self.client = Groq(api_key=config.GROQ_API_KEY) if config.GROQ_API_KEY else None
    
    def generate_milestones(self, project_description: str) -> list[dict]:
        """Converts natural language requirements into structured milestones using Groq."""
        if not self.client:
            raise ValueError("GROQ_API_KEY is not set. Cannot use LLM service.")
            
        prompt = f"""
        Act as a Senior Backend Systems Engineer. Break down the following project description into technical, structured, and actionable software development milestones.
        Focus on concrete technical implementations, API endpoints, database schema changes, and core logic rather than vague user-facing features.
        Each milestone must be highly specific, technically detailed, and independently testable through automated scripts.

        Project Description:
        {project_description}

        Return strictly ONLY the JSON format below nothing else, no markdown formatting:
        {{
            "milestones":[
                {{
                    "title":"[Action-oriented technical title, e.g., 'Implement POST /login endpoint with JWT']",
                    "description":"[Detailed technical explanation including expected request/response, database interactions, and specific constraints]"
                }}
            ]
        }}
        """
        try:
            completion = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0
            )
            content = completion.choices[0].message.content
            # Cleanup any markdown json blocks if LLM still returned them
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
            
            data = json.loads(content.strip())
            return data.get("milestones", [])
            
        except Exception as e:
            logger.error(f"Failed to generate milestones from LLM: {e}")
            raise e

    def generate_test_scripts(self, milestone_title: str, milestone_description: str) -> str:
        """Generates a pytest script for a given milestone."""
        if not self.client:
            raise ValueError("GROQ_API_KEY is not set. Cannot use LLM service.")
        
        prompt = f"""
        Create a pytest python test script for the following milestone.
        Title: {milestone_title}
        Description: {milestone_description}
        
        The API is assumed to be running at http://localhost:8000. Use the `requests` library.
        Return strictly ONLY the raw python code for the test script. Do not wrap in markdown or backticks.
        """
        try:
            completion = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0
            )
            content = completion.choices[0].message.content
            
            # Simple cleanup
            if content.startswith("```python"):
                content = content[9:-3]
            elif content.startswith("```"):
                content = content[3:-3]
                
            return content.strip()
            
        except Exception as e:
            logger.error(f"Failed to generate test script: {e}")
            raise e
