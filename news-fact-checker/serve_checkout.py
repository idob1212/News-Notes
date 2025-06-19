#!/usr/bin/env python3
"""
Simple web server to serve checkout pages.
Run this to host your checkout page for Paddle.
"""

import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

# Configuration
PORT = 8080
CHECKOUT_DIR = Path(__file__).parent

class CheckoutHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CHECKOUT_DIR, **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

def start_server():
    """Start the checkout server."""
    try:
        with socketserver.TCPServer(("", PORT), CheckoutHandler) as httpd:
            print(f"🚀 Checkout server running at: http://localhost:{PORT}")
            print(f"📄 Checkout page: http://localhost:{PORT}/checkout.html")
            print(f"✅ Success page: http://localhost:{PORT}/success.html")
            print("\n" + "="*60)
            print("🔧 NEXT STEPS:")
            print("1. Copy this URL: http://localhost:8080/checkout.html")
            print("2. Go to your Paddle Dashboard")
            print("3. Navigate to Checkout Settings")
            print("4. Set 'Default Payment Link' to the URL above")
            print("5. Save the settings")
            print("6. Test your billing integration!")
            print("="*60)
            print("\n📝 Press Ctrl+C to stop the server")
            
            # Optionally open browser
            try:
                webbrowser.open(f"http://localhost:{PORT}/checkout.html")
            except:
                pass
            
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"❌ Port {PORT} is already in use")
            print(f"💡 Try: lsof -ti:{PORT} | xargs kill")
        else:
            print(f"❌ Error starting server: {e}")

if __name__ == "__main__":
    start_server() 