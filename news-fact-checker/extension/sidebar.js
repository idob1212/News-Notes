// Sidebar script for News Notes extension

// Configuration will be loaded from the extension context
let NewsNotesConfig = null; // Renamed from TruthPilotConfig

// Load configuration - either from window global or fallback to inline config
function loadConfig() {
  // Prefer pre-loaded config from switch-env.js if available
  if (window.NewsNotesConfigGlobal && window.NewsNotesConfigGlobal.ENVIRONMENT) {
    NewsNotesConfig = window.NewsNotesConfigGlobal;
    console.log('Using global config from switch-env.js:', NewsNotesConfig);
    return NewsNotesConfig;
  }
  
  if (window.NewsNotesConfig) { // Check if already loaded by this script instance
    NewsNotesConfig = window.NewsNotesConfig;
    return NewsNotesConfig;
  }

  // Fallback: inline config if not available globally (should ideally not be used in production)
  console.warn('Global config not found, using fallback inline config.');
  NewsNotesConfig = {
    ENVIRONMENT: 'development', // Default to development if not set
    environments: {
      development: {
        API_BASE_URL: 'http://localhost:8000',
        API_ENDPOINT: 'http://localhost:8000/analyze'
      },
      production: {
        API_BASE_URL: 'https://news-notes.onrender.com',
        API_ENDPOINT: 'https://news-notes.onrender.com/analyze'
      }
    },
    get current() {
      return this.environments[this.ENVIRONMENT];
    },
    getApiUrl() {
      return this.current.API_ENDPOINT;
    },
    getBaseUrl() {
      return this.current.API_BASE_URL;
    },
    isDevelopment() {
      return this.ENVIRONMENT === 'development';
    },
    isProduction() {
      return this.ENVIRONMENT === 'production';
    }
  };
  
  window.NewsNotesConfig = NewsNotesConfig; // Make it available globally for this script instance
  return NewsNotesConfig;
}

