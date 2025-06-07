#!/usr/bin/env python3

import requests
import json
import sys

def test_api():
    """Test the fact-checking API"""
    
    # Test data with clearly false claims
    test_article = {
        "title": "Breaking: Scientists Discover Cure for All Diseases",
        "content": "In a groundbreaking study published yesterday, researchers at MIT have discovered a single pill that can cure all known diseases, including cancer, diabetes, and the common cold. The pill, called MiracleCure, works by reprogramming human DNA to eliminate all genetic predispositions to illness. Dr. John Smith, lead researcher, claims that human mortality could be eliminated within the next decade.",
        "url": "https://example.com/fake-news"
    }
    
    try:
        print("Testing fact-checking API...")
        print(f"Article Title: {test_article['title']}")
        print(f"Article URL: {test_article['url']}")
        print("\nSending request to API...")
        
        response = requests.post(
            "http://localhost:8000/analyze",
            headers={"Content-Type": "application/json"},
            json=test_article,
            timeout=60
        )
        
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ SUCCESS! API Response:")
            print(json.dumps(result, indent=2))
            
            if result.get("issues"):
                print(f"\n📊 Found {len(result['issues'])} issues:")
                for i, issue in enumerate(result["issues"], 1):
                    print(f"\n{i}. Issue:")
                    print(f"   Text: {issue.get('text', 'N/A')}")
                    print(f"   Explanation: {issue.get('explanation', 'N/A')}")
                    print(f"   Confidence: {issue.get('confidence_score', 'N/A')}")
                    if issue.get('source_urls'):
                        print(f"   Sources: {', '.join(issue['source_urls'])}")
            else:
                print("\n⚠️  No issues detected (unexpected for this fake article)")
                
        else:
            print(f"\n❌ API Error: {response.status_code}")
            try:
                error_detail = response.json()
                print(f"Error Detail: {error_detail}")
                
                if "API key" in str(error_detail):
                    print("\n💡 This error suggests you need to set up API keys.")
                    print("To fix this, create a .env file with your API keys:")
                    print("   OPENAI_API_KEY=your_openai_key")
                    print("   PERPLEXITY_API_KEY=your_perplexity_key") 
                    print("   YDC_API_KEY=your_you_com_key")
                    print("   MONGODB_CONNECTION_STRING=your_mongodb_string")
                    
            except:
                print(f"Raw response: {response.text}")
                
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to API server.")
        print("Make sure the server is running with: python main.py")
        return False
    except requests.exceptions.Timeout:
        print("❌ Request timed out. The API might be slow due to external API calls.")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False
        
    return response.status_code == 200

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
    # Then test the analysis endpoint
    success = test_api()
    
    if success:
        print("\n🎉 Test completed successfully!")
    else:
        print("\n💥 Test failed!")
        sys.exit(1) 