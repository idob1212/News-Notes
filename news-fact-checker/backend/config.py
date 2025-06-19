"""
Configuration settings for the News Fact-Checker API.
"""
import os
from typing import List


class Settings:
    """Application settings and configuration."""
    
    # API Configuration
    APP_TITLE: str = "News Fact-Checker API"
    APP_DESCRIPTION: str = "API for fact-checking news articles using AI"
    VERSION: str = "1.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    RELOAD: bool = True
    
    # CORS Settings
    ALLOWED_ORIGINS: List[str] = ["*"]  # In production, specify extension ID
    ALLOW_CREDENTIALS: bool = True
    ALLOWED_METHODS: List[str] = ["*"]
    ALLOWED_HEADERS: List[str] = ["*"]
    
    # LLM Configuration
    PERPLEXITY_MODEL: str = "sonar-reasoning-pro"
    TEMPERATURE: float = 0.1
    MAX_TOKENS: int = 8000
    
    # Analysis Configuration
    MIN_PARAGRAPH_LENGTH: int = 30
    MIN_MEANINGFUL_PARAGRAPH_LENGTH: int = 50
    MIN_SENTENCES_PER_PARAGRAPH: int = 2
    MIN_PARAGRAPH_CHAR_LENGTH: int = 100
    MAX_PARAGRAPH_CHAR_LENGTH: int = 300
    MIN_CONTENT_LENGTH: int = 100
    
    # Database Configuration
    DATABASE_NAME: str = "news_fact_checker_db"
    COLLECTION_NAME: str = "article_analyses"
    
    @property
    def perplexity_api_key(self) -> str:
        """Get Perplexity API key from environment variables."""
        api_key = os.getenv("PERPLEXITY_API_KEY")
        if not api_key:
            raise ValueError("PERPLEXITY_API_KEY must be set in environment variables")
        return api_key
    
    @property
    def mongodb_connection_string(self) -> str:
        """Get MongoDB connection string from environment variables."""
        connection_string = os.getenv("MONGODB_URL")
        if not connection_string:
            raise ValueError("MONGODB_URL must be set in environment variables")
        return connection_string


# Global settings instance
settings = Settings() 