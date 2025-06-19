#!/usr/bin/env python3
"""
Test script for Paddle billing setup verification.
Run this to test your Paddle configuration before using the full application.
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_paddle_configuration():
    """Test Paddle configuration and basic API connectivity."""
    print("=== Paddle Configuration Test ===\n")
    
    # Check environment variables
    required_vars = [
        "PADDLE_API_KEY",
        "PADDLE_PREMIUM_PRICE_ID",
        "PADDLE_ENVIRONMENT"
    ]
    
    optional_vars = [
        "PADDLE_WEBHOOK_SECRET",
        "PADDLE_VENDOR_ID",
        "PADDLE_PREMIUM_PRODUCT_ID",
        "PADDLE_DEFAULT_PAYMENT_LINK"
    ]
    
    print("1. Checking environment variables:")
    missing_required = []
    for var in required_vars:
        value = os.getenv(var)
        if value:
            print(f"   ✓ {var}: {'*' * min(len(value), 10)}")
        else:
            print(f"   ✗ {var}: NOT SET")
            missing_required.append(var)
    
    print("\n   Optional variables:")
    for var in optional_vars:
        value = os.getenv(var)
        if value:
            print(f"   ✓ {var}: {'*' * min(len(value), 10)}")
        else:
            print(f"   - {var}: not set")
    
    if missing_required:
        print(f"\n❌ Missing required variables: {', '.join(missing_required)}")
        print("Please set these in your .env file before continuing.\n")
        return False
    
    print("\n2. Testing Paddle API connection:")
    try:
        from paddle_integration import paddle_billing
        
        # Test API key validation
        if paddle_billing.validate_configuration():
            print("   ✓ Paddle configuration validation passed")
        else:
            print("   ✗ Paddle configuration validation failed")
            return False
        
        # Test customer creation (optional - might fail due to API permissions)
        print("\n3. Testing customer creation (optional):")
        customer_id = paddle_billing.create_customer(
            email="test@example.com",
            name="Test User"
        )
        
        if customer_id:
            print(f"   ✓ Customer creation successful: {customer_id}")
        else:
            print("   ⚠ Customer creation failed (might be due to API key permissions)")
            print("   This is OK if you're using a read-only API key")
        
        # Test checkout URL creation
        print("\n4. Testing checkout URL creation:")
        checkout_url = paddle_billing.create_subscription_checkout(
            customer_id=customer_id or "test_customer_id",
            success_url="https://example.com/success",
            cancel_url="https://example.com/cancel"
        )
        
        if checkout_url:
            print(f"   ✓ Checkout URL created: {checkout_url}")
        else:
            print("   ⚠ Checkout URL creation failed")
            print("   Solutions:")
            print("   1. Set up Default Payment Link in Paddle Dashboard")
            print("   2. Add PADDLE_DEFAULT_PAYMENT_LINK to your .env")
            print("   3. Check the setup guide for detailed instructions")
        
        return True
        
    except ImportError as e:
        print(f"   ✗ Import error: {e}")
        print("   Make sure paddle_integration.py is in the same directory")
        return False
    except Exception as e:
        print(f"   ✗ Unexpected error: {e}")
        return False

def print_next_steps():
    """Print next steps for setup."""
    print("\n=== Next Steps ===")
    print("1. If customer creation failed:")
    print("   - Check your Paddle API key has 'customer:write' permissions")
    print("   - This might be OK for testing purposes")
    print("")
    print("2. If checkout URL creation failed:")
    print("   - Go to Paddle Dashboard → Checkout → Settings")
    print("   - Set up a Default Payment Link")
    print("   - OR add PADDLE_DEFAULT_PAYMENT_LINK to your .env file")
    print("")
    print("3. For production:")
    print("   - Change PADDLE_ENVIRONMENT to 'production'")
    print("   - Update all Paddle IDs to production values")
    print("   - Set up production webhooks")
    print("")
    print("4. Start your application:")
    print("   python main.py")

if __name__ == "__main__":
    print("Testing Paddle billing setup...\n")
    
    success = test_paddle_configuration()
    
    if success:
        print("\n✅ Paddle setup test completed!")
    else:
        print("\n❌ Paddle setup test failed!")
        sys.exit(1)
    
    print_next_steps() 