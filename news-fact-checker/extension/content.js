// Content script for TruthPilot extension
console.log("TruthPilot content script loaded");

// Variables to track sidebar state
let sidebarFrame = null;
let isSidebarOpen = false;
let hideTooltipTimer = null; // Shared timer for tooltip hide delay

// Function to extract article content using Readability
function extractArticleContent() {
  try {
    // Create a clone of the document to avoid modifying the original
    const documentClone = document.cloneNode(true);
    
    // Parse the article using Readability
    const article = new Readability(documentClone).parse();
    
    if (!article) {
      console.error("Failed to parse article with Readability");
      return null;
    }
    
    return {
      title: article.title,
      content: article.textContent,
      url: window.location.href
    };
  } catch (error) {
    console.error("Error extracting article content:", error);
    return null;
  }
}

// Function to highlight problematic text in the article
function highlightIssues(issues) {
  if (!issues || !Array.isArray(issues) || issues.length === 0) {
    console.log("No issues to highlight");
    return [];
  }
  
  console.log(`Highlighting ${issues.length} issues`);
  
  // Add a style for the highlights
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .truthpilot-highlight {
      background-color: rgba(255, 165, 0, 0.3);
      cursor: pointer;
      position: relative;
    }
    
    .truthpilot-tooltip {
      visibility: hidden; /* Controlled by JS */
      opacity: 0; /* Controlled by JS */
      width: 300px; /* Default width */
      position: absolute;
      z-index: 1000;
      bottom: 125%; /* Position above the highlight */
      left: 50%;
      transform: translateX(-50%); /* Center tooltip */
      transition: opacity 0.3s, visibility 0.3s;
      /* Base styles will be refined by JS below */
      background-color: #ffffff; 
      color: #202124;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      padding: 15px;
      font-size: 14px; /* Default font size for tooltip */
      line-height: 1.5;
      text-align: left;
    }
    
    /* CSS hover effect will be overridden by JS, but good as a fallback or for non-JS scenarios */
    /*
    .truthpilot-highlight:hover .truthpilot-tooltip {
      visibility: visible;
      opacity: 1;
    }
    */
    
    .truthpilot-sources {
      /* Styles for sourcesDiv will be applied via JS */
      font-size: 12px; /* Base size for source links, can be overridden by JS if needed */
    }
    
    .truthpilot-sources a {
      /* Styles for source links will be applied via JS */
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
  `;
  document.head.appendChild(styleEl);
  
  let appliedHighlightsMap = [];
  let highlightCount = 0;
  // Process each issue
  issues.forEach((issue, originalIssueIndex) => {
    if (originalIssueIndex === 0) { console.log('[content.js] Processing first issue (index 0):', issue.text); }
    try {
      // Find all text nodes in the document
      const textNodes = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while ((node = walker.nextNode())) {
        // Skip script and style elements
        if (
          node.parentElement.tagName === 'SCRIPT' ||
          node.parentElement.tagName === 'STYLE' ||
          node.parentElement.classList.contains('truthpilot-highlight')
        ) {
          continue;
        }
        
        // Normalize for more robust matching
        const normalizedIssueText = issue.text.trim().replace(/\s+/g, ' ');
        const currentNodeText = node.textContent || ""; // Ensure not null
        const normalizedNodeText = currentNodeText.trim().replace(/\s+/g, ' ');

        if (normalizedIssueText && normalizedNodeText.includes(normalizedIssueText)) { // Check normalizedIssueText is not empty
          if (originalIssueIndex === 0) { console.log('[content.js] First issue text found in node:', node.textContent); }
          textNodes.push(node);
        }
      }
      
      // Highlight each occurrence
      textNodes.forEach((textNode) => {
        const parent = textNode.parentNode;
        // Use original node.textContent for splitting with original issue.text
        const originalNodeTextContent = textNode.textContent || ""; 
        const parts = originalNodeTextContent.split(issue.text);
        
        if (parts.length > 1) {
          // Create a document fragment to hold the new nodes
          const fragment = document.createDocumentFragment();
          
          // Add the first part (if any)
          if (parts[0]) {
            fragment.appendChild(document.createTextNode(parts[0]));
          }
          
          // Create the highlighted element
          for (let i = 1; i < parts.length; i++) {
            const newDomId = `truthpilot-highlight-${highlightCount}`;
            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'truthpilot-highlight';
            highlightSpan.id = newDomId; // Set the new unique DOM ID
            highlightSpan.textContent = issue.text;
            
            if (originalIssueIndex === 0) { console.log('[content.js] Creating map for first issue. ID:', newDomId, 'Mapping:', { originalIssueIndex: originalIssueIndex, highlightId: newDomId }); }
            appliedHighlightsMap.push({ originalIssueIndex: originalIssueIndex, highlightId: newDomId });
            highlightCount++;
            
            // Add the tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'truthpilot-tooltip';
            // Apply main tooltip styles via JS - these will override CSS if there are conflicts
            tooltip.style.backgroundColor = '#ffffff';
            tooltip.style.color = '#202124';
            tooltip.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.15)';
            tooltip.style.borderRadius = '8px';
            tooltip.style.padding = '15px';
            tooltip.style.lineHeight = '1.5';
            // Ensure margin-left is adjusted if transform: translateX(-50%) is used in CSS
            // If CSS has transform: translateX(-50%), then margin-left should be 0 or adjusted.
            // The CSS has `left: 50%; transform: translateX(-50%);` so margin-left is not needed.
            tooltip.style.marginLeft = '0'; 


            // Create tooltip content
            const explanation = document.createElement('p');
            explanation.textContent = issue.explanation;
            explanation.style.marginBottom = '10px';
            // Default P styling with new tooltip color should be fine
            tooltip.appendChild(explanation);
            
            const confidence = document.createElement('p');
            confidence.textContent = `Confidence: ${Math.round(issue.confidence_score * 100)}%`;
            confidence.style.color = '#1a73e8'; // Primary blue
            confidence.style.fontWeight = 'bold';
            confidence.style.fontSize = '13px';
            confidence.style.marginTop = '0';
            confidence.style.marginBottom = '12px';
            tooltip.appendChild(confidence);
            
            // Add sources if available
            if (issue.source_urls && issue.source_urls.length > 0) {
              const sourcesDiv = document.createElement('div');
              sourcesDiv.className = 'truthpilot-sources'; // Keep class for potential base styling
              sourcesDiv.style.marginTop = '12px';
              sourcesDiv.style.paddingTop = '12px';
              sourcesDiv.style.borderTop = '1px solid #e0e0e0'; // Lighter separator
              
              const sourcesLabel = document.createElement('p');
              sourcesLabel.textContent = 'Sources:';
              sourcesLabel.style.fontWeight = 'bold';
              sourcesLabel.style.color = '#333333';
              sourcesLabel.style.marginBottom = '6px';
              sourcesLabel.style.marginTop = '0'; // Reset top margin for the label
              sourcesDiv.appendChild(sourcesLabel);
              
              issue.source_urls.forEach(url => {
                const link = document.createElement('a');
                link.href = url;
                link.textContent = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                
                link.style.color = '#1a73e8'; // Primary blue
                link.style.textDecoration = 'none'; // Cleaner look
                link.style.display = 'block'; // Ensure block for text-overflow
                link.style.marginBottom = '4px'; // Keep from existing link style
                link.style.whiteSpace = 'nowrap'; // Keep
                link.style.overflow = 'hidden'; // Keep
                link.style.textOverflow = 'ellipsis'; // Keep
                link.style.maxWidth = '100%'; // Keep

                link.addEventListener('mouseenter', () => link.style.textDecoration = 'underline');
                link.addEventListener('mouseleave', () => link.style.textDecoration = 'none');
                
                // Make the link clickable by stopping event propagation from highlight span
                link.addEventListener('click', (e) => {
                  e.stopPropagation();
                });
                sourcesDiv.appendChild(link);
              });
              
              tooltip.appendChild(sourcesDiv);
            }
            
            highlightSpan.appendChild(tooltip);
            
            // Tooltip interaction logic
            highlightSpan.addEventListener('mouseenter', () => {
              clearTimeout(hideTooltipTimer);
              tooltip.style.visibility = 'visible';
              tooltip.style.opacity = '1';
            });

            highlightSpan.addEventListener('mouseleave', () => {
              hideTooltipTimer = setTimeout(() => {
                tooltip.style.visibility = 'hidden';
                tooltip.style.opacity = '0';
              }, 300);
            });

            tooltip.addEventListener('mouseenter', () => {
              clearTimeout(hideTooltipTimer);
            });

            tooltip.addEventListener('mouseleave', () => {
              // Hide immediately when mouse leaves the tooltip itself
              tooltip.style.visibility = 'hidden';
              tooltip.style.opacity = '0';
            });
            
            fragment.appendChild(highlightSpan);
            
            // Add the remaining part (if any and not the last part)
            if (parts[i]) {
              fragment.appendChild(document.createTextNode(parts[i]));
            }
          }
          
          // Replace the original text node with the fragment
          parent.replaceChild(fragment, textNode);
          // No need to push to appliedHighlightIds anymore, map handles it.
        }
      });
    } catch (error) {
      console.error("Error highlighting issue:", error, issue);
    }
  });
  return appliedHighlightsMap;
}

// Function to create and inject the sidebar iframe
function createSidebar() {
  if (sidebarFrame) {
    return; // Sidebar already exists
  }
  
  // Create the iframe element
  sidebarFrame = document.createElement('iframe');
  sidebarFrame.src = chrome.runtime.getURL('sidebar.html');
  sidebarFrame.id = 'truthpilot-sidebar';
  
  // Style the iframe
  Object.assign(sidebarFrame.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '350px',
    height: '100%',
    zIndex: '1000000',
    border: 'none',
    boxShadow: '-5px 0 15px rgba(0, 0, 0, 0.2)',
    transition: 'transform 0.3s ease'
  });
  
  // Initially hide the sidebar (off-screen)
  sidebarFrame.style.transform = 'translateX(100%)';
  
  // Add the iframe to the page
  document.body.appendChild(sidebarFrame);
  
  // Create a style for the body padding when sidebar is open
  const styleEl = document.createElement('style');
  styleEl.id = 'truthpilot-sidebar-style';
  styleEl.textContent = `
    body.truthpilot-sidebar-open {
      transition: padding-right 0.3s ease;
    }
  `;
  document.head.appendChild(styleEl);
  
  return sidebarFrame;
}

// Function to show the sidebar
function showSidebar() {
  if (!sidebarFrame) {
    createSidebar();
  }
  
  // Show the sidebar with animation
  setTimeout(() => {
    sidebarFrame.style.transform = 'translateX(0)';
    document.body.classList.add('truthpilot-sidebar-open');
    document.body.style.paddingRight = '350px';
    isSidebarOpen = true;
  }, 10);
}

// Function to hide the sidebar
function hideSidebar() {
  if (sidebarFrame) {
    sidebarFrame.style.transform = 'translateX(100%)';
    document.body.classList.remove('truthpilot-sidebar-open');
    document.body.style.paddingRight = '0';
    isSidebarOpen = false;
  }
}

// Function to toggle the sidebar visibility
function toggleSidebar() {
  if (isSidebarOpen) {
    hideSidebar();
  } else {
    showSidebar();
  }
}

// Listen for messages from the background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyze") {
    console.log("Received analyze request");
    
    // Extract article content
    const article = extractArticleContent();
    if (!article) {
      sendResponse({ success: false, error: "Failed to extract article content" });
      return true;
    }
    
    // Send article to background script for analysis
    sendResponse({ success: true, article });
    return true;
  } else if (message.action === "highlight") {
    console.log("Received highlight request");
    
    // Highlight issues in the article
    const appliedHighlightsMap = highlightIssues(message.issues);
    sendResponse({ success: true, appliedHighlightsMap: appliedHighlightsMap });
    return true;
  } else if (message.action === "showSidebar") {
    console.log("Received show sidebar request");
    showSidebar();
    sendResponse({ success: true });
    return true;
  } else if (message.action === "closeSidebar") {
    console.log("Received close sidebar request");
    hideSidebar();
    sendResponse({ success: true });
    return true;
  } else if (message.action === "scrollToHighlight") {
    console.log("Received scrollToHighlight request for ID:", message.highlightId);
    const highlightId = message.highlightId;
    
    if (!highlightId) {
      sendResponse({ success: false, error: "No highlightId provided" });
      return true;
    }
    
    const element = document.getElementById(highlightId);
    
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Briefly highlight the element to give visual feedback
      const originalBackgroundColor = element.style.backgroundColor;
      element.style.backgroundColor = 'rgba(255, 255, 0, 0.5)'; // Yellow highlight
      setTimeout(() => {
        element.style.backgroundColor = originalBackgroundColor;
      }, 1500); // Highlight for 1.5 seconds
      sendResponse({ success: true });
    } else {
      console.error("Highlight element not found for ID:", highlightId);
      sendResponse({ success: false, error: "Highlighted element not found on page" });
    }
    return true;
  }
});

// Listen for the extension icon click event from background script
// This listener should be merged with the one above to avoid issues.
// For now, let's assume the extension structure might have specific reasons for two listeners,
// but ideally, these would be one.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleSidebar") {
    toggleSidebar();
    sendResponse({ success: true });
    return true;
  }
});