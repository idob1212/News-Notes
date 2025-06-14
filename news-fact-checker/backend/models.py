"""
Pydantic models for the News Fact-Checker API.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


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