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

// Enhanced text preprocessing for better matching
function preprocessText(text) {
  return text
    .trim()
    // Normalize Unicode characters
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Replace various quote marks with standard quotes
    .replace(/[''‚‛`´]/g, "'")
    .replace(/[""„‟«»]/g, '"')
    // Replace various dashes with standard dash
    .replace(/[–—―‒]/g, '-')
    // Replace various apostrophes
    .replace(/['']/g, "'")
    // Normalize ellipsis
    .replace(/…/g, '...')
    // Replace non-breaking spaces with regular spaces
    .replace(/\u00A0/g, ' ')
    // Normalize multiple whitespace to single space
    .replace(/\s+/g, ' ')
    .trim();
}

// Enhanced text similarity calculation using multiple algorithms
function calculateTextSimilarity(str1, str2) {
  // Preprocess both strings
  const text1 = preprocessText(str1.toLowerCase());
  const text2 = preprocessText(str2.toLowerCase());
  
  // Exact match gets highest score
  if (text1 === text2) return 1.0;
  
  // Containment check
  if (text1.includes(text2) || text2.includes(text1)) return 0.9;
  
  // Jaccard similarity based on words
  const words1 = new Set(text1.split(/\s+/));
  const words2 = new Set(text2.split(/\s+/));
  const intersection = new Set([...words1].filter(word => words2.has(word)));
  const union = new Set([...words1, ...words2]);
  const jaccardScore = intersection.size / union.size;
  
  // Levenshtein distance normalized
  const maxLength = Math.max(text1.length, text2.length);
  const levenshteinScore = 1 - (levenshteinDistance(text1, text2) / maxLength);
  
  // Combined score with weights
  return (jaccardScore * 0.6) + (levenshteinScore * 0.4);
}

// Enhanced key phrase extraction
function extractKeyPhrases(text, minLength = 2) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'said', 'says', 'say', 'also', 'not', 'one', 'two', 'from', 'they', 'them', 'their',
    'when', 'where', 'what', 'who', 'how', 'why', 'which', 'than', 'more', 'most', 'some',
    'about', 'into', 'after', 'before', 'during', 'between', 'through', 'over', 'under',
    'very', 'just', 'only', 'even', 'back', 'any', 'good', 'new', 'first', 'last', 'long',
    'great', 'little', 'own', 'other', 'old', 'right', 'big', 'high', 'different', 'small'
  ]);
  
  const processed = preprocessText(text.toLowerCase());
  
  // Extract meaningful phrases (2-4 words) and single important words
  const phrases = [];
  const words = processed.split(/\s+/).filter(word => word.length >= minLength);
  
  // Single important words (longer, not stop words, contain vowels)
  words.forEach(word => {
    if (word.length >= 4 && !stopWords.has(word) && /[aeiou]/.test(word) && !/^\d+$/.test(word)) {
      phrases.push(word);
    }
  });
  
  // Two-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
      phrases.push(phrase);
    }
  }
  
  // Three-word phrases (more selective)
  for (let i = 0; i < words.length - 2; i++) {
    const hasStopWord = stopWords.has(words[i]) || stopWords.has(words[i + 1]) || stopWords.has(words[i + 2]);
    if (!hasStopWord) {
      phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }
  
  // Sort by length and importance (longer phrases first, then unique words)
  return phrases
    .filter((phrase, index, arr) => arr.indexOf(phrase) === index) // Remove duplicates
    .sort((a, b) => {
      const lengthDiff = b.split(' ').length - a.split(' ').length;
      if (lengthDiff !== 0) return lengthDiff;
      return b.length - a.length;
    })
    .slice(0, 10); // Keep top 10 phrases
}

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

// Enhanced highlighting logic with guaranteed fallback positioning
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
    
    .truthpilot-fallback-highlight {
      background-color: rgba(255, 100, 100, 0.2);
      cursor: pointer;
      position: relative;
      border: 1px dashed rgba(255, 100, 100, 0.5);
      padding: 2px;
      margin: 2px 0;
      border-radius: 3px;
    }
    
    .truthpilot-tooltip {
      visibility: hidden;
      opacity: 0;
      width: 300px;
      position: absolute;
      z-index: 2147483647;
      transition: opacity 0.3s, visibility 0.3s;
      background-color: #ffffff; 
      color: #202124;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
      border-radius: 8px;
      padding: 15px;
      font-size: 14px;
      line-height: 1.5;
      text-align: left;
      pointer-events: auto;
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
    }
  `;
  document.head.appendChild(styleEl);
  
  let appliedHighlightsMap = [];
  let highlightCount = 0;
  
  // Get article containers for fallback positioning
  const articleContainers = getArticleContainers();
  
  // Process each issue with enhanced matching
  issues.forEach((issue, originalIssueIndex) => {
    console.log(`[content.js] Processing issue ${originalIssueIndex}/${issues.length}: "${issue.text.substring(0, 100)}${issue.text.length > 100 ? '...' : ''}"`);
    
    try {
      let matchResult = findBestTextMatch(issue.text);
      
      if (matchResult.found) {
        console.log(`[content.js] Direct match found for issue ${originalIssueIndex} using ${matchResult.strategy} strategy`);
        const highlighted = highlightTextInNodes(issue, originalIssueIndex, matchResult, highlightCount);
        if (highlighted.success) {
          appliedHighlightsMap = appliedHighlightsMap.concat(highlighted.mappings);
          highlightCount += highlighted.count;
          console.log(`[content.js] Successfully highlighted issue ${originalIssueIndex} with ${highlighted.count} highlights`);
          return; // Success, move to next issue
        }
      }
      
      // If direct matching failed, try semantic/contextual matching
      console.log(`[content.js] Direct matching failed for issue ${originalIssueIndex}, trying semantic matching`);
      const semanticMatch = findSemanticMatch(issue.text);
      if (semanticMatch.found) {
        const highlighted = highlightTextInNodes(issue, originalIssueIndex, semanticMatch, highlightCount);
        if (highlighted.success) {
          appliedHighlightsMap = appliedHighlightsMap.concat(highlighted.mappings);
          highlightCount += highlighted.count;
          console.log(`[content.js] Successfully highlighted issue ${originalIssueIndex} using semantic matching`);
          return; // Success, move to next issue
        }
      }
      
      // Final fallback: Create a guaranteed clickable area
      console.log(`[content.js] All matching strategies failed for issue ${originalIssueIndex}, creating fallback highlight`);
      const fallbackHighlight = createFallbackHighlight(issue, originalIssueIndex, highlightCount, articleContainers);
      appliedHighlightsMap.push(fallbackHighlight.mapping);
      highlightCount += 1;
      console.log(`[content.js] Created fallback highlight for issue ${originalIssueIndex}`);
      
    } catch (error) {
      console.error("Error highlighting issue:", error, issue);
      // Even on error, create a fallback to ensure clickability
      const fallbackHighlight = createFallbackHighlight(issue, originalIssueIndex, highlightCount, articleContainers);
      appliedHighlightsMap.push(fallbackHighlight.mapping);
      highlightCount += 1;
    }
  });
  
  console.log(`[content.js] Highlighting complete. Total mappings: ${appliedHighlightsMap.length}`);
  return appliedHighlightsMap;
}

// Enhanced text matching with multiple strategies
function findBestTextMatch(issueText) {
  const bodyText = document.body.innerText || document.body.textContent || '';
  const preprocessedIssue = preprocessText(issueText);
  const preprocessedBody = preprocessText(bodyText);
  
  // Strategy 1: Exact match in preprocessed text
  if (preprocessedBody.includes(preprocessedIssue)) {
    const index = preprocessedBody.indexOf(preprocessedIssue);
    return {
      found: true,
      strategy: 'exact_preprocessed',
      text: issueText,
      confidence: 1.0
    };
  }
  
  // Strategy 2: Case-insensitive match
  const lowerIssue = preprocessedIssue.toLowerCase();
  const lowerBody = preprocessedBody.toLowerCase();
  if (lowerBody.includes(lowerIssue)) {
    const index = lowerBody.indexOf(lowerIssue);
    return {
      found: true,
      strategy: 'case_insensitive',
      text: issueText,
      confidence: 0.9
    };
  }
  
  // Strategy 3: Partial substring matching (for long quotes)
  if (issueText.length > 50) {
    // Try matching chunks of the issue text
    const chunks = [];
    const words = preprocessedIssue.split(/\s+/);
    for (let i = 0; i < words.length - 4; i++) {
      chunks.push(words.slice(i, i + 5).join(' '));
    }
    
    for (const chunk of chunks) {
      if (lowerBody.includes(chunk.toLowerCase())) {
        return {
          found: true,
          strategy: 'partial_chunk',
          text: chunk,
          confidence: 0.7
        };
      }
    }
  }
  
  return { found: false, strategy: null, text: null, confidence: 0 };
}

// Semantic matching using key phrases and context
function findSemanticMatch(issueText) {
  const keyPhrases = extractKeyPhrases(issueText);
  const bodyText = document.body.innerText || document.body.textContent || '';
  const lowerBody = preprocessText(bodyText.toLowerCase());
  
  let bestMatch = { found: false, confidence: 0 };
  
  // Try to find key phrases in the body
  for (const phrase of keyPhrases) {
    const lowerPhrase = phrase.toLowerCase();
    if (lowerBody.includes(lowerPhrase)) {
      const confidence = 0.6 + (phrase.split(' ').length * 0.1); // Longer phrases get higher confidence
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          found: true,
          strategy: 'semantic_phrase',
          text: phrase,
          confidence: confidence
        };
      }
    }
  }
  
  // If we found a semantic match with reasonable confidence, return it
  if (bestMatch.confidence >= 0.6) {
    return bestMatch;
  }
  
  return { found: false, strategy: null, text: null, confidence: 0 };
}

