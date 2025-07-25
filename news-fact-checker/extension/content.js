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
  
  // For single issues (streaming), don't clear existing highlights
  const isSingleIssue = issues.length === 1;
  
  if (!isSingleIssue) {
    // Clear existing highlights for batch highlighting
    clearExistingHighlights();
  }
  
  // Add a small delay to ensure DOM is fully processed after clearing
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        const appliedHighlightsMap = performEnhancedHighlighting(issues, isSingleIssue);
        console.log(`[content.js] Finished highlighting. Applied highlights map:`, appliedHighlightsMap);
        resolve(appliedHighlightsMap);
      } catch (error) {
        console.error("[content.js] Error in performEnhancedHighlighting:", error);
        resolve([]);
      }
    }, isSingleIssue ? 10 : 100); // Faster for single issues
  });
}

// Enhanced highlighting logic using range-based approach
function performEnhancedHighlighting(issues, isIncremental = false) {
  // Add enhanced styles for the highlights
  let styleEl = document.querySelector('style[data-truthpilot-highlights]');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.setAttribute('data-truthpilot-highlights', 'true');
    styleEl.textContent = `
    .truthpilot-highlight {
      background: linear-gradient(120deg, rgba(255, 165, 0, 0.25) 0%, rgba(255, 193, 7, 0.3) 100%);
      cursor: pointer;
      position: relative;
      border-radius: 3px;
      padding: 1px 2px;
      margin: -1px -2px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 3px rgba(255, 165, 0, 0.2);
      animation: highlightAppear 0.4s ease-out;
    }
    
    .truthpilot-highlight:hover {
      background: linear-gradient(120deg, rgba(255, 165, 0, 0.4) 0%, rgba(255, 193, 7, 0.45) 100%);
      box-shadow: 0 2px 8px rgba(255, 165, 0, 0.3);
      transform: translateY(-1px);
    }
    
    .truthpilot-highlight.approximate-match {
      background: linear-gradient(120deg, rgba(156, 163, 175, 0.25) 0%, rgba(107, 114, 128, 0.3) 100%);
      border: 1px dashed rgba(156, 163, 175, 0.5);
    }
    
    .truthpilot-tooltip {
      visibility: hidden; /* Controlled by JS */
      opacity: 0; /* Controlled by JS */
      width: 300px; /* Default width */
      position: fixed; /* Fixed positioning to avoid affecting document flow */
      z-index: 2147483647; /* Maximum z-index to ensure tooltip appears above everything */
      transition: opacity 0.3s, visibility 0.3s;
      background-color: #ffffff; 
      color: #202124;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      padding: 15px;
      font-size: 14px;
      line-height: 1.5;
      text-align: left;
      pointer-events: auto;
      /* Ensure tooltip doesn't affect layout */
      top: 0;
      left: 0;
      max-width: 350px;
      word-wrap: break-word;
      /* Prevent any potential layout impact */
      margin: 0;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .truthpilot-sources {
      font-size: 12px;
    }
    
    .truthpilot-sources a {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      transition: all 0.2s ease;
    }
    
    @keyframes highlightAppear {
      0% {
        opacity: 0;
        transform: scale(0.95);
        background: rgba(255, 165, 0, 0.1);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.02);
        background: rgba(255, 165, 0, 0.4);
      }
      100% {
        opacity: 1;
        transform: scale(1);
        background: linear-gradient(120deg, rgba(255, 165, 0, 0.25) 0%, rgba(255, 193, 7, 0.3) 100%);
      }
    }
  `;
    document.head.appendChild(styleEl);
  }
  
  let appliedHighlightsMap = [];
  let highlightCount = 0;
  
  // For incremental highlighting, get the current highlight count
  if (isIncremental) {
    const existingHighlights = document.querySelectorAll('.truthpilot-highlight');
    highlightCount = existingHighlights.length;
  }
  
  // Get the article content container for better context
  const articleContainer = getArticleContainer();
  if (!articleContainer) {
    console.warn('[content.js] No article container found, using document.body');
  }
  
  // Process each issue with enhanced range-based matching
  issues.forEach((issue, originalIssueIndex) => {
    console.log(`[content.js] Processing issue ${originalIssueIndex}/${issues.length}: "${issue.text.substring(0, 100)}${issue.text.length > 100 ? '...' : ''}"`);
    
    try {
      // Use enhanced range-based highlighting approach
      const highlighted = findAndHighlightWithRanges(issue, originalIssueIndex, highlightCount, articleContainer);
      
      if (highlighted.success) {
        appliedHighlightsMap = appliedHighlightsMap.concat(highlighted.mappings);
        highlightCount += highlighted.count;
        console.log(`[content.js] Successfully highlighted issue ${originalIssueIndex} with ${highlighted.count} highlights`);
      } else {
        console.warn(`[content.js] Could not find match for issue ${originalIssueIndex}: "${issue.text.substring(0, 100)}..."`);
        appliedHighlightsMap.push({ 
          originalIssueIndex: originalIssueIndex, 
          highlightId: `truthpilot-virtual-${originalIssueIndex}`,
          matchFound: false 
        });
      }
    } catch (error) {
      console.error("Error highlighting issue:", error, issue);
      appliedHighlightsMap.push({ 
        originalIssueIndex: originalIssueIndex, 
        highlightId: `truthpilot-virtual-${originalIssueIndex}`, 
        matchFound: false 
      });
    }
  });
  
  console.log(`[content.js] Enhanced highlighting complete. Total mappings: ${appliedHighlightsMap.length}`);
  return appliedHighlightsMap;
}

