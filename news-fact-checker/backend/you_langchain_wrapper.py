import os
import requests
from typing import Any, Dict, List, Optional, Iterator

from langchain_core.callbacks.manager import CallbackManagerForLLMRun
from langchain_core.language_models.llms import LLM
from langchain_core.outputs import GenerationChunk, Generation, LLMResult
from pydantic import SecretStr, Field, field_validator

# Load environment variables
# Ensure YOU_API_KEY is loaded, similar to how it's done in main.py,
# or expect it to be passed during instantiation.

class YouChatLLM(LLM):
    """Custom Langchain LLM wrapper for the You.com Research API."""

    you_api_key: Optional[SecretStr] = Field(default=None, alias="you_api_key_alias") # Use alias to avoid Pydantic complaint if passed directly
    api_host: str = "https://chat-api.you.com/research"
    request_timeout: int = 180  # seconds

    class Config:
        env_prefix = ''
        extra = 'ignore'
        # Allow both direct parameter passing and environment variable loading
        # Pydantic v2: use `model_config` instead of `Config` for some settings
        # For env var loading with specific name:
        # you_api_key: SecretStr = Field(validation_alias=EnvAlias('YOU_API_KEY'))
        # However, Pydantic usually loads from os.environ if field name matches.
        # Let's ensure it does by checking in __init__ or validator.


    def __init__(self, **data: Any):
        super().__init__(**data)
        # If you_api_key is passed directly (e.g. you_api_key="...") it's handled by Pydantic
        # If it's an environment variable YOU_API_KEY, Pydantic should load it if the field name matches.
        # Let's ensure it's loaded one way or another.
        if self.you_api_key is None: # Check if Pydantic loaded it
            api_key_env = os.getenv("YOU_API_KEY")
            if api_key_env:
                self.you_api_key = SecretStr(api_key_env)
            else:
                raise ValueError("YOU_API_KEY not found in environment variables or passed to the constructor.")
        if not isinstance(self.you_api_key, SecretStr): # If passed but not as SecretStr
             self.you_api_key = SecretStr(str(self.you_api_key))


    @field_validator("you_api_key", mode="before")
    @classmethod
    def _validate_api_key(cls, v: Optional[str]) -> Optional[SecretStr]:
        if v is None:
            # Attempt to load from environment if not provided at all
            env_key = os.getenv("YOU_API_KEY")
            if env_key:
                return SecretStr(env_key)
            return None # Will be caught by __init__ or another validator if still None
        return SecretStr(str(v))


    @property
    def _llm_type(self) -> str:
        return "you_chat_research"

    def _call(
        self,
        prompt: str,
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> str:
        """
        Make a call to the You.com Research API.

        Args:
            prompt: The prompt to send to the API. This prompt should be structured
                    to ask the You.com Research API to perform the analysis and return
                    the desired JSON structure.
            stop: Not actively used by You.com Research API in a direct way,
                  but included for Langchain compatibility.
            run_manager: Callback manager for the run.
            **kwargs: Additional keyword arguments.

        Returns:
            The string representation of the JSON response expected from the API,
            which should contain the analysis.
        """
        if stop is not None:
            if run_manager:
                run_manager.on_text("You.com API does not use stop sequences.", verbose=True)
            # Log or handle if necessary, though You.com API doesn't use stop words in this manner
            pass

        if not self.you_api_key: # Should have been caught by init, but defensive check
            raise ValueError("YOU_API_KEY is not set.")

        headers = {
            "X-API-Key": self.you_api_key.get_secret_value(),
            "Content-Type": "application/json",
        }
        payload = {"query": prompt}
        if kwargs.get("chat_id"):
            payload["chat_id"] = kwargs["chat_id"]

        try:
            response = requests.post(
                self.api_host,
                json=payload,
                headers=headers,
                timeout=self.request_timeout,
            )
            response.raise_for_status()

            api_response_json = response.json()

            import json
            return json.dumps(api_response_json)

        except requests.exceptions.Timeout as e:
            # Langchain expects errors to be of particular types sometimes,
            # but for custom LLMs, raising a descriptive error is fine.
            raise TimeoutError(f"You.com API request timed out after {self.request_timeout}s: {e}") from e
        except requests.exceptions.RequestException as e:
            error_detail = str(e)
            if e.response is not None:
                try:
                    error_content = e.response.json()
                    error_detail = f"{e} - Response: {str(error_content)[:500]}"
                except ValueError:
                    error_detail = f"{e} - Response: {e.response.text[:500]}"
            # Using ConnectionError or a more specific custom error might be good.
            # For now, generic Exception or a custom one.
            raise Exception( # Changed from ConnectionError to generic Exception for now
                f"Error communicating with You.com API: {error_detail}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Error processing You.com LLM call or parsing its response: {e}") from e

    @property
    def _identifying_params(self) -> Dict[str, Any]:
        """Get the identifying parameters for this LLM."""
        return {
            "model_name": "YouChatResearchLLM",
            "api_host": self.api_host,
            "request_timeout": self.request_timeout,
        }

# Example Usage (for testing the wrapper itself, not part of the FastAPI app)
if __name__ == "__main__":
    if "YOU_API_KEY" not in os.environ:
        print("Please set the YOU_API_KEY environment variable to test the wrapper.")
        print("Example: export YOU_API_KEY='your_actual_api_key_here'")
    else:
        print("Testing YouChatLLM wrapper...")
        try:
            example_prompt_for_you_api = """
Analyze the following text to identify any misleading statements.
Article Text: "This is a test statement that is perfectly fine. The sky is blue."
Respond with a JSON object containing a single key "issues".
The value of "issues" should be a list of JSON objects,
where each object has 'text', 'explanation', and 'source_urls' fields.
If no issues are found, return an empty list: {"issues": []}
"""

            # Test with API key from environment
            llm_env = YouChatLLM()
            print(f"LLM Initialized (env): {llm_env._identifying_params}")

            # Test with API key passed directly
            # llm_direct = YouChatLLM(you_api_key=os.environ["YOU_API_KEY"])
            # print(f"LLM Initialized (direct pass): {llm_direct._identifying_params}")

            print(f"Sending prompt to You.com Research API:\n{example_prompt_for_you_api[:100]}...") # Print snippet

            result = llm_env._call(example_prompt_for_you_api)
            print(f"\n--- _call result (type: {type(result)}) --- \n{result}")

            langchain_result = llm_env.invoke(example_prompt_for_you_api)
            print(f"\n--- invoke result (type: {type(langchain_result)}) --- \n{langchain_result}")

            import json
            parsed_json = json.loads(langchain_result)
            print(f"\n--- Parsed JSON from invoke result --- \n{json.dumps(parsed_json, indent=2)}")

            if "issues" in parsed_json:
                print(f"\nFound {len(parsed_json['issues'])} issues.")
            else:
                # This might indicate the API didn't return the *exact* format requested by the prompt
                # or that the "answer" field should be parsed if it contains a JSON string.
                # The current wrapper assumes the *entire response* from response.json() is the dict to be stringified.
                print("\n'issues' key not found directly in parsed JSON. The API might have a different top-level structure.")
                print("Consider if the prompt needs to be more specific or if the wrapper should extract from a sub-field like 'answer'.")


        except Exception as e:
            print(f"Error during YouChatLLM test: {e}")
            import traceback
            traceback.print_exc()
