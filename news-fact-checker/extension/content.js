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
  
  // Process each issue with improved matching
  issues.forEach((issue, originalIssueIndex) => {
    console.log(`[content.js] Processing issue ${originalIssueIndex}/${issues.length}: "${issue.text.substring(0, 100)}${issue.text.length > 100 ? '...' : ''}"`);
    
    try {
      // Use comprehensive matching approach
      const highlighted = findAndHighlightIssueText(issue, originalIssueIndex, highlightCount);
      
      if (highlighted.success) {
        appliedHighlightsMap = appliedHighlightsMap.concat(highlighted.mappings);
        highlightCount += highlighted.count;
        console.log(`[content.js] Successfully highlighted issue ${originalIssueIndex} with ${highlighted.count} highlights`);
      } else {
        console.warn(`[content.js] Could not find match for issue ${originalIssueIndex}: "${issue.text.substring(0, 100)}..."`);
        appliedHighlightsMap.push({ 
          originalIssueIndex: originalIssueIndex, 
          highlightId: null, 
          matchFound: false 
        });
      }
    } catch (error) {
      console.error("Error highlighting issue:", error, issue);
      appliedHighlightsMap.push({ originalIssueIndex: originalIssueIndex, highlightId: null, matchFound: false });
    }
  });
  
  console.log(`[content.js] Highlighting complete. Total mappings: ${appliedHighlightsMap.length}`);
  return appliedHighlightsMap;
}

// New comprehensive function to find and highlight issue text
function findAndHighlightIssueText(issue, originalIssueIndex, startingHighlightCount) {
  let highlightCount = 0;
  let mappings = [];
  let foundAny = false;
  
  // Get all text nodes in the document
  const textNodes = getAllTextNodes();
  
  // Try multiple matching strategies in order of precision
  const strategies = [
    'exact', 'case_insensitive', 'trimmed', 'normalized', 
    'partial_exact', 'partial_case_insensitive', 'word_sequence', 
    'fuzzy_semantic', 'single_sentence', 'key_phrases'
  ];
  
  for (const strategy of strategies) {
    const result = tryMatchingStrategy(issue, textNodes, strategy, originalIssueIndex, startingHighlightCount + highlightCount);
    
    if (result.success && result.mappings.length > 0) {
      mappings = mappings.concat(result.mappings);
      highlightCount += result.count;
      foundAny = true;
      console.log(`[content.js] Strategy '${strategy}' succeeded for issue ${originalIssueIndex} with ${result.count} highlights`);
      break; // Use first successful strategy
    }
  }
  
  return { success: foundAny, mappings: mappings, count: highlightCount };
}

// Helper to get all text nodes efficiently
function getAllTextNodes() {
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip script, style elements and existing highlights
        const parent = node.parentElement;
        if (!parent || 
            parent.tagName === 'SCRIPT' ||
            parent.tagName === 'STYLE' ||
            parent.classList.contains('truthpilot-highlight') ||
            parent.classList.contains('truthpilot-tooltip')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Only include nodes with meaningful text
        const text = node.textContent.trim();
        if (text.length < 3) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );
  
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }
  
  return textNodes;
}

