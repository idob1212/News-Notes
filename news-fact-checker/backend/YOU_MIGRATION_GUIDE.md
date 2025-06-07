# You.com API Migration Guide

## Overview

This project has been updated to use the official LangChain You.com integration instead of the custom wrapper. This provides better stability, maintenance, and follows LangChain best practices.

## Changes Made

### 1. Environment Variable Change

**IMPORTANT:** The environment variable name has changed:

- **Old:** `YOU_API_KEY`
- **New:** `YDC_API_KEY`

### 2. Implementation Changes

- ✅ Removed custom `YouChatLLM` wrapper (`you_langchain_wrapper.py`)
- ✅ Replaced with official `langchain_community.llms.you.You` class
- ✅ Updated to use `research` endpoint for fact-checking
- ✅ Added robust JSON parsing for structured output
- ✅ Maintained fallback behavior for other LLMs

### 3. Code Changes

```python
# Old implementation
from you_langchain_wrapper import YouChatLLM
you_llm = YouChatLLM()  # Used YOU_API_KEY from env

# New implementation  
from langchain_community.llms.you import You
you_llm = You(ydc_api_key=ydc_api_key, endpoint="research")  # Uses YDC_API_KEY
```

## Migration Steps

### 1. Update Environment Variables

In your `.env` file, change:

```bash
# Old
YOU_API_KEY=your_api_key_here

# New
YDC_API_KEY=your_api_key_here
```

### 2. Install/Update Dependencies

Ensure you have the latest LangChain community package:

```bash
pip install langchain-community>=0.0.9
```

### 3. Test the Integration

Run the example script to verify everything works:

```bash
python example_you_usage.py
```

## Key Benefits

1. **Official Support:** Uses the officially maintained LangChain integration
2. **Better Error Handling:** More robust error handling and fallback mechanisms
3. **Endpoint Support:** Supports both "smart" and "research" endpoints
4. **Maintenance:** No need to maintain custom wrapper code
5. **Documentation:** Follows standard LangChain patterns and documentation

## API Endpoints

The official You class supports two endpoints:

- **`smart`** (default): General-purpose conversational AI
- **`research`** (recommended for fact-checking): Research-focused with web search capabilities

## Troubleshooting

### Authentication Issues

If you get authentication errors:

1. Verify your API key is correct
2. Ensure you're using `YDC_API_KEY` not `YOU_API_KEY`
3. Check that your You.com account has sufficient credits

### JSON Parsing Issues

The implementation includes robust JSON parsing that:

1. First tries direct parsing of the response
2. Falls back to regex extraction of JSON objects
3. Creates empty results if no valid JSON is found

### Testing

Use the provided `example_you_usage.py` script to test the integration:

```bash
cd news-fact-checker/backend
python example_you_usage.py
```

## API Compatibility

The updated implementation maintains the same external API for the FastAPI application. No changes are needed to the frontend or API consumers.

## Support

- [LangChain You Documentation](https://python.langchain.com/docs/integrations/llms/you)
- [You.com API Documentation](https://documentation.you.com/) 