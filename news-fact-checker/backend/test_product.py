#!/usr/bin/env python3
"""
Test product and price validity.
"""

import os
import requests
from dotenv import load_dotenv
from paddle_integration import PaddleBilling

def test_product_and_price():
    """Test if product and price IDs are valid."""
    load_dotenv()
    
    paddle = PaddleBilling()
    
    print("🔍 Testing product and price IDs...")
    print(f"Product ID: {paddle.config.premium_product_id}")
    print(f"Price ID: {paddle.config.premium_price_id}")
    
    # Test price ID specifically
    url = f"{paddle.config.api_base_url}/prices/{paddle.config.premium_price_id}"
    
    try:
        response = requests.get(url, headers=paddle.config.headers)
        print(f"Price API response status: {response.status_code}")
        
        if response.ok:
            price_data = response.json()
            print(f"✅ Price ID is valid!")
            print(f"Price details: {price_data}")
        else:
            print(f"❌ Price ID is invalid!")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"Error checking price: {e}")

if __name__ == "__main__":
    test_product_and_price() 