// Comprehensive matching strategy implementation
function tryMatchingStrategy(issue, textNodes, strategy, originalIssueIndex, startingHighlightCount) {
  let highlightCount = 0;
  let mappings = [];
  let foundAny = false;
  
  const issueText = issue.text;
  
  for (const textNode of textNodes) {
    const nodeText = textNode.textContent;
    let matches = [];
    
    switch (strategy) {
      case 'exact':
        if (nodeText.includes(issueText)) {
          matches = [{ start: nodeText.indexOf(issueText), end: nodeText.indexOf(issueText) + issueText.length }];
        }
        break;
        
      case 'case_insensitive':
        const lowerNode = nodeText.toLowerCase();
        const lowerIssue = issueText.toLowerCase();
        if (lowerNode.includes(lowerIssue)) {
          const start = lowerNode.indexOf(lowerIssue);
          matches = [{ start: start, end: start + issueText.length }];
        }
        break;
        
      case 'trimmed':
        const trimmedIssue = issueText.trim();
        const trimmedNode = nodeText.trim();
        if (trimmedNode.toLowerCase().includes(trimmedIssue.toLowerCase())) {
          const start = trimmedNode.toLowerCase().indexOf(trimmedIssue.toLowerCase());
          matches = [{ start: start, end: start + trimmedIssue.length }];
        }
        break;
        
      case 'normalized':
        const normalizedNode = normalizeTextAdvanced(nodeText);
        const normalizedIssue = normalizeTextAdvanced(issueText);
        if (normalizedNode.includes(normalizedIssue)) {
          // Find original position by mapping back
          matches = findOriginalPosition(nodeText, issueText, normalizedNode, normalizedIssue);
        }
        break;
        
      case 'partial_exact':
        // Try to match substantial portions (at least 70% of the issue text)
        matches = findPartialMatches(nodeText, issueText, 0.7, false);
        break;
        
      case 'partial_case_insensitive':
        matches = findPartialMatches(nodeText, issueText, 0.6, true);
        break;
        
      case 'word_sequence':
        matches = findWordSequenceMatch(nodeText, issueText);
        break;
        
      case 'fuzzy_semantic':
        matches = findSemanticMatch(nodeText, issueText);
        break;
        
      case 'single_sentence':
        matches = findSentenceMatch(nodeText, issueText);
        break;
        
      case 'key_phrases':
        matches = findKeyPhraseMatch(nodeText, issueText);
        break;
    }
    
    // Create highlights for all matches found in this node
    for (const match of matches) {
      if (match.start >= 0 && match.end > match.start && match.end <= nodeText.length) {
        const highlighted = createHighlightInNode(textNode, match, issue, originalIssueIndex, startingHighlightCount + highlightCount);
        if (highlighted.success) {
          mappings.push(highlighted.mapping);
          highlightCount++;
          foundAny = true;
        }
      }
    }
    
    // Stop after first successful node for most strategies to avoid over-highlighting
    if (foundAny && ['exact', 'case_insensitive', 'trimmed', 'normalized'].includes(strategy)) {
      break;
    }
  }
  
  return { success: foundAny, mappings: mappings, count: highlightCount };
}

// Helper function to normalize text for better matching
function normalizeText(text) {
  return text.trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[''""]/g, '"') // Normalize quotes
    .replace(/[–—]/g, '-') // Normalize dashes
    .toLowerCase(); // Make case-insensitive but preserve punctuation for better matching
}

// Advanced text normalization
function normalizeTextAdvanced(text) {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[''""]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\w\s.,;:!?-]/g, '')
    .toLowerCase();
}

// Helper function to find original position after normalization
function findOriginalPosition(originalText, issueText, normalizedText, normalizedIssue) {
  const matches = [];
  const normalizedIndex = normalizedText.indexOf(normalizedIssue);
  
  if (normalizedIndex !== -1) {
    // Map back to original text by counting characters
    let originalIndex = 0;
    let normalizedCount = 0;
    
    for (let i = 0; i < originalText.length && normalizedCount < normalizedIndex; i++) {
      const char = originalText[i];
      const normalizedChar = normalizeTextAdvanced(char);
      if (normalizedChar.length > 0) {
        normalizedCount += normalizedChar.length;
      }
      originalIndex = i + 1;
    }
    
    // Find the end position
    let endIndex = originalIndex;
    let issueCharCount = 0;
    
    for (let i = originalIndex; i < originalText.length && issueCharCount < normalizedIssue.length; i++) {
      const char = originalText[i];
      const normalizedChar = normalizeTextAdvanced(char);
      if (normalizedChar.length > 0) {
        issueCharCount += normalizedChar.length;
      }
      endIndex = i + 1;
    }
    
    matches.push({ start: originalIndex, end: endIndex });
  }
  
  return matches;
}

