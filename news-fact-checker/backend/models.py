"""
Pydantic models for the News Fact-Checker API.
"""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime
from enum import Enum


class Issue(BaseModel):
    """Model representing a fact-checking issue found in an article."""
    text: str = Field(description="The exact text that contains the issue")
    explanation: str = Field(description="A clear explanation of why it's misleading or false")
    confidence_score: float = Field(description="Confidence score (0.0-1.0) for the assessment")
    source_urls: Optional[List[str]] = Field(default=None, description="URLs of sources that contradict the claim")


class AnalysisOutput(BaseModel):
    """Model for structured LLM analysis output."""
    issues: List[Issue] = Field(description="List of problematic sections with text, explanation, and confidence score")


class ArticleAnalysisDocument(BaseModel):
    """Model for storing article analysis in the database."""
    url: str = Field(description="Unique URL identifier for the article")
    title: str = Field(description="Article title")
    content: str = Field(description="Full article content")
    issues: List[Issue] = Field(description="List of identified issues")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Timestamp when analysis was created")


class ArticleRequest(BaseModel):
    """Model for incoming article analysis requests."""
    title: str = Field(description="Article title")
    content: str = Field(description="Article content to analyze")
    url: str = Field(description="Article URL")


class AnalysisResponse(BaseModel):
    """Model for analysis response sent to clients."""
    issues: List[Issue] = Field(description="List of identified issues in the article")


# New models for user accounts and billing

class AccountType(str, Enum):
    """Enum for account types."""
    FREE = "free"
    PREMIUM = "premium"


class UserCreate(BaseModel):
    """Model for user registration."""
    email: EmailStr = Field(description="User email address")
    password: str = Field(min_length=8, description="User password (min 8 characters)")
    full_name: Optional[str] = Field(default=None, description="User full name")


class UserLogin(BaseModel):
    """Model for user login."""
    email: EmailStr = Field(description="User email address")
    password: str = Field(description="User password")


class User(BaseModel):
    """Model for user data."""
    id: Optional[str] = Field(default=None, description="User ID")
    email: EmailStr = Field(description="User email address")
    full_name: Optional[str] = Field(default=None, description="User full name")
    account_type: AccountType = Field(default=AccountType.FREE, description="Account type")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Account creation timestamp")
    is_active: bool = Field(default=True, description="Whether account is active")


class UserDocument(BaseModel):
    """Model for user document in database."""
    email: EmailStr = Field(description="User email address")
    full_name: Optional[str] = Field(default=None, description="User full name")
    hashed_password: str = Field(description="Hashed password")
    account_type: AccountType = Field(default=AccountType.FREE, description="Account type")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Account creation timestamp")
    is_active: bool = Field(default=True, description="Whether account is active")
    # Usage tracking for free accounts
    monthly_usage: int = Field(default=0, description="Articles analyzed this month")
    usage_reset_date: datetime = Field(default_factory=datetime.utcnow, description="When usage counter resets")
    analyzed_articles: List[str] = Field(default_factory=list, description="URLs of articles this user has analyzed")
    # Paddle integration
    paddle_customer_id: Optional[str] = Field(default=None, description="Paddle customer ID")
    paddle_subscription_id: Optional[str] = Field(default=None, description="Paddle subscription ID")


class UsageInfo(BaseModel):
    """Model for user usage information."""
    account_type: AccountType = Field(description="Account type")
    monthly_usage: int = Field(description="Articles analyzed this month")
    usage_limit: int = Field(description="Monthly usage limit")
    usage_reset_date: datetime = Field(description="When usage counter resets")
    can_analyze: bool = Field(description="Whether user can analyze more articles")


class Token(BaseModel):
    """Model for JWT token response."""
    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(description="Token expiration time in seconds")


class SubscriptionRequest(BaseModel):
    """Model for subscription creation request."""
    success_url: str = Field(description="URL to redirect to after successful payment")
    cancel_url: str = Field(description="URL to redirect to after cancelled payment")


class SubscriptionResponse(BaseModel):
    """Model for subscription creation response."""
    checkout_url: str = Field(description="Paddle checkout URL")
    subscription_id: Optional[str] = Field(default=None, description="Subscription ID if created")


class WebhookEvent(BaseModel):
    """Model for Paddle webhook events."""
    event_type: str = Field(description="Type of webhook event")
    data: dict = Field(description="Event data payload")
    signature: str = Field(description="Webhook signature for verification") 