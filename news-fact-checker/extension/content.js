// Content script for TruthPilot extension
// Prevent multiple injections
if (window.truthPilotContentLoaded) {
  console.log("TruthPilot content script already loaded, skipping");
} else {
  window.truthPilotContentLoaded = true;
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

// Function to clear existing highlights
function clearExistingHighlights() {
  console.log('[content.js] Clearing existing highlights');
  
  // Remove existing tooltips from body
  const existingTooltips = document.querySelectorAll('.truthpilot-tooltip');
  console.log('[content.js] Found', existingTooltips.length, 'existing tooltips to remove');
  existingTooltips.forEach(tooltip => {
    if (tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
  });
  
  // Remove existing highlight elements
  const existingHighlights = document.querySelectorAll('.truthpilot-highlight');
  console.log('[content.js] Found', existingHighlights.length, 'existing highlights to remove');
  existingHighlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      // Replace the highlight span with just its text content
      const textNode = document.createTextNode(highlight.textContent);
      parent.replaceChild(textNode, highlight);
      
      // Merge adjacent text nodes
      parent.normalize();
    }
  });
  
  // Remove existing styles
  const existingStyle = document.querySelector('style[data-truthpilot-highlights]');
  if (existingStyle) {
    existingStyle.remove();
    console.log('[content.js] Removed existing highlight styles');
  }
  
  console.log('[content.js] Finished clearing existing highlights');
}

// Function to highlight problematic text in the article
function highlightIssues(issues) {
  if (!issues || !Array.isArray(issues) || issues.length === 0) {
    console.log("[content.js] No issues to highlight");
    return [];
  }
  
  console.log(`[content.js] Starting to highlight ${issues.length} issues`);
  
  // Clear existing highlights first
  clearExistingHighlights();
  
  // Add a small delay to ensure DOM is fully processed after clearing
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        const appliedHighlightsMap = performHighlighting(issues);
        console.log(`[content.js] Finished highlighting. Applied highlights map:`, appliedHighlightsMap);
        resolve(appliedHighlightsMap);
      } catch (error) {
        console.error("[content.js] Error in performHighlighting:", error);
        resolve([]);
      }
    }, 100); // 100ms delay
  });
}

