from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from contextlib import asynccontextmanager
import time
import traceback
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

from config import settings
from logger import app_logger, analysis_logger
from models import (
    Issue, ArticleRequest, AnalysisResponse, 
    UserCreate, UserLogin, User, Token, UsageInfo,
    SubscriptionRequest, SubscriptionResponse, WebhookEvent,
    SubscriptionConfirmation, SubscriptionConfirmationResponse,
    AccountType
)
from utils import (
    setup_database_connection,
    setup_perplexity_llm,
    create_analysis_prompt,
    get_cached_analysis,
    save_analysis_to_cache,
    perform_fact_check_analysis,
    perform_fact_check_analysis_stream,
    simulate_streaming_analysis
)
from auth import (
    hash_password, verify_password, create_access_token, get_current_user,
    can_user_analyze_article, increment_user_usage, reset_monthly_usage_if_needed,
    verify_paddle_webhook
)
from paddle_integration import paddle_billing

# Load environment variables
load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    # Startup
    try:
        initialize_services()
        app_logger.info("Application startup completed successfully")
    except Exception as e:
        app_logger.critical("Failed to initialize services", error=e)
        raise
    
    yield
    
    # Shutdown (if needed)
    app_logger.info("Application shutdown")

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.VERSION,
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=settings.ALLOW_CREDENTIALS,
    allow_methods=settings.ALLOWED_METHODS,
    allow_headers=settings.ALLOWED_HEADERS,
)

# Add middleware to set timeout headers
@app.middleware("http")
async def add_timeout_headers(request: Request, call_next):
    response = await call_next(request)
    # Add headers to help with client-side timeout handling
    response.headers["X-Request-Timeout"] = "120"  # Indicate server can handle 120 second requests
    response.headers["X-Cache-Control"] = "no-cache"  # Prevent aggressive caching during dev
    return response

# Global variables for database and LLM
article_analyses_collection = None
users_collection = None
perplexity_llm = None
analysis_prompt = None
security = HTTPBearer()

def initialize_services():
    """Initialize database connection and LLM services."""
    global article_analyses_collection, users_collection, perplexity_llm, analysis_prompt
    
    # Initialize database connection
    article_analyses_collection = setup_database_connection()
    
    # Initialize users collection
    from pymongo import MongoClient
    import os
    
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    client = MongoClient(mongodb_url)
    db = client.news_fact_checker
    users_collection = db.users
    
    # Create indexes for users collection
    users_collection.create_index("email", unique=True)
    users_collection.create_index("paddle_customer_id")
    users_collection.create_index("paddle_subscription_id")
    users_collection.create_index("analyzed_articles")
    
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



@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "News Fact-Checker API", "status": "running"}

@app.get("/health")
async def health_check():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "database": "connected" if article_analyses_collection is not None else "disconnected",
        "llm": "configured" if perplexity_llm else "not configured",
        "users_db": "connected" if users_collection is not None else "disconnected"
    }

# Authentication endpoints

@app.post("/auth/register", response_model=Token)
async def register_user(user_data: UserCreate):
    """Register a new user account."""
    try:
        # Check if user already exists
        existing_user = users_collection.find_one({"email": user_data.email})
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Hash password
        hashed_password = hash_password(user_data.password)
        
        # Create user document
        user_doc = {
            "email": user_data.email,
            "full_name": user_data.full_name,
            "hashed_password": hashed_password,
            "account_type": AccountType.FREE,
            "created_at": datetime.utcnow(),
            "is_active": True,
            "monthly_usage": 0,
            "usage_reset_date": datetime.utcnow().replace(day=1) + timedelta(days=32),
            "analyzed_articles": [],
            "paddle_customer_id": None,
            "paddle_subscription_id": None
        }
        
        # Insert user
        result = users_collection.insert_one(user_doc)
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create user")
        
        # Create Paddle customer (optional for now due to API key permissions)
        paddle_customer_id = paddle_billing.create_customer(
            email=user_data.email,
            name=user_data.full_name
        )
        
        if paddle_customer_id:
            users_collection.update_one(
                {"_id": result.inserted_id},
                {"$set": {"paddle_customer_id": paddle_customer_id}}
            )
        else:
            app_logger.warning(f"Could not create Paddle customer for {user_data.email} - will create on subscription")
        
        # Create access token
        access_token = create_access_token(data={"sub": user_data.email})
        
        app_logger.info(f"New user registered: {user_data.email}")
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            expires_in=7 * 24 * 60 * 60  # 7 days in seconds
        )
        
    except Exception as e:
        app_logger.error(f"User registration failed: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/auth/login", response_model=Token)
