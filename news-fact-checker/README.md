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

4. Create a `.env` file with your API keys:
```
OPENAI_API_KEY=your_openai_api_key_here
PERPLEXITY_API_KEY=your_perplexity_api_key_here
YOU_API_KEY=your_you_api_key_here
MONGODB_CONNECTION_STRING=your_mongodb_connection_string_here
```
   - `OPENAI_API_KEY`: Used for OpenAI services (if still applicable).
   - `PERPLEXITY_API_KEY`: Used for Perplexity AI services (currently not the primary analysis provider).
   - `YOU_API_KEY`: Required for the you.com API integration. The backend uses this key to interact with the You.com Research API via a custom Langchain LLM wrapper (`news-fact-checker/backend/you_langchain_wrapper.py`). This integration leverages Langchain for prompt management and structured output parsing from the API.
   - `MONGODB_CONNECTION_STRING`: Required to connect to your MongoDB instance for caching analysis results.

   The project uses `langchain` (already listed in `requirements.txt`) to orchestrate interactions with language models.

5. Start the backend server:
```
python main.py
```

The server will start at https://news-notes.onrender.com/.

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

The core analysis is performed by the backend:
1. Article content is sent from the Chrome extension to the backend.
2. The backend utilizes the You.com Research API, accessed via a custom Langchain LLM wrapper (`YouChatLLM`).
3. Langchain is used to:
    - Construct a detailed prompt for the You.com API, instructing it to analyze the article for inaccuracies, bias, or misleading statements.
    - Request a structured JSON output from the API.
    - Parse this JSON output into Pydantic models.
4. Identified issues (problematic text, explanation, source URLs, confidence score) are returned to the extension.
5. The extension then highlights these issues on the web page.
6. Caching is implemented using MongoDB to store analysis results and avoid re-processing identical articles.

## Extending the Extension

- To support additional news sites, update the `matches` array in `manifest.json`
- To modify the highlighting style, edit `styles.css`
- To change the analysis prompt, edit the template in `main.py`

## License

MIT

## Acknowledgments

- Uses [Mozilla's Readability.js](https://github.com/mozilla/readability) for article extraction
- Core analysis powered by the You.com Research API.
- Orchestration and interaction with the API is managed using the Langchain framework.
- Uses [Mozilla's Readability.js](https://github.com/mozilla/readability) for article extraction in the extension.