// Helper function to find partial matches
function findPartialMatches(nodeText, issueText, threshold, caseInsensitive) {
  const matches = [];
  const nodeTextSearch = caseInsensitive ? nodeText.toLowerCase() : nodeText;
  const issueTextSearch = caseInsensitive ? issueText.toLowerCase() : issueText;
  
  const minLength = Math.floor(issueText.length * threshold);
  const words = issueTextSearch.split(/\s+/);
  
  // Try to find consecutive word sequences
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= words.length; j++) {
      const phrase = words.slice(i, j).join(' ');
      if (phrase.length >= minLength && nodeTextSearch.includes(phrase)) {
        const start = nodeTextSearch.indexOf(phrase);
        matches.push({ start: start, end: start + phrase.length });
        break; // Take first substantial match
      }
    }
    if (matches.length > 0) break;
  }
  
  return matches;
}

// Helper function to find word sequence matches
function findWordSequenceMatch(nodeText, issueText) {
  const matches = [];
  const nodeWords = nodeText.toLowerCase().split(/\s+/);
  const issueWords = issueText.toLowerCase().split(/\s+/);
  
  if (issueWords.length < 2) return matches;
  
  // Look for sequences of at least 3 consecutive words
  for (let i = 0; i <= nodeWords.length - 3; i++) {
    let matchCount = 0;
    let startWordIndex = -1;
    let endWordIndex = -1;
    
    for (let j = 0; j < issueWords.length && (i + j) < nodeWords.length; j++) {
      if (nodeWords[i + j] === issueWords[j] || 
          nodeWords[i + j].includes(issueWords[j]) || 
          issueWords[j].includes(nodeWords[i + j])) {
        if (startWordIndex === -1) startWordIndex = i + j;
        endWordIndex = i + j;
        matchCount++;
      } else {
        break;
      }
    }
    
    // If we found a good sequence (at least 3 words or 60% of issue words)
    if (matchCount >= 3 || matchCount >= issueWords.length * 0.6) {
      // Convert word indices back to character positions
      const beforeWords = nodeWords.slice(0, startWordIndex).join(' ');
      const matchWords = nodeWords.slice(startWordIndex, endWordIndex + 1).join(' ');
      const start = beforeWords.length + (beforeWords.length > 0 ? 1 : 0);
      const end = start + matchWords.length;
      
      matches.push({ start: start, end: end });
      break; // Take first good match
    }
  }
  
  return matches;
}

// Helper function to find semantic matches
function findSemanticMatch(nodeText, issueText) {
  const matches = [];
  
  // Extract meaningful phrases (3+ words) from issue text
  const issueWords = issueText.toLowerCase().split(/\s+/);
  const phrases = [];
  
  // Create phrases of 3-5 words
  for (let len = 3; len <= Math.min(5, issueWords.length); len++) {
    for (let i = 0; i <= issueWords.length - len; i++) {
      phrases.push(issueWords.slice(i, i + len).join(' '));
    }
  }
  
  // Look for these phrases in the node text
  const nodeTextLower = nodeText.toLowerCase();
  for (const phrase of phrases) {
    if (nodeTextLower.includes(phrase)) {
      const start = nodeTextLower.indexOf(phrase);
      matches.push({ start: start, end: start + phrase.length });
      break; // Take first match
    }
  }
  
  return matches;
}

// Helper function to find sentence matches
function findSentenceMatch(nodeText, issueText) {
  const matches = [];
  
  // Split both texts into sentences
  const nodeSentences = nodeText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  const issueSentences = issueText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  
  for (const issueSentence of issueSentences) {
    for (const nodeSentence of nodeSentences) {
      const similarity = calculateSimilarity(nodeSentence.toLowerCase(), issueSentence.toLowerCase());
      if (similarity > 0.7) { // 70% similarity
        const start = nodeText.toLowerCase().indexOf(nodeSentence.toLowerCase());
        if (start !== -1) {
          matches.push({ start: start, end: start + nodeSentence.length });
        }
      }
    }
    if (matches.length > 0) break;
  }
  
  return matches;
}