async def login_user(user_credentials: UserLogin):
    """Authenticate user and return access token."""
    try:
        # Find user
        user_doc = users_collection.find_one({"email": user_credentials.email})
        if not user_doc:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password
        if not verify_password(user_credentials.password, user_doc["hashed_password"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Check if account is active
        if not user_doc.get("is_active", True):
            raise HTTPException(status_code=401, detail="Account is disabled")
        
        # Create access token
        access_token = create_access_token(data={"sub": user_credentials.email})
        
        app_logger.info(f"User logged in: {user_credentials.email}")
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            expires_in=7 * 24 * 60 * 60  # 7 days in seconds
        )
        
    except HTTPException:
        raise
    except Exception as e:
        app_logger.error(f"User login failed: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@app.get("/auth/me", response_model=User)
async def get_current_user_info(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get current user information."""
    user = await get_current_user(credentials, users_collection)
    return user

@app.get("/auth/usage", response_model=UsageInfo)
async def get_user_usage(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Get user's usage information."""
    user = await get_current_user(credentials, users_collection)
    
    # Get user document for usage info
    user_doc = users_collection.find_one({"email": user.email})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Reset usage if needed
    user_doc = reset_monthly_usage_if_needed(user_doc)
    
    # Update in database if reset occurred
    if user_doc.get("monthly_usage", 0) == 0:
        users_collection.update_one(
            {"email": user.email},
            {"$set": {
                "monthly_usage": user_doc["monthly_usage"],
                "usage_reset_date": user_doc["usage_reset_date"]
            }}
        )
    
    usage_limit = 999999 if user.account_type == AccountType.PREMIUM else 10
    
    return UsageInfo(
        account_type=user.account_type,
        monthly_usage=user_doc.get("monthly_usage", 0),
        usage_limit=usage_limit,
        usage_reset_date=user_doc.get("usage_reset_date", datetime.utcnow()),
        can_analyze=can_user_analyze_article(user_doc)
    )

# Billing endpoints

@app.post("/billing/subscribe", response_model=SubscriptionResponse)
async def create_subscription(
    subscription_request: SubscriptionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Create a premium subscription."""
    user = await get_current_user(credentials, users_collection)
    
    # Validate Paddle configuration first
    if not paddle_billing.validate_configuration():
        app_logger.error("Paddle configuration is incomplete")
        raise HTTPException(
            status_code=500, 
            detail="Billing system not properly configured. Please contact support."
        )
    
    # Get user document
    user_doc = users_collection.find_one({"email": user.email})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user already has a subscription
    if user_doc.get("paddle_subscription_id"):
        raise HTTPException(status_code=400, detail="User already has an active subscription")
    
    # Get or create Paddle customer ID
    paddle_customer_id = user_doc.get("paddle_customer_id")
    if not paddle_customer_id:
        app_logger.info(f"Creating new Paddle customer for user: {user.email}")
        paddle_customer_id = paddle_billing.create_customer(
            email=user.email,
            name=user.full_name
        )
        if not paddle_customer_id:
            app_logger.error(f"Failed to create Paddle customer for user: {user.email}")
            raise HTTPException(
                status_code=500, 
                detail="Failed to create customer. Please check your Paddle API key permissions - it needs 'customer:write' scope. See PADDLE_SETUP_GUIDE.md for details."
            )
        
        users_collection.update_one(
            {"email": user.email},
            {"$set": {"paddle_customer_id": paddle_customer_id}}
        )
        app_logger.info(f"Successfully created Paddle customer: {paddle_customer_id}")
    
    # Create checkout URL that redirects to our checkout page with parameters
    from urllib.parse import urlencode
    
    checkout_params = {
        "customer_id": paddle_customer_id
    }
    
    # Add success and cancel URLs if provided
    if subscription_request.success_url:
        checkout_params["success_url"] = subscription_request.success_url
    if subscription_request.cancel_url:
        checkout_params["cancel_url"] = subscription_request.cancel_url
    
    # Create the checkout URL with parameters
    checkout_url = f"https://thetruthpilot.com/checkout?{urlencode(checkout_params)}"
    
    app_logger.info(f"Created checkout URL for customer {paddle_customer_id}: {checkout_url}")
    
    return SubscriptionResponse(checkout_url=checkout_url)

@app.post("/billing/cancel")
async def cancel_subscription(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Cancel user's premium subscription."""
    user = await get_current_user(credentials, users_collection)
    
    # Get user document
    user_doc = users_collection.find_one({"email": user.email})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    subscription_id = user_doc.get("paddle_subscription_id")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription found")
    
    # Cancel subscription in Paddle
    success = paddle_billing.cancel_subscription(subscription_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to cancel subscription")
    
    return {"message": "Subscription cancelled successfully"}

@app.post("/webhooks/paddle")
async def handle_paddle_webhook(request: Request):
    """Handle Paddle webhook events."""
    try:
        # Get request body
        body = await request.body()
        
        # Get signature header
        signature = request.headers.get("paddle-signature", "")
        
        # Verify webhook signature
        if not verify_paddle_webhook(signature, body):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        
        # Parse webhook data
        import json
        webhook_data = json.loads(body)
        
        event_type = webhook_data.get("event_type")
        event_data = webhook_data.get("data", {})
        
        # Process the webhook event
        success = paddle_billing.process_webhook_event(
            event_type=event_type,
            event_data=event_data,
            users_collection=users_collection
        )
        
        if success:
            app_logger.info(f"Processed Paddle webhook: {event_type}")
            return {"status": "success"}
        else:
            app_logger.error(f"Failed to process Paddle webhook: {event_type}")
            raise HTTPException(status_code=500, detail="Failed to process webhook")
        
    except Exception as e:
        app_logger.error(f"Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail="Webhook processing failed")

@app.post("/billing/manual-upgrade")
async def manual_upgrade_account(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Manually upgrade account to premium (for debugging payment issues)."""
    user = await get_current_user(credentials, users_collection)
    
    # Get user document
    user_doc = users_collection.find_one({"email": user.email})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user has a paddle customer ID (indicating they tried to pay)
    if not user_doc.get("paddle_customer_id"):
        raise HTTPException(status_code=400, detail="No payment attempt found")
    
    # Upgrade to premium
    result = users_collection.update_one(
        {"email": user.email},
        {"$set": {"account_type": AccountType.PREMIUM}}
    )
    
    if result.modified_count > 0:
        app_logger.info(f"Manually upgraded account to Premium: {user.email}")
        return {"message": "Account upgraded to Premium", "account_type": "PREMIUM"}
    else:
        raise HTTPException(status_code=500, detail="Failed to upgrade account")

@app.post("/billing/confirm-subscription", response_model=SubscriptionConfirmationResponse)
async def confirm_subscription(confirmation: SubscriptionConfirmation):
    """
    Confirm subscription and upgrade account after successful payment.
    This endpoint is called from the thank-you page to ensure account upgrade.
    """
    try:
        # Find user by email and customer ID
        user_doc = users_collection.find_one({
            "email": confirmation.customer_email,
            "paddle_customer_id": confirmation.customer_id
        })
        
        if not user_doc:
            app_logger.error(f"User not found for subscription confirmation: {confirmation.customer_email}, {confirmation.customer_id}")
            raise HTTPException(status_code=404, detail="User not found with provided credentials")
        
        # Check if user is already premium
        if user_doc.get("account_type") == AccountType.PREMIUM:
            app_logger.info(f"User already has premium account: {confirmation.customer_email}")
            return SubscriptionConfirmationResponse(
                success=True,
                message="Account is already premium",
                account_type=AccountType.PREMIUM
            )
        
        # Get subscription ID - either from confirmation or by fetching transaction details
        subscription_id = None
        if confirmation.subscription_id:
            subscription_id = confirmation.subscription_id
            app_logger.info(f"Using subscription ID from confirmation: {subscription_id}")
        else:
            # Try to get subscription ID from transaction details
            app_logger.info(f"Fetching transaction details to get subscription ID: {confirmation.transaction_id}")
            transaction_data = paddle_billing.get_transaction(confirmation.transaction_id)
            if transaction_data:
                subscription_id = transaction_data.get("subscription_id")
                if subscription_id:
                    app_logger.info(f"Found subscription ID from transaction: {subscription_id}")
                else:
                    app_logger.warning(f"No subscription ID found in transaction: {confirmation.transaction_id}")
        
        update_data = {"account_type": AccountType.PREMIUM}
        if subscription_id:
            update_data["paddle_subscription_id"] = subscription_id
        
        result = users_collection.update_one(
            {"email": confirmation.customer_email, "paddle_customer_id": confirmation.customer_id},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            app_logger.info(f"Successfully upgraded account to Premium via confirmation: {confirmation.customer_email}")
            return SubscriptionConfirmationResponse(
                success=True,
                message="Account successfully upgraded to Premium",
                account_type=AccountType.PREMIUM
            )
        else:
            app_logger.error(f"Failed to upgrade account via confirmation: {confirmation.customer_email}")
            raise HTTPException(status_code=500, detail="Failed to upgrade account")
    
    except HTTPException:
        raise
    except Exception as e:
        app_logger.error(f"Subscription confirmation error: {e}")
        raise HTTPException(status_code=500, detail="Subscription confirmation failed")

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_article(
    article: ArticleRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Analyze a news article for fact-checking issues.
    Now requires authentication and tracks usage.
    
    Args:
        article: Article data including title, content, and URL
        credentials: JWT token for authentication
        
    Returns:
        AnalysisResponse: Analysis results with identified issues
        
    Raises:
        HTTPException: If analysis fails or usage limit exceeded
    """
    start_time = time.time()
    
    try:
        # Get current user
        user = await get_current_user(credentials, users_collection)
        
        # Get user document for usage checking
        user_doc = users_collection.find_one({"email": user.email})
        if not user_doc:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if user can analyze another article
        if not can_user_analyze_article(user_doc):
            raise HTTPException(
                status_code=403, 
                detail="Monthly analysis limit reached. Please upgrade to premium for unlimited access."
            )
        
        analysis_logger.info(f"Starting analysis for URL: {article.url} (User: {user.email})")
        
        # Log request for debugging timeout issues
        analysis_logger.debug(f"Request details - Title length: {len(article.title) if article.title else 0}, Content length: {len(article.content) if article.content else 0}")
        
        # Check for cached analysis first
        cached_response = handle_cached_analysis(article.url)
        if cached_response:
            # Increment usage only if this is a new article for the user
            increment_user_usage(users_collection, user.email, article.url)
            elapsed_time = time.time() - start_time
            analysis_logger.info(f"Returned cached analysis in {elapsed_time:.2f} seconds (User: {user.email})")
            return cached_response
        
        # Process new analysis
        response = process_new_analysis(article)
        
        
        # Increment user usage for new article
        increment_user_usage(users_collection, user.email, article.url)
        
        elapsed_time = time.time() - start_time
        analysis_logger.info(f"Completed new analysis in {elapsed_time:.2f} seconds")
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        elapsed_time = time.time() - start_time
        analysis_logger.error(f"Analysis failed after {elapsed_time:.2f} seconds", error=e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/stream")
async def analyze_article_stream(
    article: ArticleRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Analyze a news article for fact-checking issues with streaming response.
    Returns Server-Sent Events (SSE) for real-time updates.
    
    Args:
        article: Article data including title, content, and URL
        credentials: JWT token for authentication
        
    Returns:
        StreamingResponse: SSE stream with analysis progress and results
        
    Raises:
        HTTPException: If analysis fails or usage limit exceeded
    """
    start_time = time.time()
    
    try:
        # Get current user
        user = await get_current_user(credentials, users_collection)
        
        # Get user document for usage checking
        user_doc = users_collection.find_one({"email": user.email})
        if not user_doc:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if user can analyze another article
        if not can_user_analyze_article(user_doc):
            raise HTTPException(
                status_code=403, 
                detail="Monthly analysis limit reached. Please upgrade to premium for unlimited access."
            )
        
        analysis_logger.info(f"Starting streaming analysis for URL: {article.url} (User: {user.email})")
        
        # Check for cached analysis first
        cached_issues = get_cached_analysis(article_analyses_collection, article.url)
        if cached_issues and settings.ENABLE_STREAMING:
            analysis_logger.info(f"Found cached analysis for streaming URL: {article.url}")
            
            # Increment usage for cached result
            increment_user_usage(users_collection, user.email, article.url)
            
            # Stream the cached results for better UX
            async def stream_cached_results():
                async for event in simulate_streaming_analysis(cached_issues, article.url):
                    yield event
            
            return StreamingResponse(
                stream_cached_results(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Cache-Control"
                }
            )
        
        # Perform new streaming analysis
        async def stream_new_analysis():
            try:
                # Use streaming analysis function
                async for event in perform_fact_check_analysis_stream(
                    llm=perplexity_llm,
                    prompt=analysis_prompt,
                    title=article.title,
                    url=article.url,
                    content=article.content,
                    collection=article_analyses_collection
                ):
                    yield event
                
            except Exception as e:
                analysis_logger.error(f"Streaming analysis error: {e}")
                import json
                from models import AnalysisError
                error_event = AnalysisError(
                    error_code="STREAMING_ERROR",
                    error_details=str(e),
                    message="Streaming analysis failed"
                )
                yield f"data: {json.dumps(error_event.model_dump())}\n\n"
        
        # Increment user usage for new analysis (we do this upfront for streaming)
        increment_user_usage(users_collection, user.email, article.url)
        
        return StreamingResponse(
            stream_new_analysis(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Cache-Control"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        elapsed_time = time.time() - start_time
        analysis_logger.error(f"Streaming analysis setup failed after {elapsed_time:.2f} seconds", error=e)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        timeout_keep_alive=120,  # Keep connections alive for 120 seconds
        timeout_graceful_shutdown=30  # Give 30 seconds for graceful shutdown
    ) 
