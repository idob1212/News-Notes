import os

# Set environment variables BEFORE importing anything from main.py
os.environ["PERPLEXITY_API_KEY"] = "test_key_123_for_testing" # Kept for now if other parts of main still reference it
os.environ["YOU_API_KEY"] = "test_you_api_key_for_testing"
os.environ["MONGODB_CONNECTION_STRING"] = "mongodb://mockhost:27017/testdb_for_testing"

import pytest
import json # For creating JSON strings for mock LLM output
# import requests # No longer needed for mocking requests.post
from fastapi.testclient import TestClient
from mongomock import MongoClient as MockMongoClient
from unittest.mock import patch, MagicMock
import datetime
# Import PydanticOutputParser to check for format_instructions in prompt
from langchain_core.output_parsers import PydanticOutputParser
from news_fact_checker.backend.main import AnalysisOutput # To initialize PydanticOutputParser for checking format_instructions

# --- Mocking MongoDB ---
mock_mongo_client_instance = MockMongoClient()
mock_db_instance = mock_mongo_client_instance["news_fact_checker_db_test"]
mock_article_analyses_collection_instance = mock_db_instance["article_analyses_test"]

# --- Pytest Fixture for Patching ---
@pytest.fixture(scope="module", autouse=True)
def manage_article_collection_patch(module_scoped_patch_manager):
    # This fixture will ensure the patch is active for the entire module
    # The actual patching object 'patch' comes from unittest.mock
    # 'module_scoped_patch_manager' is just a conceptual name for this fixture's role
    # The patch itself is defined and started here.

    # Patch the global 'article_analyses_collection' in main.py
    # This ensures that when 'app' (and its routes) are imported, they are already using the mock collection.
    patcher = patch('news_fact_checker.backend.main.article_analyses_collection', mock_article_analyses_collection_instance)
    patcher.start()
    yield # Tests run while this patch is active
    patcher.stop()

# Import necessary components from main.py AFTER the patch is conceptually active via the fixture.
# Pytest executes fixtures before collecting/running tests in their scope.
from news_fact_checker.backend.main import app, ArticleRequest, AnalysisResponse, Issue, AnalysisOutput, ArticleAnalysisDocument

# Test Client - uses the 'app' which is now wired to the mock collection due to the fixture
client = TestClient(app)

@pytest.fixture(autouse=True)
def cleanup_mock_db_per_test():
    """Clears the mock database before each test and after each test."""
    mock_article_analyses_collection_instance.delete_many({})
    yield
    mock_article_analyses_collection_instance.delete_many({})


# --- Test Functions ---

# Commenting out old Perplexity tests as they are no longer the primary API
# @patch('news_fact_checker.backend.main.ChatPerplexity')
# def test_analyze_article_cache_miss(mock_chat_perplexity_constructor, manage_article_collection_patch): # Fixture is auto-use
#     """Test analysis when the article is not in the cache (cache miss)."""
#     ... (old test code) ...

# @patch('news_fact_checker.backend.main.ChatPerplexity')
# def test_analyze_article_cache_hit(mock_chat_perplexity_constructor, manage_article_collection_patch): # Fixture is auto-use
#     """Test analysis when the article is already in the cache (cache hit)."""
#     ... (old test code) ...


# --- Tests for You.com Langchain Integration ---

# Helper to get format instructions for checking prompt
def get_expected_format_instructions():
    parser = PydanticOutputParser(pydantic_object=AnalysisOutput)
    return parser.get_format_instructions()

