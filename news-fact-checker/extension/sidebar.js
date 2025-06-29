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
  
  // Show loading state with enhanced UX
  function showLoading() {
    analyzeBtn.disabled = true;
    analyzeBtn.style.transform = 'scale(0.98)';
    
    const loadingMessages = [
      'Analyzing article...',
      'Checking facts...',
      'Verifying sources...',
      'Processing content...'
    ];
    
    let messageIndex = 0;
    status.textContent = loadingMessages[messageIndex];
    status.style.display = 'block';
    
    // Rotate loading messages for engagement
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      status.textContent = loadingMessages[messageIndex];
    }, 2000);
    
    // Store interval ID for cleanup
    status.dataset.messageInterval = messageInterval;
  }
  
  // Celebration effect for completed analysis
  function celebrateCompletion() {
    // Clear loading message interval
    if (status.dataset.messageInterval) {
      clearInterval(parseInt(status.dataset.messageInterval));
      delete status.dataset.messageInterval;
    }
    
    // Add celebratory effect (visual feedback)
    const celebration = document.createElement('div');
    celebration.style.position = 'absolute';
    celebration.style.top = '20px';
    celebration.style.right = '20px';
    celebration.style.width = '24px';
    celebration.style.height = '24px';
    celebration.style.background = 'radial-gradient(circle, #fbbf24 0%, #f59e0b 100%)';
    celebration.style.borderRadius = '50%';
    celebration.style.animation = 'sparkle 0.8s ease-out';
    celebration.style.pointerEvents = 'none';
    celebration.style.zIndex = '1000';
    
    document.querySelector('.content').appendChild(celebration);
    
    setTimeout(() => {
      if (celebration.parentNode) {
        celebration.parentNode.removeChild(celebration);
      }
    }, 800);
    
    // Add satisfying button reset
    analyzeBtn.style.transform = '';
    analyzeBtn.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
  }
  
  // Enhanced feedback system
  function showFeedback(element, type, message) {
    // Create feedback tooltip
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.position = 'absolute';
    feedback.style.top = '-40px';
    feedback.style.left = '50%';
    feedback.style.transform = 'translateX(-50%)';
    feedback.style.background = type === 'success' ? 
      'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 
      'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    feedback.style.color = 'white';
    feedback.style.padding = '8px 12px';
    feedback.style.borderRadius = '8px';
    feedback.style.fontSize = '12px';
    feedback.style.fontWeight = '500';
    feedback.style.whiteSpace = 'nowrap';
    feedback.style.zIndex = '1000';
    feedback.style.opacity = '0';
    feedback.style.animation = 'feedbackSlide 2s ease-out forwards';
    feedback.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    
    // Ensure parent has relative positioning
    element.style.position = 'relative';
    element.appendChild(feedback);
    
    // Apply background animation to element
    element.classList.add(type === 'success' ? 'success-animation' : 'error-animation');
    
    // Cleanup
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
      element.classList.remove('success-animation', 'error-animation');
    }, 2000);
  }
  
  // Show results with enhanced dopamine triggers
  function showResults(issues, appliedHighlightsMap) {
    console.log('[sidebar.js] showResults called with:', {
      issuesCount: issues.length,
      appliedHighlightsMap: appliedHighlightsMap,
      mapLength: appliedHighlightsMap ? appliedHighlightsMap.length : 'undefined'
    });
    
    status.style.display = 'none';
    resultCount.style.display = 'block';
    
    // Add celebration effect for completion
    celebrateCompletion();
    
    // Update result count with dynamic messaging
    const issueText = issues.length === 0 ? 'No issues found!' : 
                     issues.length === 1 ? 'Found 1 potential issue' : 
                     `Found ${issues.length} potential issues`;
    resultCount.textContent = issueText;
    
    // Add success animation
    resultCount.classList.add('success-animation');
    setTimeout(() => resultCount.classList.remove('success-animation'), 600);
    
    // Clear previous issues
    issueList.innerHTML = '';
    
    // Add issues to the list with staggered animations
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
          
          // Add immediate haptic-like feedback
          issueElement.style.transform = 'scale(0.98)';
          setTimeout(() => {
            issueElement.style.transform = '';
          }, 150);
          
          // This inner check for currentHighlightId is technically redundant if mappingEntry.highlightId was valid,
          // but good for safety.
          if (currentHighlightId) { 
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              if (tabs && tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollToHighlight', highlightId: currentHighlightId }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error("Error sending scrollToHighlight message:", chrome.runtime.lastError.message);
                    // Enhanced error feedback
                    showFeedback(issueElement, 'error', 'Could not scroll to text');
                  } else if (!response || !response.success) {
                    console.error("ScrollToHighlight failed:", response?.error || "Unknown error");
                    // Enhanced error feedback
                    showFeedback(issueElement, 'error', 'Scrolling failed');
                  } else {
                    // Enhanced success feedback
                    showFeedback(issueElement, 'success', 'Scrolled to text!');
                  }
                });
              } else {
                console.error("Could not find active tab to send scrollToHighlight message.");
                showFeedback(issueElement, 'error', 'No active tab found');
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
      
      // Add staggered animation entrance
      issueElement.style.opacity = '0';
      issueElement.style.transform = 'translateY(20px)';
      issueElement.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
      
      issueList.appendChild(issueElement);
      
      // Trigger staggered animation
      setTimeout(() => {
        issueElement.style.opacity = '1';
        issueElement.style.transform = 'translateY(0)';
      }, index * 150); // Stagger by 150ms per issue
    });
    
    // Re-enable the button with enhanced feedback
    setTimeout(() => {
      analyzeBtn.disabled = false;
      analyzeBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      analyzeBtn.textContent = 'Analysis Complete!';
      
      // Reset button after a moment
      setTimeout(() => {
        analyzeBtn.style.background = '';
        analyzeBtn.textContent = 'Analyze This Article';
      }, 2000);
    }, issues.length * 150 + 300); // Wait for all animations to complete
  }
  
  // Show error message
  function showError(message) {
    console.log('[DEBUG] Showing error:', message);
    status.innerHTML = `Error: ${message}`; // Changed from textContent to innerHTML to support links
    status.style.display = 'block';
    analyzeBtn.disabled = false;
    
    // Clear loading message interval if it exists
    if (status.dataset.messageInterval) {
      clearInterval(parseInt(status.dataset.messageInterval));
      delete status.dataset.messageInterval;
    }
    
    // Reset button style
    analyzeBtn.style.transform = '';
    analyzeBtn.style.background = '';
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
        // Show account status with sign-in prompt
        accountPlan.textContent = 'NOT SIGNED IN';
        accountPlan.className = 'plan-badge';
        accountUsage.textContent = 'Sign in to track usage';
        accountUsage.className = 'usage-text';
        accountStatus.style.display = 'block';
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
      
      // Update usage display with safe encoding
      const usageLimit = usage.usage_limit === 999999 ? 'Unlimited' : usage.usage_limit;
      if (usage.account_type === 'premium') {
        accountUsage.textContent = 'Unlimited this month';
      } else {
        accountUsage.textContent = `${usage.monthly_usage}/${usageLimit} this month`;
      }
      
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
      console.log('[DEBUG] Analyze button clicked');
      
      // Prevent multiple simultaneous analyses
      if (analyzeBtn.disabled) {
        console.log('[DEBUG] Button already disabled, ignoring click');
        return;
      }
      
      // Check consent before proceeding
      const consentResult = await new Promise(resolve => {
        chrome.storage.local.get(['userConsent'], result => {
          resolve(result.userConsent);
        });
      });
      
      console.log('[DEBUG] Consent result:', consentResult);
      
      if (!consentResult) {
        console.log('[DEBUG] No consent, showing dialog');
        showConsentDialog();
        return;
      }
      
      // Show loading state
      console.log('[DEBUG] Showing loading state');
      showLoading();
      
      // Get current tab
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      const tab = tabs[0];
      
      console.log('[DEBUG] Current tab URL:', tab.url);
      
      // Check if the current page is a supported news article
      const supportedSites = ['bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'reuters.com', 'walla.co.il', 'ynet.co.il', 'n12.co.il', 'c14.co.il', 'mako.co.il'];
      
      const isSupported = supportedSites.some(site => tab.url.includes(site));
      console.log('[DEBUG] Is supported site:', isSupported);
      
      if (!isSupported) {
        console.log('[DEBUG] Unsupported site, showing error');
        showError('This extension only works on major news sites like BBC, CNN, NYTimes, etc.');
        return;
      }
      
      // Ask content script to extract article content
      console.log('[DEBUG] Sending message to content script');
      chrome.tabs.sendMessage(tab.id, { action: 'analyze' }, response => {
        console.log('[DEBUG] Content script response:', response);
        console.log('[DEBUG] Chrome runtime error:', chrome.runtime.lastError);
        
        if (chrome.runtime.lastError) {
          console.log('[DEBUG] Content script connection failed');
          showError('Could not connect to the page. Please refresh and try again.');
          return;
        }
        
        if (!response || !response.success) {
          console.log('[DEBUG] Content script extraction failed');
          showError(response?.error || 'Failed to extract article content.');
          return;
        }
        
        console.log('[DEBUG] Article extracted successfully');
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
          console.log('[DEBUG] Testing API connectivity to:', config.getBaseUrl());
          fetch(config.getBaseUrl(), {
            method: 'GET',
            signal: AbortSignal.timeout(15000) // Increased from 5000 to 15000 (15 seconds)
          })
          .then(connectResponse => {
            console.log('[DEBUG] API connectivity test passed:', connectResponse.status);
            
            // Now proceed with the actual analysis
            console.log('[DEBUG] Calling performAnalysis()');
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
          console.log('[DEBUG] performAnalysis() called');
          
          // Check authentication before proceeding
          const authToken = await new Promise(resolve => {
            chrome.storage.local.get(['authToken'], result => {
              resolve(result.authToken);
            });
          });
          
          console.log('[DEBUG] Auth token:', authToken ? 'exists' : 'missing');
          
          if (!authToken) {
            console.log('[DEBUG] No auth token, showing sign in error');
            showError('Please sign in to use this feature. Click "Manage Account" below to sign in.');
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
      console.log('[DEBUG] Caught error in analyze handler:', error);
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