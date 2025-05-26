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
        # Initialize the language model with Perplexity
        llm = ChatPerplexity(
            temperature=0,
            model="sonar-pro",
            api_key=perplexity_api_key
        )
        
        # Create initial search prompt to find relevant information
        search_prompt = f"""
        I need to analyze an article and provide important context for the reader:
        
        Title: {article.title}
        
        Identify key claims, assertions, and perspectives in this article that would benefit from additional context. Focus on:
        1. Claims that may be factually incomplete or misleading
        2. Perspectives that may present only one side of an issue
        3. Important historical or contextual information that's missing
        4. Statistical data or facts that should be verified
        5. Areas where political or ideological framing affects presentation
        
        Create specific search queries that will help find factual information about these claims.
        Return only the search queries, one per line.
        """
        
        # Get search queries for key claims
        search_queries_response = llm.invoke(search_prompt)
        search_queries = search_queries_response.content.strip().split('\n')
        search_queries = [q.strip() for q in search_queries if q.strip()]
        
        
        # Limit to top queries
        search_queries = search_queries[:30]
        
        # Bind structured output schema to the model
        structured_llm = llm.with_structured_output(AnalysisOutput)
        
        # Create the comprehensive fact-checking prompt leveraging Perplexity's search
        fact_check_prompt = f"""
        You are an impartial and highly discerning analyst. Your primary goal is to identify sections in news articles that could be biased, misleading, or cause a reader to misunderstand the facts. You must provide concise, valuable, and strictly factual explanations to clarify these points.
        
        Analyze this article carefully:
        
        Title: {article.title}
        URL: {article.url}
        Content: {article.content}
        
        Using the web, search for factual information related to the key points in this article, using these queries:
        {' '.join(search_queries)}
        
        Identify sections of the article that meet any of the following criteria:
        1. Information presented in a way that is biased or selectively framed.
        2. Claims or statements that are potentially misleading or deceptive.
        3. Sections where the omission of key facts could lead to a significant misunderstanding of the topic.
        4. Content that, due to its presentation, might cause a reader to form an incorrect understanding of the actual events or issues.
        
        For each identified section:
        1. Extract the exact text that is biased, misleading, or could cause misunderstanding.
        2. Provide a CONCISE and strictly FACT-BASED explanation (2-3 lines maximum) that clarifies the issue and presents the actual truth or necessary context. Ensure this explanation provides clear value to the user.
        3. Assign a confidence score (0.0-1.0) for your assessment.
        4. Include URLs of credible, factual sources that support your explanation and contradict or clarify the identified issue.
        
        Focus on providing accurate, factual information that corrects potential misunderstandings and counters biased or misleading content.
        If there are no clear issues requiring clarification, return an empty list.
        """
        
        # Generate structured analysis using Perplexity's built-in search capability
        structured_result = structured_llm.invoke(fact_check_prompt)
        
        return {"issues": structured_result.issues}
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 