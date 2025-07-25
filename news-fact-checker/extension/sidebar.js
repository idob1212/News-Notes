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
  
  // Streaming progress elements
  const streamingProgress = document.getElementById('streamingProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const streamingMode = document.getElementById('streamingMode');
  const issuesFound = document.getElementById('issuesFound');
  
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
  function showLoading(isAutoAnalysis = false) {
    analyzeBtn.disabled = true;
    analyzeBtn.style.transform = 'scale(0.98)';
    
    // Update button text to indicate auto analysis
    if (isAutoAnalysis) {
      analyzeBtn.textContent = 'Auto-Analysis in Progress...';
    }
    
    const loadingMessages = [''];
    
    let messageIndex = 0;
    status.textContent = loadingMessages[messageIndex];
    status.style.display = 'block';
    status.classList.add('loading');
    
    // Rotate loading messages for engagement
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      status.textContent = loadingMessages[messageIndex];
    }, 2000);
    
    // Store interval ID for cleanup
    status.dataset.messageInterval = messageInterval;
  }
  
  // Show streaming loading state with progress updates
  function showStreamingLoading(isAutoAnalysis = false) {
    analyzeBtn.disabled = true;
    analyzeBtn.style.transform = 'scale(0.98)';
    
    if (isAutoAnalysis) {
      analyzeBtn.textContent = 'Auto-Analyzing...';
    } else {
      analyzeBtn.textContent = 'Analyzing...';
    }
    
    // Hide regular status and show streaming progress
    status.style.display = 'none';
    streamingProgress.style.display = 'block';
    
    // Initialize progress
    progressFill.style.width = '0%';
    progressText.textContent = '';
    streamingMode.textContent = isAutoAnalysis ? '🔄 Auto Analysis' : '🔄 Analyzing...';
    issuesFound.textContent = '0 issues found';
    
    // Clear any existing result count
    resultCount.style.display = 'none';
    issueList.innerHTML = '';
  }
  
  // Update streaming progress
  function updateStreamingProgress(percentage, step, issueCount = 0) {
    if (progressFill) {
      progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    }
    if (progressText) {
      progressText.textContent = step;
    }
    if (issuesFound) {
      const issueText = issueCount === 0 ? '0 issues found' :
                       issueCount === 1 ? '1 issue found' :
                       `${issueCount} issues found`;
      issuesFound.textContent = issueText;
    }
  }
  
  // Hide streaming progress and show regular results
  function hideStreamingProgress() {
    if (streamingProgress) {
      streamingProgress.style.display = 'none';
    }
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
    
    // Reset auto analysis flag
    window.isAutoAnalysisInProgress = false;
    
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
      addIssueToUI(issue, index, appliedHighlightsMap);
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
  
  // Add a single issue to the UI (used for both batch and streaming)
  function addIssueToUI(issue, index, appliedHighlightsMap, animate = true) {
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
      issueElement.style.cursor = 'pointer';
      
      // Add visual indicator for match quality
      if (mappingEntry.isApproximate) {
        issueElement.classList.add('approximate-match');
        issueElement.title = 'Approximate match found - text may not be exactly as shown';
      } else if (mappingEntry.matchFound) {
        issueElement.classList.add('exact-match');
        issueElement.title = 'Click to scroll to highlighted text';
      }
      
      // Enhanced click handler with better feedback
      issueElement.addEventListener('click', () => {
        const currentHighlightId = issueElement.dataset.highlightId;
        console.log('[sidebar.js] Issue clicked, highlightId:', currentHighlightId);
        
        // Enhanced visual feedback animation
        issueElement.style.transform = 'scale(0.98)';
        issueElement.style.filter = 'brightness(0.95)';
        
        setTimeout(() => {
          issueElement.style.transform = '';
          issueElement.style.filter = '';
        }, 200);
        
        if (currentHighlightId) { 
          // Send scroll message via postMessage
          window.parent.postMessage({ 
            action: 'scrollToHighlight', 
            highlightId: currentHighlightId 
          }, '*');
          
          // Set up listener for scroll response with timeout
          const scrollHandler = (event) => {
            if (event.data.action === 'scrollToHighlightResponse') {
              window.removeEventListener('message', scrollHandler);
              if (!event.data.success) {
                console.error("Error scrolling to highlight:", event.data.error);
                showFeedback(issueElement, 'error', mappingEntry.isApproximate ? 'Approximate text location' : 'Could not scroll to text');
              } else {
                showFeedback(issueElement, 'success', mappingEntry.isApproximate ? 'Scrolled to approximate match' : 'Scrolled to highlighted text');
              }
            }
          };
          
          window.addEventListener('message', scrollHandler);
          
          // Cleanup handler after timeout
          setTimeout(() => {
            window.removeEventListener('message', scrollHandler);
          }, 3000);
        }
      });
      
      // Enhanced hover effects
      issueElement.addEventListener('mouseenter', () => {
        issueElement.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
        issueElement.style.borderColor = '#3b82f6';
      });
      
      issueElement.addEventListener('mouseleave', () => {
        issueElement.style.boxShadow = '';
        issueElement.style.borderColor = '';
      });
      
    } else {
      console.log(`[sidebar.js] Issue ${index} WILL NOT be made clickable.`);
      issueElement.classList.add('issue-not-scrollable');
      issueElement.title = 'Text not found on page - may have been modified or is not visible';
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
        });
        
        sourcesDiv.appendChild(link);
      });
      
      issueElement.appendChild(sourcesDiv);
    }
    
    if (animate) {
      // Add staggered animation entrance
      issueElement.style.opacity = '0';
      issueElement.style.transform = 'translateY(20px)';
      issueElement.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
    }
    
    issueList.appendChild(issueElement);
    
    if (animate) {
      // Trigger staggered animation
      setTimeout(() => {
        issueElement.style.opacity = '1';
        issueElement.style.transform = 'translateY(0)';
      }, index * 150); // Stagger by 150ms per issue
    }
    
    return issueElement;
  }
  
  // Handle streaming issue (add issue with immediate highlighting)
  function handleStreamingIssue(issue, index, currentUrl) {
    console.log(`[sidebar.js] Handling streaming issue ${index}`);
    
    // Add to UI immediately with streaming animation
    const issueElement = addIssueToUI(issue, index, [], false);
    issueElement.classList.add('streaming-new'); // Add streaming animation class
    
    // Show results container if not visible
    resultCount.style.display = 'block';
    
    // Highlight the issue in the content
    window.parent.postMessage({
      action: 'highlight',
      issues: [issue]
    }, '*');
    
    // Set up listener for highlight response to update clickability
    const highlightHandler = (event) => {
      if (event.data.action === 'highlightResponse') {
        window.removeEventListener('message', highlightHandler);
        if (event.data.success && event.data.appliedHighlightsMap) {
          // Update the issue element with highlight mapping
          const mappingEntry = event.data.appliedHighlightsMap.find(m => m.originalIssueIndex === 0);
          if (mappingEntry && mappingEntry.highlightId && issueElement) {
            issueElement.dataset.highlightId = mappingEntry.highlightId;
            issueElement.style.cursor = 'pointer';
            issueElement.classList.remove('issue-not-scrollable');
            
            // Add click handler
            issueElement.addEventListener('click', () => {
              const currentHighlightId = issueElement.dataset.highlightId;
              if (currentHighlightId) {
                window.parent.postMessage({ 
                  action: 'scrollToHighlight', 
                  highlightId: currentHighlightId 
                }, '*');
              }
            });
          }
        }
      }
    };
    
    window.addEventListener('message', highlightHandler);
    setTimeout(() => window.removeEventListener('message', highlightHandler), 5000); // Cleanup after 5s
    
    // Remove streaming animation class after animation completes
    setTimeout(() => {
      issueElement.classList.remove('streaming-new');
    }, 500);
  }
  
  // Show error message
  function showError(message) {
    console.log('[DEBUG] Showing error:', message);
    
    // Reset auto analysis flag
    window.isAutoAnalysisInProgress = false;
    
    status.innerHTML = `Error: ${message}`; // Changed from textContent to innerHTML to support links
    status.style.display = 'block';
    status.classList.remove('loading'); // Remove loading spinner
    analyzeBtn.disabled = false;
    
    // Clear loading message interval if it exists
    if (status.dataset.messageInterval) {
      clearInterval(parseInt(status.dataset.messageInterval));
      delete status.dataset.messageInterval;
    }
    
    // Reset button style and text
    analyzeBtn.style.transform = '';
    analyzeBtn.style.background = '';
    analyzeBtn.textContent = 'Analyze This Article';
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
    // Request URL from content script (safer than cross-origin access)
    const urlHandler = (event) => {
      if (event.data.action === 'urlResponse') {
        window.removeEventListener('message', urlHandler);
        if (event.data.success && event.data.url) {
          const currentUrl = event.data.url;
          console.log('[sidebar.js] Got URL for cached results:', currentUrl);
          loadCachedResultsForUrl(currentUrl);
        } else {
          console.warn('Failed to get URL for cached results');
        }
      }
    };
    
    window.addEventListener('message', urlHandler);
    
    // Request URL from content script
    window.parent.postMessage({
      action: 'getUrl'
    }, '*');
    
    // Set timeout for URL request
    setTimeout(() => {
      window.removeEventListener('message', urlHandler);
    }, 3000);
  }
  
  // Helper function to load cached results for a specific URL
  function loadCachedResultsForUrl(currentUrl) {
    
    chrome.storage.local.get(['cachedResults'], function(result) {
      const cachedResultsObj = result.cachedResults || {};
      
      if (cachedResultsObj[currentUrl]) {
        const cachedIssues = cachedResultsObj[currentUrl];
        console.log('[sidebar.js] Found cached results for URL:', currentUrl, 'Issues count:', cachedIssues.length);
        
        // Add a delay to ensure content script is fully loaded
        setTimeout(() => {
          // Re-highlight the issues to get the mapping for clickability via postMessage
          window.parent.postMessage({
            action: 'highlight',
            issues: cachedIssues
          }, '*');
          
          // Set up listener for highlight response
          const highlightHandler = (event) => {
            if (event.data.action === 'highlightResponse') {
              window.removeEventListener('message', highlightHandler);
              if (!event.data.success) {
                console.warn('Failed to highlight cached issues on page');
                // Show results anyway, but without click functionality
                showResults(cachedIssues, []);
              } else {
                console.log('[sidebar.js] Successfully highlighted cached issues. Applied highlights map:', event.data.appliedHighlightsMap);
                // Show results with proper highlight mapping
                showResults(cachedIssues, event.data.appliedHighlightsMap);
              }
            }
          };
          window.addEventListener('message', highlightHandler);
        }, 500); // 500ms delay to ensure content script is ready
        } else {
          console.log('[sidebar.js] No cached results found for URL:', currentUrl);
        }
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
      const isAutoAnalysis = window.isAutoAnalysisInProgress || false;
      showLoading(isAutoAnalysis);
      
      // Get current URL from content script (safer than cross-origin access)
      let currentUrl = null;
      
      // Request URL from content script with retry logic
      let urlRequestAttempts = 0;
      const maxUrlRequestAttempts = 3;
      
      function requestUrlFromContentScript() {
        urlRequestAttempts++;
        console.log(`[DEBUG] Requesting URL from content script (attempt ${urlRequestAttempts})`);
        
        const urlHandler = (event) => {
          console.log('[DEBUG] Received message in sidebar:', event.data);
          if (event.data.action === 'urlResponse') {
            window.removeEventListener('message', urlHandler);
            if (event.data.success && event.data.url) {
              currentUrl = event.data.url;
              console.log('[DEBUG] Got URL from content script:', currentUrl);
              continueWithAnalysis();
            } else {
              console.log('[DEBUG] Failed to get URL from content script');
              showError('Could not access the current page URL. Please refresh and try again.');
            }
          }
        };
        
        window.addEventListener('message', urlHandler);
        
        // Request URL from content script
        console.log('[DEBUG] Sending getUrl message to parent window');
        window.parent.postMessage({
          action: 'getUrl'
        }, '*');
        
        // Set timeout for URL request with retry
        setTimeout(() => {
          window.removeEventListener('message', urlHandler);
          if (!currentUrl) {
            if (urlRequestAttempts < maxUrlRequestAttempts) {
              console.log(`[DEBUG] URL request attempt ${urlRequestAttempts} timed out, retrying...`);
              setTimeout(() => requestUrlFromContentScript(), 1000); // Retry after 1 second
            } else {
              console.log('[DEBUG] All URL request attempts timed out, trying fallback method');
              // Fallback: try chrome.tabs.query as last resort
              try {
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                  if (tabs && tabs[0] && tabs[0].url) {
                    currentUrl = tabs[0].url;
                    console.log('[DEBUG] Got URL from chrome.tabs fallback:', currentUrl);
                    continueWithAnalysis();
                  } else {
                    console.log('[DEBUG] Chrome.tabs fallback also failed');
                    showError('Could not get page URL. Please refresh and try again.');
                  }
                });
              } catch (error) {
                console.log('[DEBUG] Chrome.tabs fallback error:', error);
                showError('Could not get page URL. Please refresh and try again.');
              }
            }
          }
        }, 3000); // Reduced timeout to 3 seconds per attempt
      }
      
      // Start the URL request process with a small delay to ensure iframe is ready
      setTimeout(() => {
        requestUrlFromContentScript();
      }, 500);
      
      // Function to continue with analysis once we have the URL
      function continueWithAnalysis() {
        if (!currentUrl) {
          showError('No URL available for analysis.');
          return;
        }
      
      console.log('[DEBUG] Current URL:', currentUrl);
      
      // Check if the current page is a supported news article
      const supportedSites = ['bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'reuters.com', 'walla.co.il', 'ynet.co.il', 'n12.co.il', 'c14.co.il', 'mako.co.il'];
      
      const isSupported = supportedSites.some(site => currentUrl.includes(site));
      console.log('[DEBUG] Is supported site:', isSupported);
      
      if (!isSupported) {
        console.log('[DEBUG] Unsupported site, showing error');
        showError('This extension only works on major news sites like BBC, CNN, NYTimes, etc.');
        return;
      }
      
      // Ask content script to extract article content via postMessage
      console.log('[DEBUG] Sending message to content script via postMessage');
      
      // Set up listener for response from content script
      const messageHandler = (event) => {
        if (event.data.action === 'analyzeResponse') {
          window.removeEventListener('message', messageHandler);
          
          const response = event.data;
          console.log('[DEBUG] Content script response:', response);
          
          if (!response.success) {
            console.log('[DEBUG] Content script extraction failed');
            showError(response.error || 'Failed to extract article content.');
            return;
          }
          
          console.log('[DEBUG] Article extracted successfully');
          const article = response.article;
        
          // Check if we have cached results for this URL first
          chrome.storage.local.get(['cachedResults'], function(result) {
            const cachedResultsObj = result.cachedResults || {};
            const cachedResult = cachedResultsObj[currentUrl];
            
            if (cachedResult && cachedResult.length >= 0) {
              console.log('[DEBUG] Found cached results, using cached data instead of API call');
              status.style.display = 'none';
              
              // Highlight issues on the page using cached data via postMessage
              window.parent.postMessage({
                action: 'highlight',
                issues: cachedResult
              }, '*');
              
              // Set up listener for highlight response
              const highlightHandler = (event) => {
                if (event.data.action === 'highlightResponse') {
                  window.removeEventListener('message', highlightHandler);
                  console.log('[sidebar.js] Highlight response received for cached results:', event.data);
                  
                  if (!event.data.success) {
                    console.warn('Failed to highlight cached issues on the page.');
                    showResults(cachedResult, []);
                  } else {
                    showResults(cachedResult, event.data.appliedHighlightsMap);
                  }
                }
              };
              window.addEventListener('message', highlightHandler);
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
            performAnalysis(article);
          })
          .catch(connectError => {
            console.log('[DEBUG] API connectivity test failed:', connectError);
            if (connectError.name === 'TimeoutError') {
              showError('Cannot connect to analysis server (timeout). Please check your internet connection.');
            } else {
              showError('Cannot connect to analysis server. Please check your internet connection.');
            }
          });
          }); // Close chrome.storage.local.get callback
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Send the analyze request to content script
      window.parent.postMessage({
        action: 'analyze'
      }, '*');
      
      // Streaming analysis using fetch with streaming response
      async function performStreamingAnalysis(article, currentUrl, authToken) {
        console.log('[DEBUG] Starting streaming analysis');
        
        return new Promise((resolve, reject) => {
          const streamUrl = `${config.getBaseUrl()}/analyze/stream`;
          console.log('[DEBUG] Streaming URL:', streamUrl);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('[DEBUG] Streaming timeout after 300 seconds');
            controller.abort();
            reject(new Error('Streaming analysis timed out'));
          }, 300000); // 5 minutes for streaming
          
          fetch(streamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache'
            },
            credentials: 'omit',
            body: JSON.stringify(article),
            signal: controller.signal
          })
          .then(async response => {
            console.log('[DEBUG] Streaming response received:', response.status);
            
            if (!response.ok) {
              clearTimeout(timeoutId);
              throw new Error(`Streaming failed: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let issueCount = 0;
            let streamingIssues = [];
            
            showStreamingLoading(window.isAutoAnalysisInProgress || false);
            
            async function readStream() {
              try {
                const { done, value } = await reader.read();
                
                if (done) {
                  clearTimeout(timeoutId);
                  console.log('[DEBUG] Streaming completed');
                  
                  // Cache the results
                  cacheResults(currentUrl, streamingIssues);
                  
                  // Refresh account status
                  loadAccountStatus();
                  
                  // Final UI updates
                  finalizeStreamingAnalysis(streamingIssues);
                  
                  resolve(streamingIssues);
                  return;
                }
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const eventData = JSON.parse(line.slice(6));
                      console.log('[DEBUG] Streaming event:', eventData);
                      
                      handleStreamingEvent(eventData, streamingIssues, currentUrl);
                      
                      if (eventData.event_type === 'issue') {
                        issueCount++;
                        streamingIssues.push(eventData.issue);
                      }
                      
                    } catch (parseError) {
                      console.warn('[DEBUG] Failed to parse streaming event:', line, parseError);
                    }
                  }
                }
                
                // Continue reading
                await readStream();
                
              } catch (streamError) {
                clearTimeout(timeoutId);
                console.error('[DEBUG] Streaming read error:', streamError);
                
                if (streamError.name === 'AbortError') {
                  reject(new Error('Streaming analysis timed out'));
                } else {
                  reject(streamError);
                }
              }
            }
            
            await readStream();
            
          })
          .catch(error => {
            clearTimeout(timeoutId);
            console.error('[DEBUG] Streaming fetch error:', error);
            reject(error);
          });
        });
      }
      
      // Handle individual streaming events
      function handleStreamingEvent(eventData, streamingIssues, currentUrl) {
        switch (eventData.event_type) {
          case 'start':
            console.log('[DEBUG] Analysis started');
            updateStreamingProgress(5, eventData.message || 'Analysis started...', 0);
            break;
            
          case 'progress':
            const percentage = Math.round(eventData.progress_percentage * 100);
            console.log(`[DEBUG] Progress: ${percentage}%`);
            updateStreamingProgress(percentage, eventData.current_step, streamingIssues.length);
            break;
            
          case 'issue':
            console.log('[DEBUG] New issue received:', eventData.issue);
            handleStreamingIssue(eventData.issue, eventData.issue_index, currentUrl);
            updateStreamingProgress(
              Math.min(90, 30 + (streamingIssues.length * 10)), 
              `Processing issue ${streamingIssues.length + 1}...`,
              streamingIssues.length + 1
            );
            break;
            
          case 'complete':
            console.log('[DEBUG] Analysis complete');
            updateStreamingProgress(100, eventData.message || 'Analysis complete!', streamingIssues.length);
            setTimeout(() => hideStreamingProgress(), 1000); // Hide after 1 second
            break;
            
          case 'error':
            console.error('[DEBUG] Streaming error:', eventData);
            hideStreamingProgress();
            showError(eventData.message || 'Streaming analysis failed');
            break;
        }
      }
      
      // Update issue count during streaming
      function updateIssueCount(count) {
        resultCount.style.display = 'block';
        const issueText = count === 0 ? 'No issues found yet...' : 
                         count === 1 ? 'Found 1 potential issue' : 
                         `Found ${count} potential issues`;
        resultCount.textContent = issueText;
      }
      
      // Finalize streaming analysis
      function finalizeStreamingAnalysis(issues) {
        status.style.display = 'none';
        celebrateCompletion();
        
        // Update final count
        const issueText = issues.length === 0 ? 'No issues found!' : 
                         issues.length === 1 ? 'Found 1 potential issue' : 
                         `Found ${issues.length} potential issues`;
        resultCount.textContent = issueText;
        
        // Re-enable button
        analyzeBtn.disabled = false;
        analyzeBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        analyzeBtn.textContent = 'Analysis Complete!';
        
        setTimeout(() => {
          analyzeBtn.style.background = '';
          analyzeBtn.textContent = 'Analyze This Article';
        }, 2000);
      }
      
      // Regular analysis fallback
      async function performRegularAnalysis(article, currentUrl, authToken) {
        console.log('[DEBUG] Starting regular analysis fallback');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log('[DEBUG] AbortController timeout triggered after 120 seconds');
          controller.abort();
        }, 120000);
        
        console.log('[DEBUG] Starting fetch request to:', config.getApiUrl());
        
        return fetch(config.getApiUrl(), {
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
          clearTimeout(timeoutId);
          
          console.log('[DEBUG] Data received:', { issuesCount: data.issues?.length });
          
          // Cache the results for this URL
          cacheResults(currentUrl, data.issues);
          
          // Refresh account status to show updated usage
          loadAccountStatus();
          
          // Highlight issues on the page via postMessage
          window.parent.postMessage({
            action: 'highlight',
            issues: data.issues
          }, '*');
          
          // Set up listener for highlight response
          const highlightHandler = (event) => {
            if (event.data.action === 'highlightResponse') {
              window.removeEventListener('message', highlightHandler);
              console.log('[sidebar.js] Highlight response received:', event.data);
              
              if (!event.data.success) {
                console.warn('Failed to highlight issues on the page.');
                showResults(data.issues, []);
              } else {
                console.log('[sidebar.js] Highlight successful, appliedHighlightsMap:', event.data.appliedHighlightsMap);
                showResults(data.issues, event.data.appliedHighlightsMap);
              }
            }
          };
          window.addEventListener('message', highlightHandler);
          
          return data.issues;
        })
        .catch(error => {
          console.log('[DEBUG] Fetch error caught:', error.name, error.message);
          clearTimeout(timeoutId);
          
          if (error.name === 'AbortError') {
            showError('Analysis timed out. The server is taking longer than expected. This might be due to high server load or a complex article. Please try again in a few moments.');
          } else if (error.message.includes('Failed to fetch')) {
            showError('Cannot connect to the analysis server. Please check your internet connection and try again.');
          } else if (error.message.includes('NetworkError')) {
            showError('Network error occurred. Please check your internet connection and try again.');
          } else {
            showError(error.message);
          }
          throw error;
        });
      }

      // Define performAnalysis function in proper scope - now with streaming support
      async function performAnalysis(article) {
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
            showError('Please sign in to use this feature. Click the "Manage Account" button to sign in.');
            return;
          }
          
          // Try streaming analysis first, fallback to regular analysis
          const streamingSupported = typeof ReadableStream !== 'undefined' && typeof fetch !== 'undefined';
          console.log('[DEBUG] Streaming supported:', streamingSupported);
          
          if (streamingSupported) {
            try {
              await performStreamingAnalysis(article, currentUrl, authToken);
              return; // Success, exit function
            } catch (error) {
              console.log('[DEBUG] Streaming analysis failed, falling back to regular analysis:', error);
              // Continue to regular analysis fallback
            }
          }
          
          // Fallback to regular analysis
          try {
            await performRegularAnalysis(article, currentUrl, authToken);
          } catch (error) {
            console.log('[DEBUG] Regular analysis also failed:', error);
            // Error already handled in performRegularAnalysis
          }
        }
      } // End of continueWithAnalysis function
      
    } catch (error) {
      console.log('[DEBUG] Caught error in analyze handler:', error);
      showError(error.message);
    }
  });
  
  // Close button click handler
  closeBtn.addEventListener('click', () => {
    // Send message to content script to close sidebar via postMessage
    window.parent.postMessage({action: 'closeSidebar'}, '*');
  });
  
  // Manage account button click handler
  manageAccountBtn.addEventListener('click', () => {
    // Open account management page in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('account.html') });
  });
  
  // Listen for messages from content script (auto analysis trigger)
  window.addEventListener('message', (event) => {
    // Only accept messages from the same origin
    if (event.origin !== window.location.origin) {
      return;
    }
    
    if (event.data.action === 'triggerAnalysis' && event.data.isAutoAnalysis) {
      console.log('Received auto analysis trigger from content script');
      
      // Check if analysis is already in progress
      if (analyzeBtn.disabled) {
        console.log('Analysis already in progress, ignoring auto analysis trigger');
        return;
      }
      
      // Set a flag to indicate this is auto analysis
      window.isAutoAnalysisInProgress = true;
      
      // Trigger the analyze button click programmatically
      console.log('Starting auto analysis...');
      analyzeBtn.click();
    }
  });
}); 