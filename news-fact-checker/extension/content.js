// Content script for TruthPilot extension
console.log("TruthPilot content script loaded");

// Variables to track sidebar state
let sidebarFrame = null;
let isSidebarOpen = false;

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
    return;
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
      visibility: hidden;
      width: 300px;
      background-color: #555;
      color: #fff;
      text-align: left;
      border-radius: 6px;
      padding: 10px;
      position: absolute;
      z-index: 1000;
      bottom: 125%;
      left: 50%;
      margin-left: -150px;
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 14px;
      pointer-events: none;
    }
    
    .truthpilot-highlight:hover .truthpilot-tooltip {
      visibility: visible;
      opacity: 1;
    }
    
    .truthpilot-sources {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.3);
      font-size: 12px;
    }
    
    .truthpilot-sources a {
      color: #add8e6;
      display: block;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      text-decoration: underline;
    }
  `;
  document.head.appendChild(styleEl);
  
  // Process each issue
  issues.forEach((issue) => {
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
        
        if (node.textContent.includes(issue.text)) {
          textNodes.push(node);
        }
      }
      
      // Highlight each occurrence
      textNodes.forEach((textNode) => {
        const parent = textNode.parentNode;
        const text = textNode.textContent;
        const parts = text.split(issue.text);
        
        if (parts.length > 1) {
          // Create a document fragment to hold the new nodes
          const fragment = document.createDocumentFragment();
          
          // Add the first part (if any)
          if (parts[0]) {
            fragment.appendChild(document.createTextNode(parts[0]));
          }
          
          // Create the highlighted element
          for (let i = 1; i < parts.length; i++) {
            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'truthpilot-highlight';
            highlightSpan.textContent = issue.text;
            
            // Add the tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'truthpilot-tooltip';
            
            // Create tooltip content
            const explanation = document.createElement('p');
            explanation.textContent = issue.explanation;
            tooltip.appendChild(explanation);
            
            const confidence = document.createElement('p');
            confidence.textContent = `Confidence: ${Math.round(issue.confidence_score * 100)}%`;
            confidence.style.fontStyle = 'italic';
            tooltip.appendChild(confidence);
            
            // Add sources if available
            if (issue.source_urls && issue.source_urls.length > 0) {
              const sourcesDiv = document.createElement('div');
              sourcesDiv.className = 'truthpilot-sources';
              
              const sourcesLabel = document.createElement('p');
              sourcesLabel.textContent = 'Sources:';
              sourcesLabel.style.fontWeight = 'bold';
              sourcesDiv.appendChild(sourcesLabel);
              
              issue.source_urls.forEach(url => {
                const link = document.createElement('a');
                link.href = url;
                link.textContent = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                // Make the link clickable by stopping event propagation
                link.addEventListener('click', (e) => {
                  e.stopPropagation();
                });
                sourcesDiv.appendChild(link);
              });
              
              tooltip.appendChild(sourcesDiv);
            }
            
            highlightSpan.appendChild(tooltip);
            fragment.appendChild(highlightSpan);
            
            // Add the remaining part (if any and not the last part)
            if (parts[i]) {
              fragment.appendChild(document.createTextNode(parts[i]));
            }
          }
          
          // Replace the original text node with the fragment
          parent.replaceChild(fragment, textNode);
        }
      });
    } catch (error) {
      console.error("Error highlighting issue:", error, issue);
    }
  });
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
    highlightIssues(message.issues);
    sendResponse({ success: true });
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
  }
});

// Listen for the extension icon click event from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleSidebar") {
    toggleSidebar();
    sendResponse({ success: true });
    return true;
  }
}); 