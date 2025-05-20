// Content script for TruthPilot extension
console.log("TruthPilot content script loaded");

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

// Listen for messages from the background script
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
  }
}); 