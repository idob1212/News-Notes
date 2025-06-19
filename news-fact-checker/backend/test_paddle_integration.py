#!/usr/bin/env python3
"""
Test script for Paddle integration.
This script helps verify your Paddle API configuration and permissions.
"""

import os
import sys
from dotenv import load_dotenv
from paddle_integration import PaddleBilling

def test_paddle_configuration():
    """Test Paddle API configuration and permissions."""
    print("🔍 Testing Paddle Integration Configuration...")
    print("=" * 50)
    
    # Load environment variables
    load_dotenv()
    
    # Initialize Paddle billing
    paddle = PaddleBilling()
    
    # Test 1: Configuration validation
    print("\n1. Testing Configuration...")
    if paddle.validate_configuration():
        print("✅ Configuration validation passed")
    else:
        print("❌ Configuration validation failed")
        print("💡 Check your .env file and ensure all required variables are set")
        return False
    
    # Test 2: API key permissions
    print("\n2. Testing API Key Permissions...")
    print(f"Environment: {paddle.config.environment}")
    print(f"API Base URL: {paddle.config.api_base_url}")
    
    # Try to create a test customer
    test_email = "test@example.com"
    test_name = "Test User"
    
    print(f"Attempting to create test customer: {test_email}")
    customer_id = paddle.create_customer(test_email, test_name)
    
    if customer_id:
        print(f"✅ Customer creation successful! Customer ID: {customer_id}")
        print("✅ API key has proper 'customer:write' permissions")
        
        # Clean up: In a real scenario, you might want to delete the test customer
        # but Paddle doesn't have a direct delete customer API in v1
        print("ℹ️  Test customer created successfully (cleanup not implemented)")
        
        return True
    else:
        print("❌ Customer creation failed!")
        print("💡 This usually means your API key lacks 'customer:write' scope")
        print("💡 Generate a new API key with these scopes:")
        print("   - customer:read")
        print("   - customer:write") 
        print("   - subscription:read")
        print("   - subscription:write")
        print("   - transaction:read")
        print("   - transaction:write")
        print("   - product:read")
        print("   - price:read")
        return False

def show_environment_info():
    """Show current environment configuration."""
    print("\n📋 Current Environment Configuration:")
    print("=" * 40)
    
    env_vars = [
        "PADDLE_ENVIRONMENT",
        "PADDLE_API_KEY", 
        "PADDLE_WEBHOOK_SECRET",
        "PADDLE_VENDOR_ID",
        "PADDLE_PREMIUM_PRODUCT_ID",
        "PADDLE_PREMIUM_PRICE_ID"
    ]
    
    for var in env_vars:
        value = os.getenv(var)
        if value:
            if "KEY" in var or "SECRET" in var:
                # Mask sensitive values
                masked_value = value[:8] + "..." if len(value) > 8 else "***"
                print(f"{var}: {masked_value}")
            else:
                print(f"{var}: {value}")
        else:
            print(f"{var}: ❌ NOT SET")

def main():
    """Main test function."""
    print("🧪 Paddle Integration Test Suite")
    print("================================")
    
    # Show environment info
    show_environment_info()
    
    # Test configuration
    success = test_paddle_configuration()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 All tests passed! Your Paddle integration is ready.")
    else:
        print("❌ Tests failed. Please fix the issues above.")
        print("📖 See PADDLE_SETUP_GUIDE.md for detailed setup instructions.")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main()) 