// Helper function to get the main article container
function getArticleContainer() {
  // Try common article container selectors
  const selectors = [
    'article',
    '[role="main"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.content-body',
    '.story-body',
    '.article-body',
    'main',
    '#content',
    '.content'
  ];
  
  for (const selector of selectors) {
    const container = document.querySelector(selector);
    if (container && container.textContent.trim().length > 200) {
      console.log(`[content.js] Found article container using selector: ${selector}`);
      return container;
    }
  }
  
  // Fallback: find the element with the most text content
  const allElements = document.querySelectorAll('div, section, article');
  let bestElement = document.body;
  let maxTextLength = 0;
  
  for (const element of allElements) {
    const textLength = element.textContent.trim().length;
    if (textLength > maxTextLength && textLength > 500) {
      maxTextLength = textLength;
      bestElement = element;
    }
  }
  
  console.log(`[content.js] Using fallback article container with ${maxTextLength} characters`);
  return bestElement;
}

// Enhanced text node traversal that handles inline elements properly
function getEnhancedTextNodes(container = document.body) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        // Skip script, style, and our own highlight elements
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe'].includes(tagName) ||
            parent.classList.contains('truthpilot-highlight') ||
            parent.classList.contains('truthpilot-tooltip')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Only include nodes with meaningful text (at least 2 characters)
        const text = node.textContent.trim();
        if (text.length < 2) {
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

// Build a continuous text representation with position mapping
function buildTextMap(container) {
  const textNodes = getEnhancedTextNodes(container);
  let fullText = '';
  const nodeMap = [];
  
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    const nodeText = node.textContent;
    
    // Skip empty or whitespace-only nodes for performance
    if (!nodeText || nodeText.trim().length === 0) {
      continue;
    }
    
    const startPos = fullText.length;
    const endPos = startPos + nodeText.length;
    
    nodeMap.push({
      node: node,
      startPos: startPos,
      endPos: endPos,
      text: nodeText,
      index: i // Add index for debugging
    });
    
    fullText += nodeText;
  }
  
  console.log(`[content.js] Built text map with ${nodeMap.length} nodes, ${fullText.length} total characters`);
  return { fullText, nodeMap };
}

