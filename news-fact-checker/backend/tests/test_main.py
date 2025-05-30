import os

# Set environment variables BEFORE importing anything from main.py
os.environ["PERPLEXITY_API_KEY"] = "test_key_123_for_testing"
os.environ["MONGODB_CONNECTION_STRING"] = "mongodb://mockhost:27017/testdb_for_testing"

import pytest
from fastapi.testclient import TestClient
from mongomock import MongoClient as MockMongoClient
from unittest.mock import patch, MagicMock
import datetime

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

@patch('news_fact_checker.backend.main.ChatPerplexity')
def test_analyze_article_cache_miss(mock_chat_perplexity_constructor, manage_article_collection_patch): # Fixture is auto-use
    """Test analysis when the article is not in the cache (cache miss)."""

    mock_llm_instance = MagicMock()
    # Mock the language detection call specifically if needed, or assume it's part of the general invoke chain
    # For this test, the key is that ChatPerplexity is instantiated and its methods are called.
    # If invoke is called multiple times, we might need a side_effect list or more specific mocks.
    # main.py: llm.invoke(language_detection_prompt), llm.invoke(search_prompt), structured_llm.invoke(fact_check_prompt)

    # Let's mock the sequence of calls if they are distinct and important
    mock_language_response = MagicMock()
    mock_language_response.content = "English"

    mock_search_queries_response = MagicMock()
    mock_search_queries_response.content = "query1\nquery2"

    expected_issues = [
        Issue(text="Misleading statement 1", explanation="Explanation 1", confidence_score=0.9, source_urls=["http://source1.com"])
    ]
    mock_analysis_output = AnalysisOutput(issues=expected_issues)

    # This will be the return value for the final structured_llm.invoke()
    # For the two initial invokes:
    mock_llm_instance.invoke.side_effect = [
        mock_language_response,         # First call to llm.invoke
        mock_search_queries_response    # Second call to llm.invoke
    ]

    mock_structured_llm = MagicMock()
    mock_structured_llm.invoke.return_value = mock_analysis_output # Call to structured_llm.invoke()
    mock_llm_instance.with_structured_output.return_value = mock_structured_llm

    mock_chat_perplexity_constructor.return_value = mock_llm_instance # Constructor returns our main mock

    article_data = ArticleRequest(
        url="http://example.com/new-article",
        title="New Article Title",
        content="Some fresh content."
    )

    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 200
    response_data = AnalysisResponse(**response.json())
    assert response_data.issues == expected_issues

    mock_chat_perplexity_constructor.assert_called_once()
    assert mock_llm_instance.invoke.call_count == 2 # language detection and search queries
    mock_llm_instance.with_structured_output.assert_called_once_with(AnalysisOutput)
    mock_structured_llm.invoke.assert_called_once()

    saved_doc_dict = mock_article_analyses_collection_instance.find_one({"url": article_data.url})
    assert saved_doc_dict is not None
    saved_issues = [Issue(**issue_data) for issue_data in saved_doc_dict["issues"]]

    assert saved_doc_dict["title"] == article_data.title
    assert saved_doc_dict["content"] == article_data.content
    assert saved_issues == expected_issues
    assert "created_at" in saved_doc_dict
    assert isinstance(saved_doc_dict["created_at"], datetime.datetime)


@patch('news_fact_checker.backend.main.ChatPerplexity')
def test_analyze_article_cache_hit(mock_chat_perplexity_constructor, manage_article_collection_patch): # Fixture is auto-use
    """Test analysis when the article is already in the cache (cache hit)."""

    cached_url = "http://example.com/cached-article"
    article_data = ArticleRequest(
        url=cached_url,
        title="Cached Article Title",
        content="Content that was previously analyzed."
    )

    cached_issues = [
        Issue(text="Old issue", explanation="Old explanation", confidence_score=0.8, source_urls=["http://oldsource.com"])
    ]
    cached_doc_to_insert = ArticleAnalysisDocument(
        url=cached_url,
        title="Cached Article Title DB",
        content="Content in DB",
        issues=cached_issues
    )
    mock_article_analyses_collection_instance.insert_one(cached_doc_to_insert.model_dump())

    mock_llm_instance = MagicMock() # This and subsequent mocks should not be called
    mock_chat_perplexity_constructor.return_value = mock_llm_instance
    mock_structured_llm = MagicMock()
    mock_llm_instance.with_structured_output.return_value = mock_structured_llm

    response = client.post("/analyze", json=article_data.model_dump())

    assert response.status_code == 200
    response_data = AnalysisResponse(**response.json())
    assert response_data.issues == cached_issues

    mock_chat_perplexity_constructor.assert_not_called()
    mock_llm_instance.invoke.assert_not_called()
    mock_llm_instance.with_structured_output.assert_not_called()
    mock_structured_llm.invoke.assert_not_called()

    db_doc_count = mock_article_analyses_collection_instance.count_documents({"url": cached_url})
    assert db_doc_count == 1