// Helper function to find key phrase matches
function findKeyPhraseMatch(nodeText, issueText) {
  const matches = [];
  
  // Extract key phrases (noun phrases, important terms)
  const keyPhrases = extractKeyPhrases(issueText);
  const nodeTextLower = nodeText.toLowerCase();
  
  for (const phrase of keyPhrases) {
    if (phrase.length >= 6 && nodeTextLower.includes(phrase.toLowerCase())) {
      const start = nodeTextLower.indexOf(phrase.toLowerCase());
      matches.push({ start: start, end: start + phrase.length });
      break; // Take first substantial match
    }
  }
  
  return matches;
}

// Helper function to extract key phrases
function extractKeyPhrases(text) {
  const phrases = [];
  const words = text.split(/\s+/);
  
  // Look for capitalized sequences (proper nouns, names)
  const capitalizedPhrases = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  phrases.push(...capitalizedPhrases);
  
  // Look for quoted phrases
  const quotedPhrases = text.match(/"[^"]+"/g) || [];
  phrases.push(...quotedPhrases.map(p => p.slice(1, -1)));
  
  // Look for numerical phrases
  const numericalPhrases = text.match(/\d+(?:[.,]\d+)*(?:\s+\w+){0,3}/g) || [];
  phrases.push(...numericalPhrases);
  
  // Create 2-4 word phrases from the text
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (phrase.length >= 6) {
        phrases.push(phrase);
      }
    }
  }
  
  return [...new Set(phrases)]; // Remove duplicates
}

// Helper function to calculate text similarity
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Helper function to create highlight in a specific text node
function createHighlightInNode(textNode, match, issue, originalIssueIndex, highlightId) {
  try {
    const nodeText = textNode.textContent;
    const parent = textNode.parentNode;
    
    if (!parent || match.start < 0 || match.end > nodeText.length || match.start >= match.end) {
      return { success: false, mapping: null };
    }
    
    const fragment = document.createDocumentFragment();
    
    // Add text before the highlight
    if (match.start > 0) {
      fragment.appendChild(document.createTextNode(nodeText.substring(0, match.start)));
    }
    
    // Create the highlighted element
    const newDomId = `truthpilot-highlight-${highlightId}`;
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'truthpilot-highlight';
    highlightSpan.id = newDomId;
    highlightSpan.textContent = nodeText.substring(match.start, match.end);
    
    // Add tooltip
    createTooltipForHighlight(highlightSpan, issue);
    fragment.appendChild(highlightSpan);
    
    // Add text after the highlight
    if (match.end < nodeText.length) {
      fragment.appendChild(document.createTextNode(nodeText.substring(match.end)));
    }
    
    // Replace the original text node
    parent.replaceChild(fragment, textNode);
    
    return { 
      success: true, 
      mapping: { originalIssueIndex: originalIssueIndex, highlightId: newDomId, matchFound: true }
    };
  } catch (error) {
    console.error('Error creating highlight in node:', error);
    return { success: false, mapping: null };
  }
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
    boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.05)',
    transition: 'transform 0.3s ease',
    background: '#ffffff'
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
  } else if (message.action === "startAutoAnalysis") {
    console.log("Received auto analysis request");
    
    // Check if auto analysis is enabled
    chrome.storage.sync.get(['autoAnalysisEnabled'], (result) => {
      const isEnabled = result.autoAnalysisEnabled !== false; // Default to true
      
      if (!isEnabled && !message.isTest) {
        console.log("Auto analysis is disabled");
        sendResponse({ success: false, error: "Auto analysis is disabled" });
        return;
      }
      
      console.log("Starting auto analysis...");
      
      // Check if we're on a supported site
      const supportedSites = ['bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'reuters.com', 'walla.co.il', 'ynet.co.il', 'n12.co.il', 'c14.co.il', 'mako.co.il'];
      const isSupported = supportedSites.some(site => window.location.href.includes(site));
      
      if (!isSupported) {
        console.log("Site not supported for auto analysis");
        sendResponse({ success: false, error: "Site not supported" });
        return;
      }
      
      // Check if we're on a home page - disable analysis for home pages
      const url = window.location.href;
      const pathname = window.location.pathname;
      const isHomePage = pathname === '/' || 
                         pathname === '/index.html' || 
                         pathname === '/home' ||
                         pathname === '/index' ||
                         pathname === '' ||
                         // Check for URLs that end with just the domain
                         url.match(/^https?:\/\/[^\/]+\/?$/);
      
      if (isHomePage) {
        console.log("Analysis disabled on home page");
        sendResponse({ success: false, error: "Analysis not available on home pages" });
        return;
      }
      
      // Trigger the sidebar to start analysis
      // First ensure sidebar is open
      if (!isSidebarOpen) {
        showSidebar();
      }
      
      // Send a message to the sidebar to start analysis
      if (sidebarFrame && sidebarFrame.contentWindow) {
        setTimeout(() => {
          sidebarFrame.contentWindow.postMessage({
            action: 'triggerAnalysis',
            isAutoAnalysis: true
          }, '*');
        }, 1000); // Give sidebar time to load
      }
      
      sendResponse({ success: true, message: "Auto analysis started" });
    });
    
    return true;
  }
});