@patch('news_fact_checker.backend.main.YouChatLLM')
def test_analyze_article_langchain_success_with_issues(MockYouChatLLM, manage_article_collection_patch):
    """Test successful analysis via Langchain YouChatLLM when issues are found."""
    mock_llm_instance = MockYouChatLLM.return_value
    mock_llm_output_dict = {
        "issues": [
            {
                "text": "Langchain Problematic statement 1",
                "explanation": "Langchain Explanation for issue 1",
                "confidence_score": 0.95,
                "source_urls": ["http://langchain-source1.com"]
            }
        ]
    }
    mock_llm_instance.invoke.return_value = json.dumps(mock_llm_output_dict)

    article_data = ArticleRequest(
        url="http://example.com/langchain-article-issues",
        title="Langchain Test Article With Issues",
        content="Some content with problems for Langchain."
    )

    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 200
    response_data = AnalysisResponse(**response.json())
    assert len(response_data.issues) == 1
    issue = response_data.issues[0]
    assert issue.text == "Langchain Problematic statement 1"
    assert issue.explanation == "Langchain Explanation for issue 1"
    assert issue.confidence_score == 0.95
    assert issue.source_urls == ["http://langchain-source1.com"]

    mock_llm_instance.invoke.assert_called_once()
    # Check that the prompt passed to invoke contains format instructions
    call_args = mock_llm_instance.invoke.call_args[0][0] # Get the dictionary argument
    assert "article_title" in call_args
    assert call_args["article_title"] == article_data.title
    # The actual prompt string is generated by prompt.format_prompt(**call_args).to_string()
    # We are checking the input to the `chain.invoke` which then gets processed by the `PromptTemplate`
    # The `PromptTemplate` itself is not mocked here, but its output is what `you_llm.invoke` receives.
    # The `chain.invoke` in `main.py` passes a dictionary. This dict is then used by the `PromptTemplate`
    # to format the actual prompt string. So, the `you_llm.invoke` (which is `YouChatLLM._call`)
    # will receive the fully formatted string.
    # For simplicity, we assume the mock structure `prompt | llm | parser` correctly calls `llm.invoke`
    # with the output of `prompt.format_prompt(...)`.
    # A more detailed test would involve also mocking PromptTemplate if we wanted to isolate YouChatLLM even further.
    # However, testing that the input to the LLM contains format_instructions is harder with current patching.
    # Instead, we trust the Langchain chain pipes the formatted prompt.

    saved_doc = mock_article_analyses_collection_instance.find_one({"url": article_data.url})
    assert saved_doc is not None
    assert len(saved_doc["issues"]) == 1
    assert saved_doc["issues"][0]["text"] == "Langchain Problematic statement 1"
    assert saved_doc["issues"][0]["confidence_score"] == 0.95


@patch('news_fact_checker.backend.main.YouChatLLM')
def test_analyze_article_langchain_success_no_issues(MockYouChatLLM, manage_article_collection_patch):
    """Test successful analysis via Langchain YouChatLLM when no issues are found."""
    mock_llm_instance = MockYouChatLLM.return_value
    mock_llm_instance.invoke.return_value = json.dumps({"issues": []})

    article_data = ArticleRequest(
        url="http://example.com/langchain-article-no-issues",
        title="Langchain Test Article No Issues",
        content="Perfectly fine content for Langchain."
    )
    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 200
    response_data = AnalysisResponse(**response.json())
    assert len(response_data.issues) == 0
    mock_llm_instance.invoke.assert_called_once()
    saved_doc = mock_article_analyses_collection_instance.find_one({"url": article_data.url})
    assert saved_doc is not None
    assert len(saved_doc["issues"]) == 0


@patch('news_fact_checker.backend.main.YouChatLLM')
def test_analyze_article_langchain_output_parser_error(MockYouChatLLM, manage_article_collection_patch):
    """Test error handling when LLM returns malformed JSON or non-JSON string causing PydanticOutputParser to fail."""
    mock_llm_instance = MockYouChatLLM.return_value
    mock_llm_instance.invoke.return_value = "This is not JSON, and definitely not what PydanticOutputParser expects."
    # or mock_llm_instance.invoke.return_value = json.dumps({"unexpected_structure": "foo"})


    article_data = ArticleRequest(
        url="http://example.com/langchain-parser-error",
        title="Langchain Parser Error Test",
        content="Content for parser error."
    )
    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 500 # PydanticOutputParser error should lead to 500
    assert "Error during analysis with You.com (Langchain)" in response.json()["detail"]
    # More specific check for OutputParserException if possible from the detail string
    assert "Failed to parse" in response.json()["detail"] or "Error parsing" in response.json()["detail"] or "Invalid json" in response.json()["detail"].lower()


    mock_llm_instance.invoke.assert_called_once()
    saved_doc = mock_article_analyses_collection_instance.find_one({"url": article_data.url})
    assert saved_doc is None


