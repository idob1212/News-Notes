# News Fact-Checker Chrome Extension

A Chrome extension that analyzes news articles for potential misinformation, bias, or false claims, and highlights problematic sections directly on the page.

## Features

- Analyzes news articles from BBC websites (extendable to other sources)
- Uses LLMs to identify potential misinformation or misleading content
- **Leverages OpenAI's web search tool for real-time fact checking**
- Highlights problematic text directly on the article page
- Provides explanations for why content might be misleading
- Shows confidence scores for each identified issue
- **Includes source URLs that contradict misleading claims**

## Project Structure

- `/backend`: FastAPI backend with LangChain for LLM integration
- `/extension`: Chrome extension with content script, background script, and popup UI

## Backend Setup

1. Navigate to the backend directory:
```
cd backend
```

2. Create a virtual environment and activate it:
```
python -m venv venv
source venv/bin/activate  # On Windows, use: venv\Scripts\activate
```

3. Install dependencies:
```
pip install -r requirements.txt
```

4. Create a `.env` file with your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
```

5. Start the backend server:
```
python main.py
```

The server will start at http://localhost:8000.

## Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right corner)
3. Click "Load unpacked" and select the `extension` directory from this project
4. The extension should now be installed and visible in your browser toolbar

## Usage

1. Navigate to a BBC news article
2. Click the extension icon in the toolbar or use the popup interface
3. Click "Analyze This Article"
4. The extension will send the article content to the backend for analysis
5. If issues are found, they will be highlighted on the page
6. Hover over a highlight to see an explanation of the potential issue

## How It Works

The fact-checker uses OpenAI's web search tool to verify claims in real-time:

1. The article content is sent to the backend
2. The backend uses OpenAI's LLM with the web_search_preview tool
3. The LLM searches the web for information to verify claims
4. Misleading statements are identified with explanations and source URLs
5. Results are returned to the extension for display

## Extending the Extension

- To support additional news sites, update the `matches` array in `manifest.json`
- To modify the highlighting style, edit `styles.css`
- To change the analysis prompt, edit the template in `main.py`

## License

MIT

## Acknowledgments

- Uses [Mozilla's Readability.js](https://github.com/mozilla/readability) for article extraction
- Powered by OpenAI's language models via LangChain
- Web search functionality provided by OpenAI's web_search_preview tool 