// Extracted highlighting logic into a separate function
function performHighlighting(issues) {
  // Add a style for the highlights
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-truthpilot-highlights', 'true');
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
      z-index: 2147483647; /* Maximum z-index to ensure tooltip appears above everything */
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
      pointer-events: auto; /* Ensure tooltip can receive clicks */
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
  
  // Get the entire body text for better cross-element matching
  const bodyText = document.body.innerText || document.body.textContent || '';
  
  // Process each issue
  issues.forEach((issue, originalIssueIndex) => {
    if (originalIssueIndex === 0) { 
      console.log('[content.js] Processing first issue (index 0):', issue.text); 
    }
    
    try {
      // Normalize issue text for better matching
      const normalizedIssueText = normalizeText(issue.text);
      const normalizedBodyText = normalizeText(bodyText);
      
      // Try different matching strategies
      let matchingStrategy = null;
      let matchIndex = -1;
      
      // Strategy 1: Exact match in body text
      if (bodyText.includes(issue.text)) {
        matchingStrategy = 'exact';
        matchIndex = bodyText.indexOf(issue.text);
      }
      // Strategy 2: Normalized match
      else if (normalizedBodyText.includes(normalizedIssueText)) {
        matchingStrategy = 'normalized';
        matchIndex = normalizedBodyText.indexOf(normalizedIssueText);
      }
      // Strategy 3: Case-insensitive match
      else if (bodyText.toLowerCase().includes(issue.text.toLowerCase())) {
        matchingStrategy = 'case_insensitive';
        matchIndex = bodyText.toLowerCase().indexOf(issue.text.toLowerCase());
      }
      // Strategy 4: Fuzzy match (look for key words)
      else {
        const keyWords = extractKeyWords(issue.text);
        if (keyWords.length > 0) {
          for (const word of keyWords) {
            const wordIndex = bodyText.toLowerCase().indexOf(word.toLowerCase());
            if (wordIndex !== -1) {
              matchingStrategy = 'fuzzy';
              matchIndex = wordIndex;
              break;
            }
          }
        }
      }
      
      if (matchIndex === -1) {
        console.log(`[content.js] No match found for issue ${originalIssueIndex}: "${issue.text.substring(0, 50)}..."`);
        // Still create a mapping but mark it as not found
        appliedHighlightsMap.push({ originalIssueIndex: originalIssueIndex, highlightId: null, matchFound: false });
        return; // Skip to next issue
      }
      
      console.log(`[content.js] Match found for issue ${originalIssueIndex} using ${matchingStrategy} strategy`);
      
      // Now find and highlight the actual text nodes
      const highlighted = highlightTextInNodes(issue, originalIssueIndex, matchingStrategy, highlightCount);
      if (highlighted.success) {
        appliedHighlightsMap = appliedHighlightsMap.concat(highlighted.mappings);
        highlightCount += highlighted.count;
      } else {
        // Fallback: create a virtual highlight for clicking purposes
        const virtualHighlightId = `truthpilot-virtual-${highlightCount}`;
        appliedHighlightsMap.push({ 
          originalIssueIndex: originalIssueIndex, 
          highlightId: virtualHighlightId, 
          matchFound: true,
          isVirtual: true 
        });
        highlightCount++;
        console.log(`[content.js] Created virtual highlight for issue ${originalIssueIndex}: ${virtualHighlightId}`);
      }
      
    } catch (error) {
      console.error("Error highlighting issue:", error, issue);
      // Add to map as not found to prevent undefined behavior
      appliedHighlightsMap.push({ originalIssueIndex: originalIssueIndex, highlightId: null, matchFound: false });
    }
  });
  
  console.log(`[content.js] Highlighting complete. Total mappings: ${appliedHighlightsMap.length}`);
  return appliedHighlightsMap;
}

// Helper function to normalize text for better matching
function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
}

// Helper function to extract key words from issue text
function extractKeyWords(text) {
  // Remove common words and extract meaningful terms
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
  
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word))
    .slice(0, 3); // Take up to 3 key words
}