// Auto analysis logic - check if auto analysis should run when page loads
function checkAutoAnalysis() {
  console.log("Checking if auto analysis should run...");
  
  // Only run on supported news sites
  const supportedSites = ['bbc.com', 'bbc.co.uk', 'cnn.com', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'reuters.com', 'walla.co.il', 'ynet.co.il', 'n12.co.il', 'c14.co.il', 'mako.co.il'];
  const isSupported = supportedSites.some(site => window.location.href.includes(site));
  
  if (!isSupported) {
    console.log("Site not supported for auto analysis");
    return;
  }
  
  // Check if we're on a home page - disable auto analysis for home pages
  const url = window.location.href;
  const pathname = window.location.pathname;
  const isHomePage = pathname === '/' || 
                     pathname === '/index.html' || 
                     pathname === '/home' ||
                     pathname === '/index' ||
                     pathname === '' ||
                     // Check for URLs that end with just the domain
                     url.match(/^https?:\/\/[^\/]+\/?$/);
  
  if (isHomePage) {
    console.log("Auto analysis disabled on home page");
    return;
  }
  
  // Check if auto analysis is enabled
  chrome.storage.sync.get(['autoAnalysisEnabled'], (result) => {
    const isEnabled = result.autoAnalysisEnabled !== false; // Default to true for premium users
    
    if (!isEnabled) {
      console.log("Auto analysis is disabled");
      return;
    }
    
    console.log("Auto analysis is enabled, starting analysis...");
    
    // Delay to ensure page is fully loaded
    setTimeout(() => {
      // Check if we can extract article content
      const article = extractArticleContent();
      if (!article) {
        console.log("Could not extract article content for auto analysis");
        return;
      }
      
      // Start auto analysis by showing sidebar and triggering analysis
      if (!isSidebarOpen) {
        showSidebar();
      }
      
      // Send message to sidebar to start analysis
      if (sidebarFrame && sidebarFrame.contentWindow) {
        setTimeout(() => {
          sidebarFrame.contentWindow.postMessage({
            action: 'triggerAnalysis',
            isAutoAnalysis: true
          }, '*');
        }, 1500); // Give sidebar more time to load for auto analysis
      }
    }, 2000); // Wait 2 seconds for page to stabilize
  });
}

// Run auto analysis check when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAutoAnalysis);
} else {
  // DOM is already ready
  checkAutoAnalysis();
}

