#!/usr/bin/env python3

import requests
import json
import sys

def test_api():
    """Test the fact-checking API (now requires auth)"""
    
    # First, register and login a test user to get a token
    print("\n--- Testing User Registration and Login ---")
    session = requests.Session()
    base_url = "http://localhost:8000"
    
    test_user_email = f"testuser_{int(requests.post(base_url + '/health').elapsed.total_seconds() * 1000)}@example.com"
    test_user_password = "testpassword123"

    # Register
    reg_payload = {"email": test_user_email, "password": test_user_password, "full_name": "Test User"}
    try:
        reg_response = session.post(f"{base_url}/auth/register", json=reg_payload, timeout=10)
        if reg_response.status_code == 200:
            print(f"✅ User registration successful for {test_user_email}")
            token_data = reg_response.json()
            auth_token = token_data.get("access_token")
        elif reg_response.status_code == 400 and "already registered" in reg_response.text:
            # If user already exists, try to login
            print(f"⚠️ User {test_user_email} already registered, attempting login...")
            login_payload = {"email": test_user_email, "password": test_user_password}
            login_response = session.post(f"{base_url}/auth/login", json=login_payload, timeout=10)
            if login_response.status_code == 200:
                print(f"✅ User login successful for {test_user_email}")
                token_data = login_response.json()
                auth_token = token_data.get("access_token")
            else:
                print(f"❌ User login failed: {login_response.status_code} - {login_response.text}")
                return False
        else:
            print(f"❌ User registration failed: {reg_response.status_code} - {reg_response.text}")
            return False

        if not auth_token:
            print("❌ Could not obtain auth token.")
            return False

        print("--- Testing /analyze endpoint (with auth) ---")
        test_article = {
            "title": "Breaking: Scientists Discover Cure for All Diseases",
            "content": "In a groundbreaking study published yesterday, researchers at MIT have discovered a single pill that can cure all known diseases, including cancer, diabetes, and the common cold. The pill, called MiracleCure, works by reprogramming human DNA to eliminate all genetic predispositions to illness. Dr. John Smith, lead researcher, claims that human mortality could be eliminated within the next decade.",
            "url": "https://example.com/fake-news-authtest" # Unique URL for this test
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }

        print("Testing fact-checking API with authentication...")
        print(f"Article Title: {test_article['title']}")
        print(f"Article URL: {test_article['url']}")
        print("\nSending request to API...")
        
        response = session.post(
            f"{base_url}/analyze",
            headers=headers,
            json=test_article,
            timeout=60  # Increased timeout for LLM calls
        )
        
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ SUCCESS! API Response:")
            print(json.dumps(result, indent=2))
            
            if result.get("issues"):
                print(f"\n📊 Found {len(result['issues'])} issues:")
                # (Detailed issue printing can be added here if needed)
            else:
                print("\n⚠️  No issues detected (unexpected for this fake article, but could be due to LLM variability)")
        elif response.status_code == 403:
             print(f"\n❌ API Error: {response.status_code} - Forbidden. This might be a usage limit issue.")
             print(f"Error Detail: {response.json()}")
        else:
            print(f"\n❌ API Error: {response.status_code}")
            try:
                error_detail = response.json()
                print(f"Error Detail: {error_detail}")
            except:
                print(f"Raw response: {response.text}")

        return response.status_code == 200

    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to API server.")
        print("Make sure the server is running with: python main.py")
        return False
    except requests.exceptions.Timeout:
        print("❌ Request timed out. The API might be slow due to external API calls or server load.")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_oauth_logins():
    """Test Google and Apple OAuth login endpoints (with dummy tokens)."""
    print("\n--- Testing OAuth Logins ---")
    session = requests.Session()
    base_url = "http://localhost:8000"
    all_oauth_passed = True

    # Test Google Login
    google_payload = {"token": "dummy_google_token_testoauth_12345"}
    try:
        print("Testing Google OAuth login...")
        response = session.post(f"{base_url}/auth/google", json=google_payload, timeout=10)
        if response.status_code == 200 and "access_token" in response.json():
            print(f"✅ Google OAuth login successful: {response.status_code}")
        else:
            print(f"❌ Google OAuth login failed: {response.status_code} - {response.text}")
            all_oauth_passed = False
    except Exception as e:
        print(f"❌ Google OAuth login error: {e}")
        all_oauth_passed = False

    # Test Apple Login
    apple_payload = {"token": "dummy_apple_token_testoauth_67890"}
    try:
        print("Testing Apple OAuth login...")
        response = session.post(f"{base_url}/auth/apple", json=apple_payload, timeout=10)
        if response.status_code == 200 and "access_token" in response.json():
            print(f"✅ Apple OAuth login successful: {response.status_code}")
        else:
            print(f"❌ Apple OAuth login failed: {response.status_code} - {response.text}")
            all_oauth_passed = False
    except Exception as e:
        print(f"❌ Apple OAuth login error: {e}")
        all_oauth_passed = False
        
    return all_oauth_passed

def test_server_health():
    """Test if the server is running"""
    try:
        response = requests.get("http://localhost:8000/", timeout=5)
        if response.status_code == 200:
            print("✅ Server is running!")
            return True
        else:
            print(f"⚠️  Server responded with status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running. Start it with: python main.py")
        return False
    except Exception as e:
        print(f"❌ Error checking server: {e}")
        return False

if __name__ == "__main__":
    print("🧪 News Fact-Checker API Test")
    print("=" * 40)
    
    # First check if server is running
    if not test_server_health():
        sys.exit(1)
    
    print()
    # Test the analysis endpoint (includes registration/login)
    analysis_success = test_api()

    print()
    # Test OAuth logins
    oauth_success = test_oauth_logins()
    
    if analysis_success and oauth_success:
        print("\n🎉 All tests completed successfully!")
    else:
        print("\n💥 Some tests failed!")
        sys.exit(1)