document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const closeBtn = document.getElementById('closeBtn');
  const statusEl = document.getElementById('status'); // Renamed for clarity
  const resultsEl = document.getElementById('results'); // Renamed for clarity
  const resultCountEl = document.getElementById('resultCount'); // Renamed for clarity
  const issueListEl = document.getElementById('issueList'); // Renamed for clarity
  const emptyResultsStateEl = document.getElementById('emptyResultsState');
  
  // Account status elements
  const accountStatusEl = document.getElementById('accountStatus'); // Renamed
  const accountPlanEl = document.getElementById('accountPlan'); // Renamed
  const accountUsageEl = document.getElementById('accountUsage'); // Renamed
  const manageAccountBtn = document.getElementById('manageAccountBtn');
  
  const config = loadConfig();
  
  console.log(`News Notes sidebar running in ${config.ENVIRONMENT} mode`);
  console.log(`API URL: ${config.getApiUrl()}`);
  
  chrome.storage.local.get(['userConsent'], function(result) {
    if (!result.userConsent) {
      showConsentDialog();
    }
  });

  loadCachedResults();
  loadAccountStatus();
  
  function showConsentDialog() {
    const consentDiv = document.createElement('div');
    consentDiv.id = 'consentDialog'; // Added ID for easier targeting/styling if needed
    consentDiv.innerHTML = `
      <div class="consent-box">
        <h2>Data Processing Consent</h2>
        <p>This extension processes article content to check for misinformation. Article text will be sent to our servers for analysis. No personal data is stored.</p>
        <a href="privacy_policy.html" target="_blank" class="privacy-link">Read our Privacy Policy</a>
        <div class="consent-buttons">
          <button id="acceptConsentBtn" class="btn-accept">Accept</button>
          <button id="declineConsentBtn" class="btn-decline">Decline</button>
        </div>
      </div>
    `;
    // Basic styling for the consent dialog (can be moved to CSS)
    consentDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:1000; display:flex; justify-content:center; align-items:center;';
    const consentBox = consentDiv.querySelector('.consent-box');
    consentBox.style.cssText = 'background:white; padding:25px; border-radius:8px; max-width:320px; text-align:center; box-shadow: 0 5px 15px rgba(0,0,0,0.3);';
    consentBox.querySelector('h2').style.cssText = 'margin:0 0 15px 0; font-size:1.2em; color:#333;';
    consentBox.querySelector('p').style.cssText = 'font-size:0.9em; line-height:1.5; color:#555; margin-bottom:15px;';
    consentBox.querySelector('.privacy-link').style.cssText = 'display:block; margin:15px 0; font-size:0.9em; color:var(--primary-color);';
    const buttons = consentBox.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.style.cssText = 'padding:10px 20px; border:none; border-radius:5px; cursor:pointer; font-size:0.9em; margin:0 5px;';
    });
    consentBox.querySelector('.btn-accept').style.backgroundColor = 'var(--primary-color)';
    consentBox.querySelector('.btn-accept').style.color = 'white';
    consentBox.querySelector('.btn-decline').style.backgroundColor = '#eee';
    consentBox.querySelector('.btn-decline').style.color = '#333';

    document.body.appendChild(consentDiv);
    
    document.getElementById('acceptConsentBtn').addEventListener('click', () => {
      chrome.storage.local.set({userConsent: true});
      consentDiv.remove();
    });
    
    document.getElementById('declineConsentBtn').addEventListener('click', () => {
      consentDiv.remove();
      analyzeBtn.disabled = true;
      showStatusMessage('Consent required to use this extension. Click the extension icon again to provide consent.', 'error');
    });
  }
  
  function showLoadingState() {
    analyzeBtn.disabled = true;
    statusEl.innerHTML = '<span class="spinner"></span> Analyzing article...';
    statusEl.className = 'status loading'; // Add loading class for spinner styling
    statusEl.style.display = 'block';
    resultCountEl.style.display = 'none';
    issueListEl.innerHTML = ''; // Clear previous results
    emptyResultsStateEl.style.display = 'none';
  }

  function hideLoadingState() {
    analyzeBtn.disabled = false;
    statusEl.style.display = 'none';
    statusEl.className = 'status'; // Reset class
  }
  
  function showResults(issues, appliedHighlightsMap) {
    hideLoadingState();
    
    resultCountEl.textContent = `Found ${issues.length} potential ${issues.length === 1 ? 'issue' : 'issues'}`;
    resultCountEl.style.display = 'block';
    issueListEl.innerHTML = ''; // Clear previous issues or empty state

    if (issues.length === 0) {
      emptyResultsStateEl.style.display = 'block';
      return;
    }
    emptyResultsStateEl.style.display = 'none';
    
    issues.forEach((issue, index) => {
      const issueElement = document.createElement('div');
      issueElement.className = 'issue';
      
      const mappingEntry = appliedHighlightsMap ? appliedHighlightsMap.find(m => m.originalIssueIndex === index) : null;
      
      if (mappingEntry && mappingEntry.highlightId) {
        issueElement.dataset.highlightId = mappingEntry.highlightId;
        // issueElement.style.cursor = 'pointer'; // Already handled by CSS
        
        issueElement.addEventListener('click', () => {
          const currentHighlightId = issueElement.dataset.highlightId;
          if (currentHighlightId) { 
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollToHighlight', highlightId: currentHighlightId }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error sending scrollToHighlight message:", chrome.runtime.lastError.message);
                    issueElement.classList.add('click-error'); // Visual feedback
                    setTimeout(() => issueElement.classList.remove('click-error'), 1000);
                  } else if (!response || !response.success) {
                    console.error("ScrollToHighlight failed:", response?.error || "Unknown error");
                    issueElement.classList.add('click-error');
                    setTimeout(() => issueElement.classList.remove('click-error'), 1000);
                  } else {
                    issueElement.classList.add('click-success');
                    setTimeout(() => issueElement.classList.remove('click-success'), 1000);
                  }
                });
              } else {
                console.error("Could not find active tab to send scrollToHighlight message.");
              }
            });
          }
        });
      } else {
        issueElement.classList.add('issue-not-scrollable');
      }
      
      const textElement = document.createElement('div');
      textElement.className = 'issue-text';
      textElement.textContent = issue.text;
      issueElement.appendChild(textElement);
      
      const explanationElement = document.createElement('div');
      explanationElement.className = 'issue-explanation';
      explanationElement.textContent = issue.explanation;
      issueElement.appendChild(explanationElement);
      
      const confidenceElement = document.createElement('div');
      confidenceElement.className = 'issue-confidence';
      confidenceElement.textContent = `Confidence: ${Math.round(issue.confidence_score * 100)}%`;
      issueElement.appendChild(confidenceElement);
      
      if (issue.source_urls && issue.source_urls.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'sources';
        issue.source_urls.forEach(url => {
          const link = document.createElement('a');
          link.href = url;
          link.textContent = new URL(url).hostname; // Show domain instead of full URL
          link.title = url; // Full URL on hover
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.addEventListener('click', (e) => e.stopPropagation());
          sourcesDiv.appendChild(link);
        });
        issueElement.appendChild(sourcesDiv);
      }
      issueListEl.appendChild(issueElement);
    });
  }
  
  function showStatusMessage(message, type = 'info') { // type can be 'info', 'error', 'success'
    statusEl.innerHTML = message; // Supports HTML for links
    statusEl.className = `status ${type}`; // Apply class for styling
    statusEl.style.display = 'block';
    analyzeBtn.disabled = (type === 'error'); // Disable button on error
    resultCountEl.style.display = 'none';
    issueListEl.innerHTML = '';
    emptyResultsStateEl.style.display = 'none';
  }
  
  async function loadAccountStatus() {
    try {
      const authToken = await new Promise(resolve => {
        chrome.storage.local.get(['authToken'], result => resolve(result.authToken));
      });
      
      if (!authToken) {
        accountStatusEl.style.display = 'none';
        return;
      }
      
      const response = await fetch(`${config.getBaseUrl()}/auth/usage`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) chrome.storage.local.remove(['authToken']);
        accountStatusEl.style.display = 'none';
        return;
      }
      
      const usage = await response.json();
      
      accountPlanEl.textContent = usage.account_type.toUpperCase();
      accountPlanEl.className = `plan-badge ${usage.account_type.toLowerCase()}`; // Ensure class matches CSS (e.g. .free, .premium)
      
      const usageLimitDisplay = usage.usage_limit === 999999 ? '∞' : usage.usage_limit;
      accountUsageEl.textContent = `${usage.monthly_usage}/${usageLimitDisplay} this month`;
      
      accountUsageEl.className = 'usage-text'; // Reset classes
      if (usage.account_type === 'free') {
        const usagePercent = usage.monthly_usage / usage.usage_limit;
        if (usagePercent >= 1) accountUsageEl.classList.add('limit-reached');
        else if (usagePercent >= 0.8) accountUsageEl.classList.add('warning');
      }
      
      accountStatusEl.style.display = 'block';
    } catch (error) {
      console.log('Failed to load account status:', error);
      accountStatusEl.style.display = 'none';
    }
  }
  
  function loadCachedResults() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) return;
      const currentUrl = tabs[0].url;
      
      chrome.storage.local.get(['cachedResults'], function(result) {
        const cachedResultsObj = result.cachedResults || {};
        if (cachedResultsObj[currentUrl]) {
          const cachedIssues = cachedResultsObj[currentUrl];
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'highlight', issues: cachedIssues }, highlightResponse => {
              if (chrome.runtime.lastError || !highlightResponse || !highlightResponse.success) {
                showResults(cachedIssues, []);
              } else {
                showResults(cachedIssues, highlightResponse.appliedHighlightsMap);
              }
            });
          }, 300); // Reduced delay slightly
        } else {
           emptyResultsStateEl.style.display = 'block'; // Show empty state if no cache
        }
      });
    });
  }
  
  function cacheResults(url, issues) {
    chrome.storage.local.get(['cachedResults'], function(result) {
      const cachedResultsObj = result.cachedResults || {};
      cachedResultsObj[url] = issues;
      chrome.storage.local.set({ cachedResults: cachedResultsObj });
    });
  }
  
  analyzeBtn.addEventListener('click', async () => {
    try {
      const consentResult = await new Promise(resolve => {
        chrome.storage.local.get(['userConsent'], result => resolve(result.userConsent));
      });
      if (!consentResult) { showConsentDialog(); return; }
      
      showLoadingState();
      
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      const tab = tabs[0];
      
      const supportedSites = ['bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'reuters.com', 'walla.co.il', 'ynet.co.il', 'n12.co.il', 'c14.co.il', 'mako.co.il'];
      if (!supportedSites.some(site => tab.url.includes(site))) {
        showStatusMessage('This extension works best on major news sites (e.g., BBC, CNN, NYTimes). Analysis may be limited.', 'warning');
        // Allow to proceed but with a warning
      }
      
      chrome.tabs.sendMessage(tab.id, { action: 'analyze' }, response => {
        if (chrome.runtime.lastError) {
          showStatusMessage('Could not connect to the page. Please refresh and try again.', 'error');
          return;
        }
        if (!response || !response.success) {
          showStatusMessage(response?.error || 'Failed to extract article content.', 'error');
          return;
        }
        
        const article = response.article;
        
        chrome.storage.local.get(['cachedResults'], function(result) {
          const cachedResultsObj = result.cachedResults || {};
          const cachedResult = cachedResultsObj[tab.url];
          
          if (cachedResult && cachedResult.length >= 0) {
            chrome.tabs.sendMessage(tab.id, { action: 'highlight', issues: cachedResult }, highlightResponse => {
              if (chrome.runtime.lastError || !highlightResponse || !highlightResponse.success) {
                showResults(cachedResult, []);
              } else {
                showResults(cachedResult, highlightResponse.appliedHighlightsMap);
              }
            });
            return;
          }
          
          fetch(config.getBaseUrl(), { method: 'GET', signal: AbortSignal.timeout(10000) }) // Reduced connectivity timeout
            .then(connectResponse => performAnalysis(article, tab.url))
            .catch(connectError => {
              const errorMsg = connectError.name === 'TimeoutError' ?
                'Cannot connect to analysis server (timeout). Check your internet connection.' :
                'Cannot connect to analysis server. Check your internet connection.';
              showStatusMessage(errorMsg, 'error');
            });
        });
      });
    } catch (error) {
      showStatusMessage(error.message, 'error');
    }
  });

  async function performAnalysis(article, url) {
    const authToken = await new Promise(resolve => {
      chrome.storage.local.get(['authToken'], result => resolve(result.authToken));
    });
    if (!authToken) {
      showStatusMessage('Please <a href="account.html" target="_blank">sign in</a> to analyze articles.', 'error');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    fetch(config.getApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(article),
      signal: controller.signal
    })
    .then(async response => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        if (response.status === 401) {
          chrome.storage.local.remove(['authToken']);
          throw new Error('Your session has expired. Please <a href="account.html" target="_blank">sign in again</a>.');
        } else if (response.status === 403) {
          const errorData = await response.json();
          throw new Error(errorData.detail.includes('limit') ?
            'Monthly analysis limit reached. <a href="account.html" target="_blank">Upgrade to Premium</a>.' :
            'Access denied. Check your account status.');
        } else if (response.status === 429) {
          throw new Error('Too many requests. Please wait and try again.');
        }
        throw new Error(`API error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      cacheResults(url, data.issues);
      loadAccountStatus(); // Refresh usage
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) { // Ensure tab ID is current
          if (tabs && tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'highlight', issues: data.issues }, highlightResponse => {
                if (chrome.runtime.lastError || !highlightResponse || !highlightResponse.success) {
                    showResults(data.issues, []);
                } else {
                    showResults(data.issues, highlightResponse.appliedHighlightsMap);
                }
            });
          } else {
            showResults(data.issues, []); // Fallback if tab not found
          }
      });
    })
    .catch(error => {
      clearTimeout(timeoutId);
      const errorMsg = error.name === 'AbortError' ?
        'Analysis timed out. The server is busy or the article is very long. Try again later.' :
      error.message.includes('Failed to fetch') ?
        'Network error. Check your internet connection.' :
      error.message;
      showStatusMessage(errorMsg, 'error');
    });
  }
  
  closeBtn.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'closeSidebar'});
      }
    });
  });
  
  manageAccountBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('account.html') });
  });
});