// Get potential article container elements for fallback positioning
function getArticleContainers() {
  const selectors = [
    'article',
    '[role="main"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.story-body',
    '.article-body',
    '.content',
    'main',
    '#content',
    '#main'
  ];
  
  const containers = [];
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el.offsetHeight > 100 && el.innerText.length > 200) { // Must be substantial
        containers.push(el);
      }
    });
  }
  
  // If no specific containers found, use body
  if (containers.length === 0) {
    containers.push(document.body);
  }
  
  return containers;
}

// Create a guaranteed fallback highlight that's always clickable
function createFallbackHighlight(issue, originalIssueIndex, highlightCount, articleContainers) {
  const fallbackId = `truthpilot-highlight-${highlightCount}`;
  
  // Find the best container (prefer the one with most text)
  const bestContainer = articleContainers.reduce((best, container) => {
    return (container.innerText || '').length > (best.innerText || '').length ? container : best;
  }, articleContainers[0]);
  
  // Create a fallback highlight element at the beginning of the article
  const fallbackElement = document.createElement('div');
  fallbackElement.id = fallbackId;
  fallbackElement.className = 'truthpilot-fallback-highlight';
  fallbackElement.innerHTML = `
    <strong>📍 Issue Found:</strong> ${issue.text.substring(0, 80)}${issue.text.length > 80 ? '...' : ''}
    <br><small style="color: #666;">Click to view details (text may not be highlighted on page)</small>
  `;
  
  // Style the fallback element
  fallbackElement.style.cssText = `
    background-color: rgba(255, 165, 0, 0.1);
    border-left: 4px solid #ff6b35;
    padding: 8px 12px;
    margin: 8px 0;
    border-radius: 4px;
    font-size: 13px;
    line-height: 1.4;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  
  // Add hover effect
  fallbackElement.addEventListener('mouseenter', () => {
    fallbackElement.style.backgroundColor = 'rgba(255, 165, 0, 0.2)';
    fallbackElement.style.transform = 'translateX(4px)';
  });
  
  fallbackElement.addEventListener('mouseleave', () => {
    fallbackElement.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
    fallbackElement.style.transform = 'translateX(0)';
  });
  
  // Add tooltip functionality
  createTooltipForHighlight(fallbackElement, issue);
  
  // Insert at the beginning of the best container
  if (bestContainer.firstChild) {
    bestContainer.insertBefore(fallbackElement, bestContainer.firstChild);
  } else {
    bestContainer.appendChild(fallbackElement);
  }
  
  return {
    mapping: { 
      originalIssueIndex: originalIssueIndex, 
      highlightId: fallbackId, 
      matchFound: true, // Mark as found since we created a clickable element
      isFallback: true 
    }
  };
}

// ... existing code ...
  
  let appliedHighlightsMap = [];
  let highlightCount = 0;
  
  // Get the entire body text for better cross-element matching
  const bodyText = document.body.innerText || document.body.textContent || '';
  
  // Process each issue
  issues.forEach((issue, originalIssueIndex) => {
    console.log(`[content.js] Processing issue ${originalIssueIndex}/${issues.length}: "${issue.text.substring(0, 100)}${issue.text.length > 100 ? '...' : ''}"`);
    
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
        console.log(`[content.js] Successfully highlighted issue ${originalIssueIndex} with ${highlighted.count} highlights`);
      } else {
        // Try alternative matching strategies if the primary one failed
        console.log(`[content.js] Primary matching failed for issue ${originalIssueIndex}, trying alternative strategies`);
        
        let alternativeSuccess = false;
        const strategies = ['exact', 'case_insensitive', 'normalized', 'fuzzy'];
        
        for (const altStrategy of strategies) {
          if (altStrategy === matchingStrategy) continue; // Skip the already-tried strategy
          
          const altHighlighted = highlightTextInNodes(issue, originalIssueIndex, altStrategy, highlightCount);
          if (altHighlighted.success) {
            appliedHighlightsMap = appliedHighlightsMap.concat(altHighlighted.mappings);
            highlightCount += altHighlighted.count;
            console.log(`[content.js] Alternative strategy '${altStrategy}' succeeded for issue ${originalIssueIndex}`);
            alternativeSuccess = true;
            break;
          }
        }
        
        if (!alternativeSuccess) {
          console.warn(`[content.js] All matching strategies failed for issue ${originalIssueIndex}: "${issue.text.substring(0, 100)}..."`);
          // Mark as not found instead of creating virtual highlights
          appliedHighlightsMap.push({ 
            originalIssueIndex: originalIssueIndex, 
            highlightId: null, 
            matchFound: false 
          });
        }
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
  return text.trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[''""]/g, '"') // Normalize quotes
    .replace(/[–—]/g, '-') // Normalize dashes
    .toLowerCase(); // Make case-insensitive but preserve punctuation for better matching
}

// Helper function to extract key words from issue text
function extractKeyWords(text) {
  // Enhanced stop words list
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'said', 'says', 'say', 'also', 'not', 'one', 'two', 'from', 'they', 'them', 'their',
    'when', 'where', 'what', 'who', 'how', 'why', 'which', 'than', 'more', 'most', 'some',
    'about', 'into', 'after', 'before', 'during', 'between', 'through', 'over', 'under'
  ]);
  
  // Extract meaningful words with improved filtering
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => {
      // Keep words that are:
      // - At least 3 characters long
      // - Not common words
      // - Contain at least one vowel (to avoid abbreviations like "LLC", "US", etc.)
      // - Are not pure numbers
      return word.length >= 3 && 
             !commonWords.has(word) && 
             /[aeiou]/.test(word) &&
             !/^\d+$/.test(word);
    });
  
  // Sort by length (longer words are often more meaningful) and take top 4
  return words
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

// Enhanced function to highlight text in actual DOM nodes with improved matching
function highlightTextInNodes(issue, originalIssueIndex, matchResult, startingHighlightCount) {
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
      node.parentElement.classList.contains('truthpilot-highlight') ||
      node.parentElement.classList.contains('truthpilot-fallback-highlight')
    ) {
      continue;
    }
    textNodes.push(node);
  }
  
  // Use the text from matchResult for more precise highlighting
  const searchText = matchResult.text || issue.text;
  
  // Try to find and highlight the text
  for (const textNode of textNodes) {
    const nodeText = textNode.textContent || "";
    let shouldHighlight = false;
    let textToHighlight = searchText;
    let parts = [];
    
    // Apply enhanced matching logic based on strategy
    const match = findEnhancedMatchInNode(nodeText, searchText, matchResult.strategy);
    if (match) {
      shouldHighlight = true;
      textToHighlight = nodeText.substring(match.start, match.end);
      parts = [
        nodeText.substring(0, match.start),
        nodeText.substring(match.end)
      ];
    }
    
    if (shouldHighlight && parts.length >= 2) {
      foundAny = true;
      const parent = textNode.parentNode;
      const fragment = document.createDocumentFragment();
      
      // Add the text before the highlight
      if (parts[0]) {
        fragment.appendChild(document.createTextNode(parts[0]));
      }
      
      // Create the highlighted element
      const newDomId = `truthpilot-highlight-${startingHighlightCount + highlightCount}`;
      const highlightSpan = document.createElement('span');
      highlightSpan.className = 'truthpilot-highlight';
      highlightSpan.id = newDomId;
      highlightSpan.textContent = textToHighlight;
      
      mappings.push({ 
        originalIssueIndex: originalIssueIndex, 
        highlightId: newDomId, 
        matchFound: true,
        confidence: matchResult.confidence || 1.0,
        strategy: matchResult.strategy
      });
      highlightCount++;
      
      // Add tooltip
      createTooltipForHighlight(highlightSpan, issue);
      fragment.appendChild(highlightSpan);
      
      // Add the text after the highlight
      if (parts[1]) {
        fragment.appendChild(document.createTextNode(parts[1]));
      }
      
      // Replace the original text node with the fragment
      parent.replaceChild(fragment, textNode);
      
      // For high-confidence exact matches, stop after first match to avoid over-highlighting
      // For lower-confidence matches, continue to find all instances
      if (matchResult.confidence >= 0.9) {
        break;
      }
    }
  }
  
  return { success: foundAny, mappings: mappings, count: highlightCount };
}

// Enhanced node-level matching with preprocessing
function findEnhancedMatchInNode(nodeText, searchText, strategy) {
  switch (strategy) {
    case 'exact_preprocessed':
      const preprocessedNode = preprocessText(nodeText);
      const preprocessedSearch = preprocessText(searchText);
      const exactIndex = preprocessedNode.indexOf(preprocessedSearch);
      if (exactIndex !== -1) {
        // Map back to original positions (approximation)
        const originalIndex = nodeText.toLowerCase().indexOf(searchText.toLowerCase());
        if (originalIndex !== -1) {
          return { start: originalIndex, end: originalIndex + searchText.length };
        }
      }
      break;
      
    case 'case_insensitive':
      const lowerNode = nodeText.toLowerCase();
      const lowerSearch = searchText.toLowerCase();
      const caseInsIndex = lowerNode.indexOf(lowerSearch);
      if (caseInsIndex !== -1) {
        return { start: caseInsIndex, end: caseInsIndex + searchText.length };
      }
      break;
      
    case 'partial_chunk':
    case 'semantic_phrase':
      // For semantic/partial matches, find the best approximation
      const normalizedNode = preprocessText(nodeText.toLowerCase());
      const normalizedSearch = preprocessText(searchText.toLowerCase());
      const semanticIndex = normalizedNode.indexOf(normalizedSearch);
      if (semanticIndex !== -1) {
        // Try to find the closest match in the original text
        const originalMatch = findClosestOriginalMatch(nodeText, searchText);
        if (originalMatch) {
          return originalMatch;
        }
      }
      break;
      
    default:
      // Fallback to original matching logic
      return findBestMatchInNode(nodeText, searchText, strategy);
  }
  
  return null;
}

// Helper to find closest match in original text for semantic matches
function findClosestOriginalMatch(originalText, searchText) {
  const originalLower = originalText.toLowerCase();
  const searchLower = searchText.toLowerCase();
  
  // Try different word combinations from the search text
  const searchWords = searchLower.split(/\s+/);
  
  for (let i = 0; i < searchWords.length; i++) {
    for (let j = i + 1; j <= searchWords.length; j++) {
      const phrase = searchWords.slice(i, j).join(' ');
      if (phrase.length > 3) { // Only consider substantial phrases
        const phraseIndex = originalLower.indexOf(phrase);
        if (phraseIndex !== -1) {
          return { 
            start: phraseIndex, 
            end: phraseIndex + phrase.length 
          };
        }
      }
    }
  }
  
  return null;
}

// Helper function to find the best match in a text node based on strategy
function findBestMatchInNode(nodeText, issueText, strategy) {
  switch (strategy) {
    case 'exact':
      const exactIndex = nodeText.indexOf(issueText);
      if (exactIndex !== -1) {
        return { start: exactIndex, end: exactIndex + issueText.length };
      }
      break;
      
    case 'case_insensitive':
      const lowerNode = nodeText.toLowerCase();
      const lowerIssue = issueText.toLowerCase();
      const caseInsIndex = lowerNode.indexOf(lowerIssue);
      if (caseInsIndex !== -1) {
        return { start: caseInsIndex, end: caseInsIndex + issueText.length };
      }
      break;
      
    case 'normalized':
    case 'fuzzy':
      // Use the improved findOriginalTextMatch for complex matching
      return findOriginalTextMatch(nodeText, issueText);
  }
  
  return null;
}

// Helper function to find original text match position
function findOriginalTextMatch(originalText, searchText) {
  // Try multiple approaches to find the best match
  
  // Approach 1: Direct case-insensitive match
  const lowerOriginal = originalText.toLowerCase();
  const lowerSearch = searchText.toLowerCase();
  let index = lowerOriginal.indexOf(lowerSearch);
  
  if (index !== -1) {
    return { start: index, end: index + searchText.length };
  }
  
  // Approach 2: Fuzzy matching with word boundaries
  const searchWords = searchText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const originalWords = originalText.toLowerCase().split(/\s+/);
  
  // Find the best sequence of matching words
  let bestMatch = null;
  let bestScore = 0;
  
  for (let i = 0; i < originalWords.length; i++) {
    let matchedWords = 0;
    let wordStartIndex = -1;
    let wordEndIndex = -1;
    
    for (let j = 0; j < searchWords.length && (i + j) < originalWords.length; j++) {
      const originalWord = originalWords[i + j];
      const searchWord = searchWords[j];
      
      if (originalWord.includes(searchWord) || searchWord.includes(originalWord) || 
          levenshteinDistance(originalWord, searchWord) <= Math.min(2, Math.floor(searchWord.length / 3))) {
        matchedWords++;
        if (wordStartIndex === -1) {
          // Find the actual character position of this word in the original text
          const wordsBeforeStart = originalWords.slice(0, i + j).join(' ');
          wordStartIndex = wordsBeforeStart.length + (wordsBeforeStart.length > 0 ? 1 : 0);
        }
        const wordsUpToEnd = originalWords.slice(0, i + j + 1).join(' ');
        wordEndIndex = wordsUpToEnd.length;
      } else {
        break; // Stop if we hit a non-matching word
      }
    }
    
    const score = matchedWords / searchWords.length;
    if (score > bestScore && score > 0.5) { // At least 50% of words must match
      bestScore = score;
      bestMatch = { start: wordStartIndex, end: wordEndIndex };
    }
  }
  
  return bestMatch;
}

// Helper function to calculate edit distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
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