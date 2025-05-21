from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from langchain_perplexity import ChatPerplexity
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document
import re
import asyncio

# Load environment variables from .env file
load_dotenv()

# Check if API key is available
perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
print(perplexity_api_key)
if not perplexity_api_key:
    raise ValueError("PERPLEXITY_API_KEY not found in environment variables. Please add it to your .env file.")

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

@app.get("/")
async def root():
    return {"message": "News Fact-Checker API"}

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_article(article: ArticleRequest):
    try:
        print(f"[DEBUG] Starting analysis of article: {article.title}")
        print(f"[DEBUG] Accessing API key: {perplexity_api_key[:4]}...") # Only show first few chars for security
        # Initialize the language model with Perplexity
        print("[DEBUG] Initializing language model")
        llm = ChatPerplexity(
            temperature=0,
            model="sonar-pro",
            api_key=perplexity_api_key
        )
        
        print("[DEBUG] Creating search prompt")
        # Create initial search prompt to find relevant information
        search_prompt = f"""
        I need to fact-check an article with the following content:
        
        Title: {article.title}
        
        Please identify key claims in this article that should be fact-checked. Focus specifically on:
        1. Potential fake news or fabricated information
        2. Misleading ways of presenting facts
        3. Politically biased framing of events
        4. Omission of crucial context
        5. Exaggerations or distortions
        
        Create specific search queries for these claims.
        Return only the search queries, one per line.
        """
        
        print("[DEBUG] Generating search queries using LLM")
        # Get search queries for key claims
        search_queries_response = llm.invoke(search_prompt)
        search_queries = search_queries_response.content.strip().split('\n')
        search_queries = [q.strip() for q in search_queries if q.strip()]
        
        print(f"[DEBUG] Generated {len(search_queries)} search queries")
        
        # Limit to top queries
        search_queries = search_queries[:10]
        print(f"[DEBUG] Limited to {len(search_queries)} search queries")
        
        # Bind structured output schema to the model
        print("[DEBUG] Binding structured output schema")
        structured_llm = llm.with_structured_output(AnalysisOutput)
        
        print("[DEBUG] Creating fact-check prompt")
        # Create the comprehensive fact-checking prompt leveraging Perplexity's search
        fact_check_prompt = f"""
        You are an expert fact-checker reviewing news articles for potential misinformation and bias.
        
        Analyze this article in detail:
        
        Title: {article.title}
        URL: {article.url}
        Content: {article.content}
        
        I need you to search the web for information related to the key claims in this article.
        Focus on these potential search queries to verify the claims:
        {' '.join(search_queries)}
        
        Based on your search results, identify any issues in the article, focusing specifically on:
        1. Fake news or fabricated information
        2. Misleading presentation of facts
        3. Political bias in framing events
        4. Omission of crucial context
        5. Exaggerations or distortions
        
        For each problematic section:
        1. Extract the exact text that contains the issue
        2. Provide a VERY CONCISE explanation of why it's misleading, false, or biased (maximum 3-4 lines)
        3. Assign a confidence score (0.0-1.0) for your assessment
        4. Include URLs of sources that contradict the claim or provide missing context
        
        Remember to only identify genuine issues backed by factual evidence.
        If there are no clear issues, return an empty list.
        The key goal is to give the user context and information that will help them understand the true situation regarding the article subject.
        """
        
        print("[DEBUG] Generating analysis with structured output")
        # Generate structured analysis using Perplexity's built-in search capability
        structured_result = structured_llm.invoke(fact_check_prompt)
        
        print(f"[DEBUG] Analysis complete, found {len(structured_result.issues)} issues")
        return {"issues": structured_result.issues}
    
    except Exception as e:
        print(f"[ERROR] Error in analyze_article: {e}")
        print("[ERROR] Error occurred at:")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 