// Helper function to highlight text in actual DOM nodes
function highlightTextInNodes(issue, originalIssueIndex, matchingStrategy, startingHighlightCount) {
  let highlightCount = 0;
  let mappings = [];
  let foundAny = false;
  
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
    // Skip script and style elements and existing highlights
    if (
      node.parentElement.tagName === 'SCRIPT' ||
      node.parentElement.tagName === 'STYLE' ||
      node.parentElement.classList.contains('truthpilot-highlight')
    ) {
      continue;
    }
    textNodes.push(node);
  }
  
  // Try to find and highlight the text
  for (const textNode of textNodes) {
    const nodeText = textNode.textContent || "";
    let shouldHighlight = false;
    let textToHighlight = issue.text;
    let parts = [];
    
    // Apply matching strategy
    switch (matchingStrategy) {
      case 'exact':
        if (nodeText.includes(issue.text)) {
          parts = nodeText.split(issue.text);
          shouldHighlight = parts.length > 1;
        }
        break;
        
      case 'normalized':
        const normalizedNodeText = normalizeText(nodeText);
        const normalizedIssueText = normalizeText(issue.text);
        if (normalizedNodeText.includes(normalizedIssueText)) {
          // Find the actual position in original text
          const match = findOriginalTextMatch(nodeText, issue.text);
          if (match) {
            parts = [nodeText.substring(0, match.start), nodeText.substring(match.end)];
            textToHighlight = nodeText.substring(match.start, match.end);
            shouldHighlight = true;
          }
        }
        break;
        
      case 'case_insensitive':
        const lowerNodeText = nodeText.toLowerCase();
        const lowerIssueText = issue.text.toLowerCase();
        const startIndex = lowerNodeText.indexOf(lowerIssueText);
        if (startIndex !== -1) {
          const endIndex = startIndex + issue.text.length;
          parts = [nodeText.substring(0, startIndex), nodeText.substring(endIndex)];
          textToHighlight = nodeText.substring(startIndex, endIndex);
          shouldHighlight = true;
        }
        break;
        
      case 'fuzzy':
        // For fuzzy matching, highlight if any key words are found
        const keyWords = extractKeyWords(issue.text);
        for (const word of keyWords) {
          if (nodeText.toLowerCase().includes(word.toLowerCase())) {
            const wordIndex = nodeText.toLowerCase().indexOf(word.toLowerCase());
            const wordEnd = wordIndex + word.length;
            parts = [nodeText.substring(0, wordIndex), nodeText.substring(wordEnd)];
            textToHighlight = nodeText.substring(wordIndex, wordEnd);
            shouldHighlight = true;
            break;
          }
        }
        break;
    }
    
    if (shouldHighlight && parts.length > 1) {
      foundAny = true;
      const parent = textNode.parentNode;
      const fragment = document.createDocumentFragment();
      
      // Add the first part (if any)
      if (parts[0]) {
        fragment.appendChild(document.createTextNode(parts[0]));
      }
      
      // Create the highlighted element
      for (let i = 1; i < parts.length; i++) {
        const newDomId = `truthpilot-highlight-${startingHighlightCount + highlightCount}`;
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'truthpilot-highlight';
        highlightSpan.id = newDomId;
        highlightSpan.textContent = textToHighlight;
        
        mappings.push({ originalIssueIndex: originalIssueIndex, highlightId: newDomId, matchFound: true });
        highlightCount++;
        
        // Add tooltip (existing tooltip creation code)
        createTooltipForHighlight(highlightSpan, issue);
        
        fragment.appendChild(highlightSpan);
        
        // Add the remaining part (if any)
        if (parts[i]) {
          fragment.appendChild(document.createTextNode(parts[i]));
        }
      }
      
      // Replace the original text node with the fragment
      parent.replaceChild(fragment, textNode);
      
      // For efficiency, break after first successful highlight per issue
      // Remove this break if you want to highlight all occurrences
      break;
    }
  }
  
  return { success: foundAny, mappings: mappings, count: highlightCount };
}

// Helper function to find original text match position
function findOriginalTextMatch(originalText, searchText) {
  const normalizedOriginal = normalizeText(originalText).toLowerCase();
  const normalizedSearch = normalizeText(searchText).toLowerCase();
  const normalizedIndex = normalizedOriginal.indexOf(normalizedSearch);
  
  if (normalizedIndex === -1) return null;
  
  // Map back to original text position
  let originalIndex = 0;
  let normalizedPos = 0;
  
  while (originalIndex < originalText.length && normalizedPos < normalizedIndex) {
    const char = originalText[originalIndex];
    if (char.match(/\w/)) {
      normalizedPos++;
    }
    originalIndex++;
  }
  
  // Find end position
  let endIndex = originalIndex;
  let remainingLength = normalizedSearch.replace(/\s+/g, '').length;
  
  while (endIndex < originalText.length && remainingLength > 0) {
    const char = originalText[endIndex];
    if (char.match(/\w/)) {
      remainingLength--;
    }
    endIndex++;
  }
  
  return { start: originalIndex, end: endIndex };
}

