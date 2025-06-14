from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import time
import traceback
from dotenv import load_dotenv

from config import settings
from logger import app_logger, analysis_logger
from models import Issue, ArticleRequest, AnalysisResponse
from utils import (
    setup_database_connection,
    setup_perplexity_llm,
    create_analysis_prompt,
    get_cached_analysis,
    save_analysis_to_cache,
    perform_fact_check_analysis
)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.VERSION
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=settings.ALLOW_CREDENTIALS,
    allow_methods=settings.ALLOWED_METHODS,
    allow_headers=settings.ALLOWED_HEADERS,
)

# Models are now imported from models.py

# Global variables for database and LLM
article_analyses_collection = None
perplexity_llm = None
analysis_prompt = None

def initialize_services():
    """Initialize database connection and LLM services."""
    global article_analyses_collection, perplexity_llm, analysis_prompt
    
    # Initialize database connection
    article_analyses_collection = setup_database_connection()
    
    # Initialize Perplexity LLM
    perplexity_llm = setup_perplexity_llm()
    
    # Create analysis prompt template
    analysis_prompt = create_analysis_prompt()
    
    app_logger.info("All services initialized successfully")

def handle_cached_analysis(url: str) -> AnalysisResponse:
    """
    Check for and return cached analysis if available.
    
    Args:
        url: Article URL to check for cached analysis
        
    Returns:
        AnalysisResponse: Cached analysis response
        
    Raises:
        None: Returns None if no cached analysis found
    """
    cached_issues = get_cached_analysis(article_analyses_collection, url)
    if cached_issues:
        analysis_logger.info(f"Found cached analysis for URL: {url}")
        return AnalysisResponse(issues=cached_issues)
    return None

def process_new_analysis(article: ArticleRequest) -> AnalysisResponse:
    """
    Process a new article analysis using Perplexity LLM.
    
    Args:
        article: Article data to analyze
        
    Returns:
        AnalysisResponse: Analysis results
        
    Raises:
        Exception: If analysis fails
    """
    analysis_logger.info(f"No cache found for URL: {article.url}. Starting new analysis with Perplexity Sonar Pro")
    
    # Perform fact-checking analysis
    analysis_result = perform_fact_check_analysis(
        llm=perplexity_llm,
        prompt=analysis_prompt,
        title=article.title,
        url=article.url,
        content=article.content
    )
    
    analysis_logger.info(f"Analysis completed for {article.url}, found {len(analysis_result.issues)} issues")
    
    # Save to cache
    save_success = save_analysis_to_cache(
        collection=article_analyses_collection,
        url=article.url,
        title=article.title,
        content=article.content,
        issues=analysis_result.issues
    )
    
    if not save_success:
        analysis_logger.warning(f"Failed to cache analysis for URL: {article.url}")
    
    return AnalysisResponse(issues=analysis_result.issues)

@app.on_event("startup")
async def startup_event():
    """Initialize services on application startup."""
    try:
        initialize_services()
    except Exception as e:
        app_logger.critical("Failed to initialize services", error=e)
        raise

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "News Fact-Checker API", "status": "running"}

@app.get("/health")
async def health_check():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "database": "connected" if article_analyses_collection else "disconnected",
        "llm": "configured" if perplexity_llm else "not configured"
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_article(article: ArticleRequest):
    """
    Analyze a news article for fact-checking issues.
    
    Args:
        article: Article data including title, content, and URL
        
    Returns:
        AnalysisResponse: Analysis results with identified issues
        
    Raises:
        HTTPException: If analysis fails
    """
    start_time = time.time()
    
    try:
        analysis_logger.info(f"Starting analysis for URL: {article.url}")
        
        # Check for cached analysis first
        cached_response = handle_cached_analysis(article.url)
        if cached_response:
            elapsed_time = time.time() - start_time
            analysis_logger.info(f"Returned cached analysis in {elapsed_time:.2f} seconds")
            return cached_response
        
        # Process new analysis
        response = process_new_analysis(article)
        
        elapsed_time = time.time() - start_time
        analysis_logger.info(f"Completed new analysis in {elapsed_time:.2f} seconds")
        
        return response
    
    except Exception as e:
        elapsed_time = time.time() - start_time
        analysis_logger.error(f"Analysis failed after {elapsed_time:.2f} seconds", error=e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD
    ) 