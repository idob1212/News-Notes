from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime # Added import
import os
import time
from dotenv import load_dotenv
# import requests # No longer directly used for You.com call
# from langchain_perplexity import ChatPerplexity # Removed
# from langchain_core.prompts import ChatPromptTemplate # Will be replaced by new PromptTemplate
# from langchain_core.documents import Document # Removed
import re # Keep for now, might be used by other parts or future parsing
import asyncio # Keep for now, might be used by other parts
from pymongo import MongoClient

from .you_langchain_wrapper import YouChatLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

# Load environment variables from .env file
load_dotenv()

# Check if API key is available
perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
if not perplexity_api_key:
    raise ValueError("PERPLEXITY_API_KEY not found in environment variables. Please add it to your .env file.")

you_api_key = os.getenv("YOU_API_KEY")
if not you_api_key:
    raise ValueError("YOU_API_KEY not found in environment variables. Please add it to your .env file.")

app = FastAPI()

# Add CORS middleware to allow requests from Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify extension ID instead of *
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define issue model for the response
class Issue(BaseModel):
    text: str = Field(description="The exact text that contains the issue")
    explanation: str = Field(description="A clear explanation of why it's misleading or false")
    confidence_score: float = Field(description="Confidence score (0.0-1.0) for the assessment")
    source_urls: Optional[List[str]] = Field(default=None, description="URLs of sources that contradict the claim")

# Define structured output for the analysis
class AnalysisOutput(BaseModel):
    issues: List[Issue] = Field(description="List of problematic sections with text, explanation, and confidence score")

# Define request model
class ArticleRequest(BaseModel):
    title: str
    content: str
    url: str

# Define response model
class AnalysisResponse(BaseModel):
    issues: List[Issue]

# Define Article Analysis Document model for storage
class ArticleAnalysisDocument(BaseModel):
    url: str  # Unique ID for the document
    title: str
    content: str
    issues: List[Issue]
    created_at: datetime = Field(default_factory=datetime.utcnow)

# MongoDB setup
mongodb_connection_string = os.getenv("MONGODB_CONNECTION_STRING")
if not mongodb_connection_string:
    raise ValueError("MONGODB_CONNECTION_STRING not found in environment variables.")

try:
    mongo_client = MongoClient(mongodb_connection_string)
    mongo_db = mongo_client.news_fact_checker_db # Or your preferred DB name
    article_analyses_collection = mongo_db.article_analyses # Or your preferred collection name
    # You can add a test connection here if needed, e.g., by calling mongo_client.admin.command('ping')
    print("Successfully connected to MongoDB.")
except Exception as e:
    raise RuntimeError(f"Could not connect to MongoDB: {e}")