// Helper function to create tooltip for highlight
function createTooltipForHighlight(highlightSpan, issue) {
  // Create the tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'truthpilot-tooltip';
  // Apply main tooltip styles via JS - these will override CSS if there are conflicts
  tooltip.style.backgroundColor = '#ffffff';
  tooltip.style.color = '#202124';
  tooltip.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.15)';
  tooltip.style.borderRadius = '8px';
  tooltip.style.padding = '15px';
  tooltip.style.lineHeight = '1.5'; 

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
      link.style.cursor = 'pointer'; // Ensure cursor shows it's clickable
      link.style.pointerEvents = 'auto'; // Ensure link can receive clicks

      link.addEventListener('mouseenter', () => link.style.textDecoration = 'underline');
      link.addEventListener('mouseleave', () => link.style.textDecoration = 'none');
      
      // Make the link clickable by stopping event propagation from highlight span
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // Open link manually to ensure it works
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      
      // Also handle mousedown to catch any missed clicks
      link.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      
      sourcesDiv.appendChild(link);
    });
    
    tooltip.appendChild(sourcesDiv);
  }
  
  // Position tooltip relative to the highlight span
  function positionTooltip() {
    const rect = highlightSpan.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    tooltip.style.position = 'absolute';
    tooltip.style.left = `${rect.left + scrollLeft + rect.width / 2}px`;
    tooltip.style.top = `${rect.top + scrollTop - 10}px`; // Position above the highlight
    tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
  }
  
  // Add scroll event listener to reposition tooltip
  let scrollHandler = null;
  
  // Tooltip interaction logic
  highlightSpan.addEventListener('mouseenter', () => {
    clearTimeout(hideTooltipTimer);
    positionTooltip();
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = '1';
    
    // Add scroll listener to reposition tooltip while visible
    scrollHandler = () => positionTooltip();
    window.addEventListener('scroll', scrollHandler, { passive: true });
  });

  highlightSpan.addEventListener('mouseleave', () => {
    hideTooltipTimer = setTimeout(() => {
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
      // Remove scroll listener when tooltip is hidden
      if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
        scrollHandler = null;
      }
    }, 300);
  });

  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(hideTooltipTimer);
  });

     tooltip.addEventListener('mouseleave', () => {
     // Hide immediately when mouse leaves the tooltip itself
     tooltip.style.visibility = 'hidden';
     tooltip.style.opacity = '0';
     // Remove scroll listener when tooltip is hidden
     if (scrollHandler) {
       window.removeEventListener('scroll', scrollHandler);
       scrollHandler = null;
     }
   });
   
   // Instead of appending tooltip to the highlight span, append it to document body
   // to prevent it from being part of the article content
   document.body.appendChild(tooltip);
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
    console.log("[content.js] Received highlight request with issues:", message.issues);
    
    // Ensure DOM is ready before highlighting
    if (document.readyState === 'loading') {
      console.log("[content.js] DOM not ready, waiting for DOMContentLoaded...");
      document.addEventListener('DOMContentLoaded', async () => {
        try {
          const appliedHighlightsMap = await highlightIssues(message.issues);
          console.log("[content.js] Highlighting completed after DOM ready. Returning appliedHighlightsMap:", appliedHighlightsMap);
          sendResponse({ success: true, appliedHighlightsMap: appliedHighlightsMap });
        } catch (error) {
          console.error("[content.js] Error during highlighting after DOM ready:", error);
          sendResponse({ success: false, error: error.message, appliedHighlightsMap: [] });
        }
      });
    } else {
      // Use async/await to handle the Promise returned by highlightIssues
      highlightIssues(message.issues).then(appliedHighlightsMap => {
        console.log("[content.js] Highlighting completed. Returning appliedHighlightsMap:", appliedHighlightsMap);
        sendResponse({ success: true, appliedHighlightsMap: appliedHighlightsMap });
      }).catch(error => {
        console.error("[content.js] Error during highlighting:", error);
        sendResponse({ success: false, error: error.message, appliedHighlightsMap: [] });
      });
    }
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
  } else if (message.action === "toggleSidebar") {
    console.log("Received toggle sidebar request");
    toggleSidebar();
    sendResponse({ success: true });
    return true;
  } else if (message.action === "scrollToHighlight") {
    console.log("Received scrollToHighlight request for ID:", message.highlightId);
    const highlightId = message.highlightId;
    
    if (!highlightId) {
      sendResponse({ success: false, error: "No highlightId provided" });
      return true;
    }
    
    // Check if this is a virtual highlight (starts with truthpilot-virtual-)
    if (highlightId.startsWith('truthpilot-virtual-')) {
      console.log("Virtual highlight clicked - scrolling to top of page");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Provide visual feedback for virtual highlight
      document.body.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
      setTimeout(() => {
        document.body.style.backgroundColor = '';
      }, 1000);
      sendResponse({ success: true, message: "Scrolled to top (text not found on page)" });
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

} // End of truthPilotContentLoaded check