// Enhanced range-based highlighting function
function findAndHighlightWithRanges(issue, originalIssueIndex, startingHighlightCount, articleContainer) {
  console.log(`[content.js] Using enhanced range-based highlighting for issue ${originalIssueIndex}`);
  
  // Validate inputs
  if (!issue || !issue.text || typeof issue.text !== 'string') {
    console.warn('[content.js] Invalid issue object:', issue);
    return { success: false, mappings: [], count: 0 };
  }
  
  if (issue.text.trim().length < 3) {
    console.warn('[content.js] Issue text too short for reliable highlighting:', issue.text);
    return { success: false, mappings: [], count: 0 };
  }
  
  const container = articleContainer || document.body;
  const { fullText, nodeMap } = buildTextMap(container);
  
  // Validate text map
  if (!fullText || fullText.length < 50) {
    console.warn('[content.js] Article text too short or empty for highlighting');
    return { success: false, mappings: [], count: 0 };
  }
  
  // Try different matching strategies - prioritize exact matches to avoid text alteration
  const strategies = [
    { name: 'exact', caseSensitive: true, wholeWords: false },
    { name: 'exact_case_insensitive', caseSensitive: false, wholeWords: false },
    { name: 'trimmed_exact', caseSensitive: false, wholeWords: false, trimOnly: true },
    { name: 'partial_word_boundary', caseSensitive: false, wholeWords: true },
    { name: 'whitespace_normalized', caseSensitive: false, wholeWords: false, normalizeWhitespace: true },
    { name: 'fuzzy', caseSensitive: false, wholeWords: false, fuzzy: true }
  ];
  
  let bestMatch = null;
  let matchStrategy = null;
  
  for (const strategy of strategies) {
    const match = findTextMatch(fullText, issue.text, strategy);
    if (match) {
      bestMatch = match;
      matchStrategy = strategy.name;
      console.log(`[content.js] Found match using strategy: ${strategy.name}`);
      break;
    }
  }
  
  if (!bestMatch) {
    console.warn(`[content.js] No match found for issue text: "${issue.text.substring(0, 50)}..."`);
    return { success: false, mappings: [], count: 0 };
  }
  
  // Create highlight using the range
  const highlightResult = createRangeBasedHighlight(
    bestMatch, 
    nodeMap, 
    issue, 
    originalIssueIndex, 
    startingHighlightCount,
    matchStrategy === 'fuzzy'
  );
  
  if (highlightResult.success) {
    return {
      success: true,
      mappings: [highlightResult.mapping],
      count: 1
    };
  }
  
  return { success: false, mappings: [], count: 0 };
}