@app.get("/")
async def root():
    return {"message": "News Fact-Checker API"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_article(article: ArticleRequest):
    start_time = time.time()
    
    try:
        print(f"[DEBUG] Starting analysis for URL: {article.url}")
        
        # Check if the article analysis is already cached in MongoDB
        cached_analysis_doc = article_analyses_collection.find_one({"url": article.url})

        if cached_analysis_doc:
            # Convert issue dicts back to Issue Pydantic models
            issues_from_db = [Issue(**issue_data) for issue_data in cached_analysis_doc.get("issues", [])]
            print(f"Returning cached analysis for URL: {article.url} (took {time.time() - start_time:.2f} seconds)")
            return AnalysisResponse(issues=issues_from_db)

        # If not cached, proceed with new analysis using Langchain and YouChatLLM
        print(f"No cache found for URL: {article.url}. Performing new analysis with You.com (Langchain).")

        you_llm = YouChatLLM() # YOU_API_KEY loaded by wrapper from env
        output_parser = PydanticOutputParser(pydantic_object=AnalysisOutput)

        prompt_template_str = """
Analyze the following article to identify any misleading statements, factual inaccuracies, or biased reporting.
For each identified issue, please provide:
1. The exact text segment from the article that contains the issue. Call this field 'text'.
2. A concise explanation of why this segment is problematic. Call this field 'explanation'.
3. A list of URLs to credible sources that support your explanation. Call this field 'source_urls'.
4. A confidence score (0.0-1.0) for your assessment. Call this field 'confidence_score'. If not directly calculable, use 1.0 for high confidence findings.

Article Title: {article_title}
Article URL: {article_url}
Article Content:
{article_content}

{format_instructions}

Ensure your entire response is a single JSON object matching the Pydantic schema provided in the format instructions.
If no issues are found, the "issues" list should be empty.
"""
        # Added article_url to input_variables and prompt
        prompt = PromptTemplate(
            template=prompt_template_str,
            input_variables=["article_title", "article_content", "article_url"],
            partial_variables={"format_instructions": output_parser.get_format_instructions()},
        )

        chain = prompt | you_llm | output_parser
        
        structured_result: Optional[AnalysisOutput] = None
        try:
            print(f"[DEBUG] Sending request to You.com API via Langchain wrapper for URL: {article.url}")
            structured_result = chain.invoke({
                "article_title": article.title,
                "article_content": article.content,
                "article_url": article.url # Added URL to the invocation
            })
            # The PydanticOutputParser now directly creates Issue objects with confidence_score from the LLM
            # if the LLM provides it. If not, the Pydantic model's default will be used.
            # We need to ensure the prompt asks for confidence_score and the Pydantic model Issue handles it.
            # The 'Issue' model already has 'confidence_score'. The prompt now asks for it.
            # If the LLM doesn't return it, PydanticOutputParser might fail if 'confidence_score' is not Optional or has no default.
            # The Issue model has: confidence_score: float = Field(description="...")
            # This means it's required. The prompt now explicitly asks for it.

            print(f"[DEBUG] Analysis with You.com (Langchain) completed, found {len(structured_result.issues)} issues")

        except Exception as e:
            # Catch errors from the chain invocation (e.g., API errors from YouChatLLM, parsing errors)
            import traceback
            traceback.print_exc()
            error_message = f"Error during analysis with You.com (Langchain): {str(e)}"
            print(f"[ERROR] {error_message}")
            # Check if the error from YouChatLLM is one of our custom-raised ones to set status code
            if "timed out" in str(e).lower():
                 raise HTTPException(status_code=504, detail=error_message)
            elif "error communicating" in str(e).lower(): # Matches ConnectionError message from wrapper
                 raise HTTPException(status_code=502, detail=error_message)
            else: # Generic error from chain (e.g. Pydantic parsing if LLM output is bad)
                 raise HTTPException(status_code=500, detail=error_message)


        # Save the new analysis to MongoDB
        # Ensure structured_result is not None if an error occurred before its assignment
        if structured_result is None:
             # This case should ideally be caught by the exception block above and re-raised.
             # If it somehow gets here, it means an unhandled path.
             raise HTTPException(status_code=500, detail="Analysis failed to produce a result.")

        new_analysis_document = ArticleAnalysisDocument(
            url=article.url,
            title=article.title,
            content=article.content, # Storing full content, consider if truncation is needed for large articles
            issues=structured_result.issues
        )
        
        try:
            article_analyses_collection.insert_one(new_analysis_document.model_dump())
            print(f"Successfully saved analysis for URL: {article.url} to MongoDB.")
        except Exception as e_db:
            print(f"Error saving analysis to MongoDB for URL {article.url}: {e_db}")
            # Decide if you want to raise an error or just log, here we log and continue
            # raise HTTPException(status_code=500, detail=f"Failed to save analysis to database: {e_db}")

        total_time = time.time() - start_time
        print(f"[DEBUG] Total analysis time: {total_time:.2f} seconds")
        return AnalysisResponse(issues=structured_result.issues)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        total_time = time.time() - start_time
        print(f"[ERROR] Analysis failed after {total_time:.2f} seconds: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 