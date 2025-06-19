"""
Authentication and user management utilities.
"""
import jwt
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models import User, UserDocument, AccountType
import os
from pymongo.collection import Collection

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token scheme
security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    users_collection: Collection = None
) -> User:
    """Get the current authenticated user."""
    if users_collection is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database not available"
        )
    
    token = credentials.credentials
    payload = verify_token(token)
    email = payload.get("sub")
    
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    user_doc = users_collection.find_one({"email": email})
    if user_doc is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Convert to User model
    user = User(
        id=str(user_doc["_id"]),
        email=user_doc["email"],
        full_name=user_doc.get("full_name"),
        account_type=AccountType(user_doc.get("account_type", AccountType.FREE)),
        created_at=user_doc["created_at"],
        is_active=user_doc.get("is_active", True)
    )
    
    return user


def reset_monthly_usage_if_needed(user_doc: dict) -> dict:
    """Reset monthly usage counter if it's a new month."""
    now = datetime.utcnow()
    usage_reset_date = user_doc.get("usage_reset_date", now)
    
    # If we're past the reset date, reset the usage
    if now >= usage_reset_date:
        # Set next reset date to next month
        if now.month == 12:
            next_reset = now.replace(year=now.year + 1, month=1, day=1)
        else:
            next_reset = now.replace(month=now.month + 1, day=1)
        
        user_doc["monthly_usage"] = 0
        user_doc["usage_reset_date"] = next_reset
    
    return user_doc


def can_user_analyze_article(user_doc: dict) -> bool:
    """Check if user can analyze another article based on their plan."""
    # Premium users have unlimited access
    if user_doc.get("account_type") == AccountType.PREMIUM:
        return True
    
    # Free users are limited to 5 articles per month
    user_doc = reset_monthly_usage_if_needed(user_doc)
    return user_doc.get("monthly_usage", 0) < 5


def increment_user_usage(users_collection: Collection, user_email: str) -> bool:
    """Increment user's monthly usage counter."""
    try:
        # Get current user document
        user_doc = users_collection.find_one({"email": user_email})
        if not user_doc:
            return False
        
        # Reset usage if needed
        user_doc = reset_monthly_usage_if_needed(user_doc)
        
        # Increment usage
        new_usage = user_doc.get("monthly_usage", 0) + 1
        
        # Update in database
        result = users_collection.update_one(
            {"email": user_email},
            {
                "$set": {
                    "monthly_usage": new_usage,
                    "usage_reset_date": user_doc["usage_reset_date"]
                }
            }
        )
        
        return result.modified_count > 0
    except Exception as e:
        print(f"Error incrementing user usage: {e}")
        return False


def verify_paddle_webhook(signature: str, request_body: bytes) -> bool:
    """Verify Paddle webhook signature."""
    paddle_webhook_secret = os.getenv("PADDLE_WEBHOOK_SECRET")
    if not paddle_webhook_secret:
        return False
    
    # Create signature
    expected_signature = hmac.new(
        paddle_webhook_secret.encode(),
        request_body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature) 