// Find text match with various strategies
function findTextMatch(fullText, issueText, strategy) {
  let searchText = fullText;
  let targetText = issueText;
  
  if (!strategy.caseSensitive) {
    searchText = searchText.toLowerCase();
    targetText = targetText.toLowerCase();
  }
  
  if (strategy.trimOnly) {
    searchText = searchText.trim();
    targetText = targetText.trim();
  } else if (strategy.normalizeWhitespace) {
    // Only normalize whitespace, preserve all other characters
    searchText = searchText.replace(/\s+/g, ' ').trim();
    targetText = targetText.replace(/\s+/g, ' ').trim();
  }
  
  if (strategy.fuzzy) {
    // For fuzzy matching, try to find substantial word sequences
    const words = targetText.trim().split(/\s+/);
    if (words.length >= 3) {
      // Try to find sequences of 3+ consecutive words
      for (let i = 0; i <= words.length - 3; i++) {
        const sequence = words.slice(i, i + 3).join(' ');
        const index = searchText.indexOf(sequence);
        if (index !== -1) {
          return {
            start: index,
            end: index + sequence.length,
            originalStart: index,
            originalEnd: index + sequence.length
          };
        }
      }
    }
    return null;
  }
  
  if (strategy.wholeWords) {
    // Use word boundary matching
    const regex = new RegExp(`\\b${escapeRegExp(targetText)}\\b`, strategy.caseSensitive ? 'g' : 'gi');
    const match = regex.exec(searchText);
    if (match) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        originalStart: match.index,
        originalEnd: match.index + match[0].length
      };
    }
    return null;
  }
  
  // Simple substring matching
  const index = searchText.indexOf(targetText);
  if (index !== -1) {
    return {
      start: index,
      end: index + targetText.length,
      originalStart: index,
      originalEnd: index + targetText.length
    };
  }
  
  return null;
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Create highlight using range-based approach
function createRangeBasedHighlight(match, nodeMap, issue, originalIssueIndex, highlightId, isApproximate = false) {
  const startPos = match.start;
  const endPos = match.end;
  
  // Find which text nodes contain our match
  const affectedNodes = [];
  for (const nodeInfo of nodeMap) {
    if (nodeInfo.endPos > startPos && nodeInfo.startPos < endPos) {
      affectedNodes.push(nodeInfo);
    }
  }
  
  if (affectedNodes.length === 0) {
    console.warn('[content.js] No text nodes found for match position');
    return { success: false, mapping: null };
  }
  
  try {
    const range = document.createRange();
    
    // Set range start
    const startNode = affectedNodes[0];
    const startOffset = Math.max(0, startPos - startNode.startPos);
    range.setStart(startNode.node, startOffset);
    
    // Set range end
    const endNode = affectedNodes[affectedNodes.length - 1];
    const endOffset = Math.min(endNode.text.length, endPos - endNode.startPos);
    range.setEnd(endNode.node, endOffset);
    
    // Create highlight element
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'truthpilot-highlight' + (isApproximate ? ' approximate-match' : '');
    highlightSpan.id = `truthpilot-highlight-${highlightId}`;
    
    // Safely surround the range with our highlight - preserve DOM structure
    try {
      // Check if range crosses element boundaries
      if (range.startContainer === range.endContainer) {
        // Safe to use surroundContents for single text node
        range.surroundContents(highlightSpan);
      } else {
        // Range crosses boundaries, use safer extraction method
        console.log('[content.js] Range crosses boundaries, using safe extraction method');
        
        // Clone the contents to preserve original structure
        const contents = range.cloneContents();
        
        // Only proceed if we have text content to highlight
        if (contents.textContent && contents.textContent.trim()) {
          // Create a safe text-only highlight to avoid DOM structure changes
          const textContent = range.toString();
          highlightSpan.textContent = textContent;
          
          // Replace range with highlight
          range.deleteContents();
          range.insertNode(highlightSpan);
        } else {
          console.warn('[content.js] No valid text content found in range');
          return { success: false, mapping: null };
        }
      }
    } catch (error) {
      console.error('[content.js] Error in range highlighting:', error);
      
      // Final fallback: create text-only highlight
      try {
        const textContent = range.toString();
        if (textContent && textContent.trim()) {
          highlightSpan.textContent = textContent;
          range.deleteContents();
          range.insertNode(highlightSpan);
        } else {
          return { success: false, mapping: null };
        }
      } catch (fallbackError) {
        console.error('[content.js] Fallback highlighting also failed:', fallbackError);
        return { success: false, mapping: null };
      }
    }
    
    // Add tooltip
    createTooltipForHighlight(highlightSpan, issue);
    
    console.log(`[content.js] Successfully created range-based highlight for issue ${originalIssueIndex}`);
    
    return {
      success: true,
      mapping: {
        originalIssueIndex: originalIssueIndex,
        highlightId: highlightSpan.id,
        matchFound: true,
        isApproximate: isApproximate
      }
    };
    
  } catch (error) {
    console.error('[content.js] Error creating range-based highlight:', error);
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
  
  // Position tooltip using fixed positioning to avoid affecting document flow
  function positionTooltip() {
    const rect = highlightSpan.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Use fixed positioning to completely avoid affecting document flow
    tooltip.style.position = 'fixed';
    
    // Calculate horizontal position (centered on highlight, but stay in viewport)
    let leftPos = rect.left + rect.width / 2;
    const tooltipWidth = 300; // Default tooltip width
    
    // Ensure tooltip stays within viewport
    if (leftPos - tooltipWidth / 2 < 10) {
      leftPos = tooltipWidth / 2 + 10; // Left edge
    } else if (leftPos + tooltipWidth / 2 > viewportWidth - 10) {
      leftPos = viewportWidth - tooltipWidth / 2 - 10; // Right edge
    }
    
    tooltip.style.left = `${leftPos}px`;
    tooltip.style.transform = 'translateX(-50%)';
    
    // Calculate vertical position (above highlight, but stay in viewport)
    let topPos = rect.top - 10;
    const tooltipHeight = tooltip.offsetHeight || 150; // Estimate if not rendered
    
    if (topPos - tooltipHeight < 10) {
      // Not enough space above, position below
      topPos = rect.bottom + 10;
      tooltip.style.transform = 'translateX(-50%)';
    } else {
      // Position above
      tooltip.style.transform = 'translateX(-50%) translateY(-100%)';
    }
    
    tooltip.style.top = `${topPos}px`;
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


// New comprehensive function to find and highlight issue text
function findAndHighlightIssueText(issue, originalIssueIndex, startingHighlightCount) {
  let highlightCount = 0;
  let mappings = [];
  let foundAny = false;
  
  // Get all text nodes in the document
  const textNodes = getAllTextNodes();
  
  // Try multiple matching strategies in order of precision - prioritize exact matches
  const strategies = [
    'exact', 'case_insensitive', 'trimmed', 'whitespace_only', 
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
        
      case 'whitespace_only':
        const whitespaceNormalizedNode = nodeText.replace(/\s+/g, ' ').trim().toLowerCase();
        const whitespaceNormalizedIssue = issueText.replace(/\s+/g, ' ').trim().toLowerCase();
        if (whitespaceNormalizedNode.includes(whitespaceNormalizedIssue)) {
          // Find original position by mapping back more carefully
          matches = findOriginalPositionWhitespaceOnly(nodeText, issueText);
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
  if (!text || typeof text !== 'string') return '';
  
  return text.trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[''""]/g, '"') // Normalize quotes
    .replace(/[–—]/g, '-') // Normalize dashes
    .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
    .replace(/\u200B/g, '') // Remove zero-width spaces
    .toLowerCase(); // Make case-insensitive but preserve punctuation for better matching
}

// Advanced text normalization
function normalizeTextAdvanced(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[''""]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
    .replace(/\u200B/g, '') // Remove zero-width spaces
    .replace(/\u2022/g, '') // Remove bullet points
    .replace(/[^\w\s.,;:!?-]/g, '') // Keep only letters, numbers, and basic punctuation
    .toLowerCase();
}

// Helper function to find original position after whitespace-only normalization (safer)
function findOriginalPositionWhitespaceOnly(originalText, issueText) {
  const matches = [];
  
  // Create normalized versions
  const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedIssue = issueText.replace(/\s+/g, ' ').trim().toLowerCase();
  
  const normalizedIndex = normalizedOriginal.indexOf(normalizedIssue);
  
  if (normalizedIndex !== -1) {
    // Create a character mapping from normalized to original positions
    const charMapping = [];
    let originalPos = 0;
    let normalizedPos = 0;
    
    while (originalPos < originalText.length) {
      const char = originalText[originalPos];
      
      if (/\s/.test(char)) {
        // Skip multiple whitespace characters in original
        while (originalPos < originalText.length && /\s/.test(originalText[originalPos])) {
          originalPos++;
        }
        // Single space in normalized
        if (normalizedPos < normalizedOriginal.length && normalizedOriginal[normalizedPos] === ' ') {
          charMapping.push({ original: originalPos - 1, normalized: normalizedPos });
          normalizedPos++;
        }
      } else {
        if (normalizedPos < normalizedOriginal.length) {
          charMapping.push({ original: originalPos, normalized: normalizedPos });
          normalizedPos++;
        }
        originalPos++;
      }
    }
    
    // Find start position in original text
    let startPos = 0;
    for (const mapping of charMapping) {
      if (mapping.normalized >= normalizedIndex) {
        startPos = mapping.original;
        break;
      }
    }
    
    // Find end position
    let endPos = originalText.length;
    const targetEndNormalized = normalizedIndex + normalizedIssue.length;
    for (const mapping of charMapping) {
      if (mapping.normalized >= targetEndNormalized) {
        endPos = mapping.original;
        break;
      }
    }
    
    matches.push({ start: startPos, end: endPos });
  }
  
  return matches;
}

// Keep original function for backward compatibility but make it safer
function findOriginalPosition(originalText, issueText) {
  // Use whitespace-only normalization instead of aggressive normalization
  return findOriginalPositionWhitespaceOnly(originalText, issueText);
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
    
    // Create a safe document fragment to preserve text structure
    const fragment = document.createDocumentFragment();
    
    // Validate match boundaries to prevent text corruption
    const safeStart = Math.max(0, Math.min(match.start, nodeText.length));
    const safeEnd = Math.max(safeStart, Math.min(match.end, nodeText.length));
    
    if (safeStart >= safeEnd) {
      console.warn('[content.js] Invalid match boundaries, skipping highlight');
      return { success: false, mapping: null };
    }
    
    // Add text before the highlight (preserve exact original text)
    if (safeStart > 0) {
      const beforeText = nodeText.substring(0, safeStart);
      fragment.appendChild(document.createTextNode(beforeText));
    }
    
    // Create the highlighted element with exact text content
    const newDomId = `truthpilot-highlight-${highlightId}`;
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'truthpilot-highlight';
    highlightSpan.id = newDomId;
    
    // Use exact text from original node to prevent any alteration
    const highlightText = nodeText.substring(safeStart, safeEnd);
    highlightSpan.textContent = highlightText;
    
    // Verify the highlight text matches what we expect
    if (highlightText.trim().length === 0) {
      console.warn('[content.js] Highlight text is empty, skipping');
      return { success: false, mapping: null };
    }
    
    // Add tooltip
    createTooltipForHighlight(highlightSpan, issue);
    fragment.appendChild(highlightSpan);
    
    // Add text after the highlight (preserve exact original text)
    if (safeEnd < nodeText.length) {
      const afterText = nodeText.substring(safeEnd);
      fragment.appendChild(document.createTextNode(afterText));
    }
    
    // Safely replace the original text node
    try {
      parent.replaceChild(fragment, textNode);
    } catch (error) {
      console.error('[content.js] Error replacing text node:', error);
      return { success: false, mapping: null };
    }
    
    return { 
      success: true, 
      mapping: { originalIssueIndex: originalIssueIndex, highlightId: newDomId, matchFound: true }
    };
  } catch (error) {
    console.error('Error creating highlight in node:', error);
    return { success: false, mapping: null };
  }
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
  
  // Create styles for content shifting when sidebar is open
  const styleEl = document.createElement('style');
  styleEl.id = 'truthpilot-sidebar-style';
  styleEl.textContent = `
    .truthpilot-content-shifted {
      transform: translateX(-175px);
      transition: transform 0.3s ease;
    }
    
    .truthpilot-main-content {
      transition: transform 0.3s ease;
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
    
    // Find main content container and shift it instead of changing body padding
    const mainContent = getMainContentContainer();
    if (mainContent) {
      mainContent.classList.add('truthpilot-content-shifted');
    }
    
    isSidebarOpen = true;
  }, 10);
}

// Helper function to find the main content container
function getMainContentContainer() {
  // Try common main content selectors
  const selectors = [
    'main',
    '[role="main"]',
    '.main-content',
    '.content',
    '#content',
    '.page-content',
    '.article-content',
    'article',
    '.container',
    'body > div:first-child'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element !== document.body) {
      return element;
    }
  }
  
  // Fallback: find the largest child of body
  const bodyChildren = Array.from(document.body.children);
  let largestChild = null;
  let maxArea = 0;
  
  for (const child of bodyChildren) {
    if (child.id === 'truthpilot-sidebar' || child.classList.contains('truthpilot-tooltip')) {
      continue; // Skip our own elements
    }
    
    const rect = child.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      largestChild = child;
    }
  }
  
  return largestChild;
}

// Function to hide the sidebar
function hideSidebar() {
  if (sidebarFrame) {
    sidebarFrame.style.transform = 'translateX(100%)';
    
    // Remove content shift instead of changing body padding
    const mainContent = getMainContentContainer();
    if (mainContent) {
      mainContent.classList.remove('truthpilot-content-shifted');
    }
    
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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
      console.log("Virtual highlight clicked - text not found in article, providing visual feedback");
      
      // Scroll to top to show the article beginning
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Create overlay for visual feedback without affecting article
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 193, 7, 0.15);
        pointer-events: none;
        z-index: 2147483646;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(overlay);
      
      // Show overlay
      setTimeout(() => {
        overlay.style.opacity = '1';
      }, 10);
      
      // Show a temporary message
      const feedbackDiv = document.createElement('div');
      feedbackDiv.textContent = 'This issue relates to the general article content';
      feedbackDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 193, 7, 0.95);
        color: #333;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 193, 7, 0.8);
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(feedbackDiv);
      
      // Animate in the feedback
      setTimeout(() => {
        feedbackDiv.style.opacity = '1';
      }, 10);
      
      // Remove feedback and overlay after 3 seconds
      setTimeout(() => {
        feedbackDiv.style.opacity = '0';
        overlay.style.opacity = '0';
        setTimeout(() => {
          if (feedbackDiv.parentNode) {
            feedbackDiv.parentNode.removeChild(feedbackDiv);
          }
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 300);
      }, 3000);
      
      sendResponse({ success: true, message: "Issue relates to general article content - scrolled to top" });
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
      console.log('Virtual highlight clicked - text not found in article, providing visual feedback');
      
      // Scroll to top to show the article beginning
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Create overlay for visual feedback without affecting article
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 193, 7, 0.15);
        pointer-events: none;
        z-index: 2147483646;
        opacity: 0;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(overlay);
      
      // Show overlay
      setTimeout(() => {
        overlay.style.opacity = '1';
      }, 10);
      
      // Show a temporary message
      const feedbackDiv = document.createElement('div');
      feedbackDiv.textContent = 'This issue relates to the general article content';
      feedbackDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 193, 7, 0.95);
        color: #333;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 193, 7, 0.8);
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(feedbackDiv);
      
      // Animate in the feedback
      setTimeout(() => {
        feedbackDiv.style.opacity = '1';
      }, 10);
      
      // Remove feedback and overlay after 3 seconds
      setTimeout(() => {
        feedbackDiv.style.opacity = '0';
        overlay.style.opacity = '0';
        setTimeout(() => {
          if (feedbackDiv.parentNode) {
            feedbackDiv.parentNode.removeChild(feedbackDiv);
          }
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 300);
      }, 3000);
      
      sidebarFrame.contentWindow.postMessage({
        action: 'scrollToHighlightResponse',
        success: true,
        message: 'Issue relates to general article content - scrolled to top'
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

// Function to highlight a single issue incrementally (for streaming)
function highlightSingleIssue(issue, issueIndex) {
  console.log(`[content.js] Highlighting single issue ${issueIndex}:`, issue.text.substring(0, 50) + '...');
  
  return new Promise((resolve) => {
    try {
      // Use the enhanced highlighting logic for single issue
      const appliedHighlightsMap = performEnhancedHighlighting([issue], true);
      
      // Adjust the mapping to use the correct issue index
      const adjustedMapping = appliedHighlightsMap.map(mapping => ({
        ...mapping,
        originalIssueIndex: issueIndex
      }));
      
      console.log(`[content.js] Enhanced single issue highlight complete:`, adjustedMapping);
      resolve(adjustedMapping);
    } catch (error) {
      console.error(`[content.js] Error highlighting single issue:`, error);
      resolve([]);
    }
  });
}

// Testing function for highlighting system (can be called from console)
function testHighlightingSystem() {
  console.log('[content.js] Testing enhanced highlighting system...');
  
  const testIssues = [
    {
      text: "This is a test issue",
      explanation: "This is a test explanation for validation",
      confidence_score: 0.85,
      source_urls: ["https://example.com"]
    },
    {
      text: "Another test with approximate matching",
      explanation: "Testing approximate matching capabilities",
      confidence_score: 0.75,
      source_urls: []
    }
  ];
  
  // Test with mock data
  return performEnhancedHighlighting(testIssues, false);
}

// Add to global scope for testing
if (typeof window !== 'undefined') {
  window.testTruthPilotHighlighting = testHighlightingSystem;
}

} // End of truthPilotContentLoaded check