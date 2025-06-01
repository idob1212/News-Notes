// Configuration for TruthPilot extension
// Switch between development and production environments

const CONFIG = {
  // Set this to 'development' or 'production'
  ENVIRONMENT: 'development', // Change this line to switch environments
  
  development: {
    API_BASE_URL: 'http://localhost:8000',
    API_ANALYZE_URL: 'http://localhost:8000/analyze'
  },
  
  production: {
    API_BASE_URL: 'https://news-notes.onrender.com', // Replace with your actual Render URL
    API_ANALYZE_URL: 'https://news-notes.onrender.com/analyze'
  },
  
  // Get current environment config
  getCurrentConfig() {
    return this[this.ENVIRONMENT];
  },
  
  // Get API URLs for current environment
  getApiUrl() {
    return this.getCurrentConfig().API_ANALYZE_URL;
  },
  
  getBaseUrl() {
    return this.getCurrentConfig().API_BASE_URL;
  }
};

// Make config available globally
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
} 