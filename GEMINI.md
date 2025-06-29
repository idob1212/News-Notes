# Project Context: News Fact-Checker Chrome Extension

This is a News Fact-Checker Chrome Extension project that analyzes news articles for potential misinformation, bias, or false claims. The project consists of a Python FastAPI backend and a Chrome extension frontend.

## Project Commands

### Backend Commands
- **Development server**: `cd backend && python main.py`
- **Install dependencies**: `cd backend && pip install -r requirements.txt`
- **Run tests**: `cd backend && pytest`
- **Specific test files**:
  - API tests: `pytest test_api.py`
  - Paddle integration tests: `pytest test_paddle_integration.py`
  - Product tests: `pytest test_product.py`
  - Checkout tests: `pytest test_checkout.py`

### Extension Commands
- **Install extension**: Load unpacked from `chrome://extensions/` pointing to `/extension` directory
- **Development**: No build process required, direct file editing

## Architecture & Technology Stack

### Backend (FastAPI + Python)
- **Framework**: FastAPI with uvicorn server
- **AI/ML**: LangChain + Perplexity API / You.com API for fact-checking
- **Database**: MongoDB with motor (async driver)
- **Authentication**: JWT tokens with PassLib for password hashing
- **Billing**: Paddle integration for subscription management
- **Testing**: pytest with mongomock for database mocking

### Frontend (Chrome Extension)
- **Manifest V3**: Modern Chrome extension architecture
- **Content Scripts**: Direct DOM manipulation for article highlighting
- **Background Service**: Handles API communication and state management
- **Popup/Sidebar**: User interface for interaction and settings

### Key Dependencies
```
fastapi==0.115.12          # Web framework
langchain-perplexity==0.1.0 # AI fact-checking
pymongo==4.6.0             # Database operations
PyJWT==2.8.0               # Authentication
requests==2.32.3           # HTTP client
beautifulsoup4==4.12.2     # HTML parsing
```

## Project Structure & File Organization

```
News Notes/
├── news-fact-checker/
│   ├── backend/              # Python FastAPI backend
│   │   ├── main.py          # Main FastAPI application and routing
│   │   ├── models.py        # Pydantic data models
│   │   ├── auth.py          # Authentication and user management
│   │   ├── paddle_integration.py # Billing and subscription logic
│   │   ├── utils.py         # Utility functions and helpers
│   │   ├── config.py        # Configuration and environment settings
│   │   ├── logger.py        # Logging configuration
│   │   ├── requirements.txt # Python dependencies
│   │   └── tests/           # Test files
│   ├── extension/           # Chrome extension files
│   │   ├── manifest.json    # Extension configuration
│   │   ├── content.js       # Content script for DOM manipulation
│   │   ├── background.js    # Service worker for API calls
│   │   ├── sidebar.js       # Sidebar UI logic
│   │   ├── account.js       # Account management UI
│   │   ├── *.css           # Styling files
│   │   └── *.html          # UI templates
│   └── README.md           # Project documentation
```

## Development Practices & Conventions

### Code Style
- **Python**: Follow PEP 8 conventions, use type hints
- **JavaScript**: Use modern ES6+ syntax, async/await for promises
- **Error Handling**: Comprehensive try-catch blocks with proper logging
- **API Design**: RESTful endpoints with clear request/response models

### Security Considerations
- JWT tokens for authentication with proper expiration
- Environment variables for sensitive API keys
- CORS configuration for browser security
- Input validation using Pydantic models

### Testing Strategy
- Unit tests for core business logic
- Integration tests for API endpoints
- Mock external services (MongoDB, Perplexity API) for testing
- Test coverage for authentication and billing flows

## Key Functional Areas

### 1. Article Analysis Pipeline
- **Input**: Web page content extraction via Chrome extension
- **Processing**: LangChain orchestration with LLM analysis
- **Output**: Structured JSON with identified issues, confidence scores, and source URLs

### 2. User Interface
- **Content Script**: Highlights problematic text directly on news articles
- **Sidebar**: Provides detailed explanations and navigation
- **Account Management**: User registration, login, and subscription status

### 3. Billing & Subscription
- **Paddle Integration**: Handles payment processing and webhook events
- **Usage Tracking**: Monitor API calls and enforce subscription limits
- **Account Management**: User tiers and feature access control

### 4. Data Management
- **MongoDB**: Stores user data, analysis cache, and subscription information
- **Caching**: Prevents re-analysis of identical articles
- **Logging**: Comprehensive request/response logging for debugging

## Environment Configuration

### Required Environment Variables
```bash
# Backend (.env file)
OPENAI_API_KEY=your_openai_api_key_here
PERPLEXITY_API_KEY=your_perplexity_api_key_here  
YDC_API_KEY=your_you_api_key_here
MONGODB_URL=your_mongodb_connection_string_here
SECRET_KEY=your_jwt_secret_key
PADDLE_VENDOR_ID=your_paddle_vendor_id
PADDLE_API_KEY=your_paddle_api_key
PADDLE_WEBHOOK_SECRET=your_paddle_webhook_secret
```

### Extension Configuration
- No environment variables needed (uses manifest.json configuration)
- API endpoints configured in background.js
- Development vs production modes handled via switch-env.js

## Development Workflow

1. **Backend Development**: Start with `python main.py` for hot-reloading
2. **Extension Development**: Edit files directly, reload extension in chrome://extensions/
3. **Testing**: Run `pytest` for backend, manual testing for extension
4. **Deployment**: Backend deployed to Render.com, extension distributed via Chrome Web Store

## Common Development Tasks

### Adding New Analysis Features
1. Update `models.py` with new Pydantic models
2. Modify analysis prompt in `main.py`
3. Update content script highlighting in `content.js`
4. Add corresponding tests in `tests/`

### Database Schema Changes
1. Update models in `models.py`
2. Create migration scripts if needed
3. Update test fixtures in `tests/`

### New API Endpoints
1. Add route in `main.py`
2. Create request/response models in `models.py`
3. Add authentication if required
4. Write comprehensive tests

## Debugging & Troubleshooting

### Backend Issues
- Check logs in console output
- Use `logger.py` for structured logging
- MongoDB connection issues: verify MONGODB_URL
- API rate limits: check external service quotas

### Extension Issues  
- Use Chrome Developer Tools for content script debugging
- Check background script logs in extension management page
- CORS issues: verify backend CORS configuration
- Content script injection: check manifest.json permissions

## Notes for AI Development

- Always check existing patterns before implementing new features
- Use the established error handling and logging patterns
- Follow the existing authentication and authorization flows
- Maintain consistency with the current API design
- Test both backend APIs and extension functionality
- Consider subscription limits and billing implications for new features
- Ensure proper error messages are shown to users via the extension UI

## External Dependencies & APIs

- **Perplexity API**: Used for fact-checking and analysis (primary)
- **You.com API**: Alternative fact-checking service  
- **OpenAI API**: Fallback option for analysis
- **MongoDB Atlas**: Database hosting
- **Paddle**: Payment processing and subscription management
- **Chrome Extensions API**: Browser integration and permissions 