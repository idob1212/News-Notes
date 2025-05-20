#!/bin/bash

echo "Setting up News Fact-Checker project..."

# Setup backend
echo "Setting up backend..."
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Prompt for OpenAI API key
echo ""
echo "Please enter your OpenAI API key:"
read api_key
echo "OPENAI_API_KEY=$api_key" > .env
echo "API key saved to .env file"

echo ""
echo "Setup complete!"
echo ""
echo "To start the backend server:"
echo "  cd backend"
echo "  source venv/bin/activate  # On Windows, use: venv\\Scripts\\activate"
echo "  python main.py"
echo ""
echo "To install the Chrome extension:"
echo "  1. Open Chrome and go to chrome://extensions/"
echo "  2. Enable 'Developer mode' (toggle in top-right corner)"
echo "  3. Click 'Load unpacked' and select the 'extension' folder"
echo ""
echo "Once both are running, navigate to a BBC news article and click the extension icon!" 