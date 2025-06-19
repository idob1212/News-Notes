#!/usr/bin/env python3
"""
Test checkout creation specifically.
"""

import os
from dotenv import load_dotenv
from paddle_integration import PaddleBilling

def test_checkout():
    """Test checkout creation with existing customer."""
    load_dotenv()
    
    paddle = PaddleBilling()
    
    # Use a test customer ID from the logs
    customer_id = "ctm_01jxznyyzcan1t69a5wgxrgerw"  # From your logs
    success_url = "https://example.com/success"
    cancel_url = "https://example.com/cancel"
    
    print("🔍 Testing checkout creation...")
    print(f"Customer ID: {customer_id}")
    print(f"Environment: {paddle.config.environment}")
    print(f"Price ID: {paddle.config.premium_price_id}")
    
    checkout_url = paddle.create_subscription_checkout(
        customer_id=customer_id,
        success_url=success_url,
        cancel_url=cancel_url
    )
    
    if checkout_url:
        print(f"✅ Checkout created successfully!")
        print(f"URL: {checkout_url}")
    else:
        print("❌ Checkout creation failed")

if __name__ == "__main__":
    test_checkout() 