@patch('news_fact_checker.backend.main.YouChatLLM')
def test_analyze_article_langchain_llm_api_error(MockYouChatLLM, manage_article_collection_patch):
    """Test error handling when YouChatLLM wrapper itself raises an API communication error."""
    mock_llm_instance = MockYouChatLLM.return_value
    # Simulate an error that would be raised by YouChatLLM._call
    # The wrapper raises Exception with specific messages for API errors.
    mock_llm_instance.invoke.side_effect = Exception("Simulated YouChatLLM API communication error: Error communicating with You.com API: Some detail")

    article_data = ArticleRequest(
        url="http://example.com/langchain-llm-api-error",
        title="Langchain LLM API Error Test",
        content="Content for LLM API error."
    )
    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 502 # Mapped in main.py from "Error communicating"
    assert "Error during analysis with You.com (Langchain)" in response.json()["detail"]
    assert "Error communicating with You.com API" in response.json()["detail"]

    mock_llm_instance.invoke.assert_called_once()
    saved_doc = mock_article_analyses_collection_instance.find_one({"url": article_data.url})
    assert saved_doc is None


@patch('news_fact_checker.backend.main.YouChatLLM')
def test_analyze_article_langchain_llm_timeout_error(MockYouChatLLM, manage_article_collection_patch):
    """Test error handling when YouChatLLM wrapper raises a timeout error."""
    mock_llm_instance = MockYouChatLLM.return_value
    mock_llm_instance.invoke.side_effect = Exception("Simulated YouChatLLM API request timed out after 180s") # Matches wrapper's TimeoutError message

    article_data = ArticleRequest(
        url="http://example.com/langchain-llm-timeout-error",
        title="Langchain LLM Timeout Error Test",
        content="Content for LLM timeout error."
    )
    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 504 # Mapped in main.py
    assert "Error during analysis with You.com (Langchain)" in response.json()["detail"]
    assert "timed out" in response.json()["detail"]

    mock_llm_instance.invoke.assert_called_once()
    saved_doc = mock_article_analyses_collection_instance.find_one({"url": article_data.url})
    assert saved_doc is None


@patch('news_fact_checker.backend.main.YouChatLLM')
def test_analyze_article_langchain_caching(MockYouChatLLM, manage_article_collection_patch):
    """Test caching mechanism with Langchain YouChatLLM integration."""
    mock_llm_instance = MockYouChatLLM.return_value
    article_url = "http://example.com/langchain-caching"
    article_data = ArticleRequest(
        url=article_url,
        title="Langchain Caching Test",
        content="Content for Langchain caching test."
    )

    # --- First call (cache miss) ---
    mock_llm_output_dict_first_call = {
        "issues": [{"text": "Cached issue LC", "explanation": "Cached explanation LC", "confidence_score": 0.88, "source_urls": ["http://cache-lc.com"]}]
    }
    mock_llm_instance.invoke.return_value = json.dumps(mock_llm_output_dict_first_call)

    response1 = client.post("/analyze", json=article_data.model_dump())
    assert response1.status_code == 200
    response1_data = AnalysisResponse(**response1.json())
    assert len(response1_data.issues) == 1
    assert response1_data.issues[0].text == "Cached issue LC"

    mock_llm_instance.invoke.assert_called_once()

    saved_doc = mock_article_analyses_collection_instance.find_one({"url": article_url})
    assert saved_doc is not None
    assert saved_doc["issues"][0]["text"] == "Cached issue LC"

    # --- Second call (cache hit) ---
    # Reset or change the mock to ensure it's not called if cache works
    mock_llm_instance.invoke.reset_mock()
    # No need to change return_value if it's not supposed to be called

    response2 = client.post("/analyze", json=article_data.model_dump())
    assert response2.status_code == 200
    response2_data = AnalysisResponse(**response2.json())
    assert response2_data.issues == response1_data.issues

    mock_llm_instance.invoke.assert_not_called() # Should not be called due to cache hit

    db_doc_count = mock_article_analyses_collection_instance.count_documents({"url": article_url})
    assert db_doc_count == 1
