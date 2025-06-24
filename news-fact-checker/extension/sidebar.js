// Sidebar script for TruthPilot extension

// Configuration will be loaded from the extension context
let TruthPilotConfig = null;

// Load configuration - either from window global or fallback to inline config
function loadConfig() {
  if (window.TruthPilotConfig) {
    TruthPilotConfig = window.TruthPilotConfig;
    return TruthPilotConfig;
  }
  
  // Fallback: inline config if not available globally
  TruthPilotConfig = {
    // Set this to 'development' or 'production'
    ENVIRONMENT: 'development', // Change this to 'production' for prod builds
    
    // Environment-specific configurations
    environments: {
      development: {
        API_BASE_URL: 'http://localhost:8000',
        API_ENDPOINT: 'http://localhost:8000/analyze'
      },
      production: {
        API_BASE_URL: 'https://news-notes.onrender.com', // Replace with your actual Render URL
        API_ENDPOINT: 'https://news-notes.onrender.com/analyze'
      }
    },
    
    // Get current environment config
    get current() {
      return this.environments[this.ENVIRONMENT];
    },
    
    // Helper methods
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
  
  // Make it available globally
  window.TruthPilotConfig = TruthPilotConfig;
  
  return TruthPilotConfig;
}

document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const closeBtn = document.getElementById('closeBtn');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const resultCount = document.getElementById('resultCount');
  const issueList = document.getElementById('issueList');
  
  // Account status elements
  const accountStatus = document.getElementById('accountStatus');
  const accountPlan = document.getElementById('accountPlan');
  const accountUsage = document.getElementById('accountUsage');
  const manageAccountBtn = document.getElementById('manageAccountBtn');
  
  // Load configuration
  const config = loadConfig();
  
  // Log current environment
  console.log(`TruthPilot sidebar running in ${config.ENVIRONMENT} mode`);
  console.log(`API URL: ${config.getApiUrl()}`);
  
  // Check for user consent
  chrome.storage.local.get(['userConsent'], function(result) {
    if (!result.userConsent) {
      showConsentDialog();
    }
  });

  // Load any cached results
  loadCachedResults();
  
  // Load account status
  loadAccountStatus();
  
  // Function to show the consent dialog
  function showConsentDialog() {
    // Create consent dialog
    const consentDiv = document.createElement('div');
    consentDiv.style.position = 'fixed';
    consentDiv.style.top = '0';
    consentDiv.style.left = '0';
    consentDiv.style.width = '100%';
    consentDiv.style.height = '100%';
    consentDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    consentDiv.style.zIndex = '1000';
    consentDiv.style.display = 'flex';
    consentDiv.style.justifyContent = 'center';
    consentDiv.style.alignItems = 'center';
    
    const consentBox = document.createElement('div');
    consentBox.style.backgroundColor = 'white';
    consentBox.style.padding = '20px';
    consentBox.style.borderRadius = '8px';
    consentBox.style.maxWidth = '300px';
    
    const title = document.createElement('h2');
    title.textContent = 'Data Processing Consent';
    title.style.margin = '0 0 10px 0';
    
    const text = document.createElement('p');
    text.textContent = 'This extension processes article content to check for misinformation. Article text will be sent to our servers for analysis. No personal data is stored.';
    text.style.fontSize = '14px';
    text.style.lineHeight = '1.4';
    
    const privacyLink = document.createElement('a');
    privacyLink.href = 'privacy_policy.html';
    privacyLink.target = '_blank';
    privacyLink.textContent = 'Read our Privacy Policy';
    privacyLink.style.display = 'block';
    privacyLink.style.margin = '10px 0';
    privacyLink.style.fontSize = '14px';
    
    const acceptButton = document.createElement('button');
    acceptButton.textContent = 'Accept';
    acceptButton.style.backgroundColor = '#1a73e8';
    acceptButton.style.color = 'white';
    acceptButton.style.border = 'none';
    acceptButton.style.borderRadius = '4px';
    acceptButton.style.padding = '8px 16px';
    acceptButton.style.marginRight = '10px';
    acceptButton.style.cursor = 'pointer';
    
    const declineButton = document.createElement('button');
    declineButton.textContent = 'Decline';
    declineButton.style.backgroundColor = '#f1f3f4';
    declineButton.style.color = '#202124';
    declineButton.style.border = 'none';
    declineButton.style.borderRadius = '4px';
    declineButton.style.padding = '8px 16px';
    declineButton.style.cursor = 'pointer';
    
    const buttonDiv = document.createElement('div');
    buttonDiv.style.marginTop = '15px';
    buttonDiv.appendChild(acceptButton);
    buttonDiv.appendChild(declineButton);
    
    consentBox.appendChild(title);
    consentBox.appendChild(text);
    consentBox.appendChild(privacyLink);
    consentBox.appendChild(buttonDiv);
    consentDiv.appendChild(consentBox);
    document.body.appendChild(consentDiv);
    
    // Add event listeners
    acceptButton.addEventListener('click', () => {
      chrome.storage.local.set({userConsent: true});
      document.body.removeChild(consentDiv);
    });
    
    declineButton.addEventListener('click', () => {
      document.body.removeChild(consentDiv);
      analyzeBtn.disabled = true;
      status.textContent = 'Consent required to use this extension. Click the extension icon again to provide consent.';
      status.style.display = 'block';
    });
  }
  
  // Show loading state
  function showLoading() {
    analyzeBtn.disabled = true;
    status.textContent = 'Analyzing article...';
    status.style.display = 'block';
  }
  
  // Show results
  function showResults(issues, appliedHighlightsMap) {
    console.log('[sidebar.js] showResults called with:', {
      issuesCount: issues.length,
      appliedHighlightsMap: appliedHighlightsMap,
      mapLength: appliedHighlightsMap ? appliedHighlightsMap.length : 'undefined'
    });
    
    status.style.display = 'none';
    resultCount.style.display = 'block';
    
    // Update result count
    resultCount.textContent = `Found ${issues.length} potential ${issues.length === 1 ? 'issue' : 'issues'}`;
    
    // Clear previous issues
    issueList.innerHTML = '';
    
    // Add issues to the list
    issues.forEach((issue, index) => { // index here is originalIssueIndex
      console.log(`[sidebar.js] Processing issue ${index}:`, {
        text: issue.text.substring(0, 100) + '...',
        appliedHighlightsMap: appliedHighlightsMap
      });
      
      const issueElement = document.createElement('div');
      issueElement.className = 'issue';
      
      // Find the first mapping for this original issue index
      const mappingEntry = appliedHighlightsMap ? appliedHighlightsMap.find(m => m.originalIssueIndex === index) : null;
      console.log(`[sidebar.js] Mapping entry for issue ${index}:`, mappingEntry);
      
      if (mappingEntry && mappingEntry.highlightId) {
        console.log(`[sidebar.js] Issue ${index} WILL BE made clickable. highlightId:`, mappingEntry.highlightId);
        issueElement.dataset.highlightId = mappingEntry.highlightId;
        issueElement.style.cursor = 'pointer'; // Indicate it's clickable
        
        issueElement.addEventListener('click', () => {
          const currentHighlightId = issueElement.dataset.highlightId;
          console.log('[sidebar.js] Issue clicked, highlightId:', currentHighlightId);
          // This inner check for currentHighlightId is technically redundant if mappingEntry.highlightId was valid,
          // but good for safety.
          if (currentHighlightId) { 
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollToHighlight', highlightId: currentHighlightId }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error sending scrollToHighlight message:", chrome.runtime.lastError.message);
                    // Visual feedback that click didn't work
                    issueElement.style.background = '#ffebee';
                    setTimeout(() => issueElement.style.background = '', 500);
                  } else if (!response || !response.success) {
                    console.error("ScrollToHighlight failed:", response?.error || "Unknown error");
                    // Visual feedback that scrolling failed
                    issueElement.style.background = '#ffebee';
                    setTimeout(() => issueElement.style.background = '', 500);
                  } else {
                    // Visual feedback that click worked
                    issueElement.style.background = '#e8f5e8';
                    setTimeout(() => issueElement.style.background = '', 500);
                  }
                });
              } else {
                console.error("Could not find active tab to send scrollToHighlight message.");
                issueElement.style.background = '#ffebee';
                setTimeout(() => issueElement.style.background = '', 500);
              }
            });
          }
        });
      } else {
        console.log(`[sidebar.js] Issue ${index} WILL NOT be made clickable.`);
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
      
      // Add sources if available
      if (issue.source_urls && issue.source_urls.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'sources';
        
        issue.source_urls.forEach(url => {
          const link = document.createElement('a');
          link.href = url;
          link.textContent = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          
          // Ensure link is clickable
          link.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering the issue click
            // Let the default link behavior handle the navigation
          });
          
          sourcesDiv.appendChild(link);
        });
        
        issueElement.appendChild(sourcesDiv);
      }
      
      issueList.appendChild(issueElement);
    });
    
    // Re-enable the button
    analyzeBtn.disabled = false;
  }
  
  // Show error message
  function showError(message) {
    status.innerHTML = `Error: ${message}`; // Changed from textContent to innerHTML to support links
    status.style.display = 'block';
    analyzeBtn.disabled = false;
  }
  
  // Load and display account status
  async function loadAccountStatus() {
    try {
      const authToken = await new Promise(resolve => {
        chrome.storage.local.get(['authToken'], result => {
          resolve(result.authToken);
        });
      });
      
      if (!authToken) {
        accountStatus.style.display = 'none';
        return;
      }
      
      // Get user usage information
      const response = await fetch(`${config.getBaseUrl()}/auth/usage`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Clear invalid token
          chrome.storage.local.remove(['authToken']);
        }
        accountStatus.style.display = 'none';
        return;
      }
      
      const usage = await response.json();
      
      // Update account status display
      accountPlan.textContent = usage.account_type.toUpperCase();
      accountPlan.className = `plan-badge ${usage.account_type}`;
      
      // Update usage display
      const usageLimit = usage.usage_limit === 999999 ? '∞' : usage.usage_limit;
      accountUsage.textContent = `${usage.monthly_usage}/${usageLimit} this month`;
      
      // Update usage styling based on usage level
      accountUsage.className = 'usage-text';
      if (usage.account_type === 'free') {
        const usagePercent = usage.monthly_usage / usage.usage_limit;
        if (usagePercent >= 1) {
          accountUsage.className += ' limit-reached';
        } else if (usagePercent >= 0.8) {
          accountUsage.className += ' warning';
        }
      }
      
      accountStatus.style.display = 'block';
      
    } catch (error) {
      console.log('Failed to load account status:', error);
      accountStatus.style.display = 'none';
    }
  }
  
  // Load cached results for the current URL
  function loadCachedResults() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.warn('No active tab found for loading cached results');
        return;
      }
      
      const currentUrl = tabs[0].url;
      
      chrome.storage.local.get(['cachedResults'], function(result) {
        const cachedResultsObj = result.cachedResults || {};
        
        if (cachedResultsObj[currentUrl]) {
          const cachedIssues = cachedResultsObj[currentUrl];
          console.log('[sidebar.js] Found cached results for URL:', currentUrl, 'Issues count:', cachedIssues.length);
          
          // Add a delay to ensure content script is fully loaded
          setTimeout(() => {
            // Re-highlight the issues to get the mapping for clickability
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'highlight',
              issues: cachedIssues
            }, highlightResponse => {
              if (chrome.runtime.lastError) {
                console.warn('Failed to send highlight message to content script:', chrome.runtime.lastError.message);
                // Show results anyway, but without click functionality
                showResults(cachedIssues, []);
              } else if (!highlightResponse || !highlightResponse.success) {
                console.warn('Content script failed to highlight cached issues. Response:', highlightResponse);
                // Show results anyway, but without click functionality
                showResults(cachedIssues, []);
              } else {
                console.log('[sidebar.js] Successfully highlighted cached issues. Applied highlights map:', highlightResponse.appliedHighlightsMap);
                // Show results with proper highlight mapping
                showResults(cachedIssues, highlightResponse.appliedHighlightsMap);
              }
            });
          }, 500); // 500ms delay to ensure content script is ready
        } else {
          console.log('[sidebar.js] No cached results found for URL:', currentUrl);
        }
      });
    });
  }
  
  // Save results to cache
  function cacheResults(url, issues) {
    chrome.storage.local.get(['cachedResults'], function(result) {
      const cachedResultsObj = result.cachedResults || {};
      cachedResultsObj[url] = issues;
      
      chrome.storage.local.set({
        cachedResults: cachedResultsObj
      });
    });
  }
  
  // Analyze button click handler
  analyzeBtn.addEventListener('click', async () => {
    try {
      // Check consent before proceeding
      const consentResult = await new Promise(resolve => {
        chrome.storage.local.get(['userConsent'], result => {
          resolve(result.userConsent);
        });
      });
      
      if (!consentResult) {
        showConsentDialog();
        return;
      }
      
      // Show loading state
      showLoading();
      
      // Get current tab
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      const tab = tabs[0];
      
      // Check if the current page is a supported news article
      const supportedSites = ['bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'reuters.com', 'walla.co.il', 'ynet.co.il', 'n12.co.il', 'c14.co.il', 'mako.co.il'];
      
      if (!supportedSites.some(site => tab.url.includes(site))) {
        showError('This extension only works on major news sites like BBC, CNN, NYTimes, etc.');
        return;
      }
      
      // Ask content script to extract article content
      chrome.tabs.sendMessage(tab.id, { action: 'analyze' }, response => {
        if (chrome.runtime.lastError) {
          showError('Could not connect to the page. Please refresh and try again.');
          return;
        }
        
        if (!response || !response.success) {
          showError(response?.error || 'Failed to extract article content.');
          return;
        }
        
        const article = response.article;
        
        // Check if we have cached results for this URL first
        chrome.storage.local.get(['cachedResults'], function(result) {
          const cachedResultsObj = result.cachedResults || {};
          const cachedResult = cachedResultsObj[tab.url];
          
          if (cachedResult && cachedResult.length >= 0) {
            console.log('[DEBUG] Found cached results, using cached data instead of API call');
            status.style.display = 'none';
            
            // Highlight issues on the page using cached data
            chrome.tabs.sendMessage(tab.id, {
              action: 'highlight',
              issues: cachedResult
            }, highlightResponse => {
              console.log('[sidebar.js] Highlight response received for cached results:', highlightResponse);
              
              if (chrome.runtime.lastError || !highlightResponse || !highlightResponse.success) {
                console.warn('Failed to highlight cached issues on the page.', chrome.runtime.lastError);
                showResults(cachedResult, []);
              } else {
                showResults(cachedResult, highlightResponse.appliedHighlightsMap);
              }
            });
            return;
          }
          
          console.log('[DEBUG] No cached results found, proceeding with API call');
          // First, test basic connectivity to the API
          console.log('[DEBUG] Testing API connectivity...');
          fetch(config.getBaseUrl(), {
            method: 'GET',
            signal: AbortSignal.timeout(15000) // Increased from 5000 to 15000 (15 seconds)
          })
          .then(connectResponse => {
            console.log('[DEBUG] API connectivity test passed:', connectResponse.status);
            
            // Now proceed with the actual analysis
            performAnalysis();
          })
          .catch(connectError => {
            console.log('[DEBUG] API connectivity test failed:', connectError);
            if (connectError.name === 'TimeoutError') {
              showError('Cannot connect to analysis server (timeout). Please check your internet connection.');
            } else {
              showError('Cannot connect to analysis server. Please check your internet connection.');
            }
          });
        });
        
        async function performAnalysis() {
          // Check authentication before proceeding
          const authToken = await new Promise(resolve => {
            chrome.storage.local.get(['authToken'], result => {
              resolve(result.authToken);
            });
          });
          
          if (!authToken) {
            showError('Please sign in to use this feature. <a href="account.html" target="_blank">Sign in here</a>');
            return;
          }
          
          // Call the API with enhanced security and authentication
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('[DEBUG] AbortController timeout triggered after 120 seconds');
            controller.abort();
          }, 120000); // Increased from 60000 to 120000 (120 seconds for LLM processing)
          
          console.log('[DEBUG] Starting fetch request to:', config.getApiUrl());
          
          fetch(config.getApiUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Authorization': `Bearer ${authToken}`
            },
            credentials: 'omit',
            body: JSON.stringify(article),
            signal: controller.signal
          })
          .then(async response => {
            console.log('[DEBUG] Fetch response received:', response.status, response.statusText);
            if (!response.ok) {
              // Handle specific error cases
              if (response.status === 401) {
                // Clear invalid token
                chrome.storage.local.remove(['authToken']);
                throw new Error('Your session has expired. Please <a href="account.html" target="_blank">sign in again</a>.');
              } else if (response.status === 403) {
                const errorData = await response.json();
                if (errorData.detail && errorData.detail.includes('limit')) {
                  throw new Error('Monthly analysis limit reached. <a href="account.html" target="_blank">Upgrade to Premium</a> for unlimited access.');
                }
                throw new Error('Access denied. Please check your account status.');
              } else if (response.status === 429) {
                throw new Error('Too many requests. Please wait a moment and try again.');
              } else {
                throw new Error(`API error: ${response.status}`);
              }
            }
            return response.json();
          })
          .then(data => {
            console.log('[DEBUG] Response data received, clearing timeout');
            // Clear the timeout first since we got a successful response
            clearTimeout(timeoutId);
            
            console.log('[DEBUG] Data received:', { issuesCount: data.issues?.length });
            
            // Cache the results for this URL
            cacheResults(tab.url, data.issues);
            
            // Refresh account status to show updated usage
            loadAccountStatus();
            
            // Highlight issues on the page
            chrome.tabs.sendMessage(tab.id, {
              action: 'highlight',
              issues: data.issues
            }, highlightResponse => {
              console.log('[sidebar.js] Highlight response received:', highlightResponse);
              
              if (chrome.runtime.lastError || !highlightResponse || !highlightResponse.success) {
                console.warn('Failed to highlight issues on the page.', chrome.runtime.lastError);
                // Show results anyway, but without click functionality  
                showResults(data.issues, []);
              } else {
                console.log('[sidebar.js] Highlight successful, appliedHighlightsMap:', highlightResponse.appliedHighlightsMap);
                // Show results in sidebar
                showResults(data.issues, highlightResponse.appliedHighlightsMap);
              }
            });
          })
          .catch(error => {
            console.log('[DEBUG] Fetch error caught:', error.name, error.message);
            // Clear the timeout on error as well
            clearTimeout(timeoutId);
            
            // More specific error handling
            if (error.name === 'AbortError') {
              showError('Analysis timed out. The server is taking longer than expected. This might be due to high server load or a complex article. Please try again in a few moments.');
            } else if (error.message.includes('Failed to fetch')) {
              showError('Cannot connect to the analysis server. Please check your internet connection and try again.');
            } else if (error.message.includes('NetworkError')) {
              showError('Network error occurred. Please check your internet connection and try again.');
            } else {
              showError(error.message);
            }
          });
        }
      });
    } catch (error) {
      showError(error.message);
    }
  });
  
  // Close button click handler
  closeBtn.addEventListener('click', () => {
    // Send message to content script to close sidebar
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'closeSidebar'});
    });
  });
  
  // Manage account button click handler
  manageAccountBtn.addEventListener('click', () => {
    // Open account management page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('account.html') });
  });
}); 