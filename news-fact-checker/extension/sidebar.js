// Sidebar script for TruthPilot extension
document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const closeBtn = document.getElementById('closeBtn');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const resultCount = document.getElementById('resultCount');
  const issueList = document.getElementById('issueList');
  
  // Check for user consent
  chrome.storage.local.get(['userConsent'], function(result) {
    if (!result.userConsent) {
      showConsentDialog();
    }
  });

  // Load any cached results
  loadCachedResults();
  
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
        text: issue.text.substring(0, 50) + '...',
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
    status.textContent = `Error: ${message}`;
    status.style.display = 'block';
    analyzeBtn.disabled = false;
  }
  
  // Load cached results for the current URL
  function loadCachedResults() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = tabs[0].url;
      
      chrome.storage.local.get(['cachedResults'], function(result) {
        const cachedResultsObj = result.cachedResults || {};
        
        if (cachedResultsObj[currentUrl]) {
          const cachedIssues = cachedResultsObj[currentUrl];
          
          // Re-highlight the issues to get the mapping for clickability
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'highlight',
            issues: cachedIssues
          }, highlightResponse => {
            if (chrome.runtime.lastError || !highlightResponse || !highlightResponse.success) {
              console.warn('Failed to highlight cached issues on the page. Results may not be clickable.');
              // Show results anyway, but without click functionality
              showResults(cachedIssues, []);
            } else {
              // Show results with proper highlight mapping
              showResults(cachedIssues, highlightResponse.appliedHighlightsMap);
            }
          });
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
        
        // Call the API with enhanced security
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        fetch('https://news-notes.onrender.com/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'omit',
          body: JSON.stringify(article),
          signal: controller.signal
        })
        .finally(() => {
          clearTimeout(timeoutId);
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          // Cache the results for this URL
          cacheResults(tab.url, data.issues);
          
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
          showError(error.message);
        });
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
}); 