// Add postMessage handler for sidebar communication
window.addEventListener('message', (event) => {
  console.log('[content.js] Received postMessage from:', event.origin, 'Data:', event.data);
  
  // Check if this is from our sidebar iframe
  if (event.source !== sidebarFrame?.contentWindow) {
    console.log('[content.js] Message not from sidebar iframe, ignoring');
    return; // Only accept messages from our sidebar
  }
  
  console.log('[content.js] Processing message from sidebar:', event.data);
  
  if (event.data.action === 'analyze') {
    console.log('[content.js] Received analyze request via postMessage');
    
    // Extract article content
    const article = extractArticleContent();
    if (!article) {
      sidebarFrame.contentWindow.postMessage({
        action: 'analyzeResponse',
        success: false,
        error: 'Failed to extract article content'
      }, '*');
      return;
    }
    
    // Send response back to sidebar
    sidebarFrame.contentWindow.postMessage({
      action: 'analyzeResponse',
      success: true,
      article: article
    }, '*');
    
  } else if (event.data.action === 'highlight') {
    console.log('[content.js] Received highlight request via postMessage');
    
    // Ensure DOM is ready before highlighting
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', async () => {
        try {
          const appliedHighlightsMap = await highlightIssues(event.data.issues);
          sidebarFrame.contentWindow.postMessage({
            action: 'highlightResponse',
            success: true,
            appliedHighlightsMap: appliedHighlightsMap
          }, '*');
        } catch (error) {
          sidebarFrame.contentWindow.postMessage({
            action: 'highlightResponse',
            success: false,
            error: error.message,
            appliedHighlightsMap: []
          }, '*');
        }
      });
    } else {
      highlightIssues(event.data.issues).then(appliedHighlightsMap => {
        sidebarFrame.contentWindow.postMessage({
          action: 'highlightResponse',
          success: true,
          appliedHighlightsMap: appliedHighlightsMap
        }, '*');
      }).catch(error => {
        sidebarFrame.contentWindow.postMessage({
          action: 'highlightResponse',
          success: false,
          error: error.message,
          appliedHighlightsMap: []
        }, '*');
      });
    }
    
  } else if (event.data.action === 'scrollToHighlight') {
    console.log('[content.js] Received scrollToHighlight request via postMessage');
    
    const highlightId = event.data.highlightId;
    
    if (!highlightId) {
      sidebarFrame.contentWindow.postMessage({
        action: 'scrollToHighlightResponse',
        success: false,
        error: 'No highlightId provided'
      }, '*');
      return;
    }
    
    // Check if this is a virtual highlight (starts with truthpilot-virtual-)
    if (highlightId.startsWith('truthpilot-virtual-')) {
      console.log('Virtual highlight clicked - scrolling to top of page');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Provide visual feedback for virtual highlight
      document.body.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
      setTimeout(() => {
        document.body.style.backgroundColor = '';
      }, 1000);
      sidebarFrame.contentWindow.postMessage({
        action: 'scrollToHighlightResponse',
        success: true,
        message: 'Scrolled to top (text not found on page)'
      }, '*');
      return;
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
      sidebarFrame.contentWindow.postMessage({
        action: 'scrollToHighlightResponse',
        success: true
      }, '*');
    } else {
      console.error('Highlight element not found for ID:', highlightId);
      sidebarFrame.contentWindow.postMessage({
        action: 'scrollToHighlightResponse',
        success: false,
        error: 'Highlighted element not found on page'
      }, '*');
    }
    
  } else if (event.data.action === 'closeSidebar') {
    console.log('[content.js] Received closeSidebar request via postMessage');
    hideSidebar();
    
  } else if (event.data.action === 'getUrl') {
    console.log('[content.js] Received getUrl request via postMessage');
    const currentUrl = window.location.href;
    console.log('[content.js] Sending URL response:', currentUrl);
    
    if (sidebarFrame && sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage({
        action: 'urlResponse',
        success: true,
        url: currentUrl
      }, '*');
      console.log('[content.js] URL response sent successfully');
    } else {
      console.error('[content.js] Sidebar frame not available for URL response');
    }
  }
});

} // End of truthPilotContentLoaded check