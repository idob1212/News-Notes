// Background service worker for TruthPilot extension
console.log("TruthPilot background script loaded");

// Configuration
const API_URL = "http://localhost:8000/analyze";

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log("Extension icon clicked on tab:", tab.id);
  const supportedWebsites = ["bbc.com", "bbc.co.uk", "cnn.com", "nytimes.com", "washingtonpost.com", "wsj.com", "bloomberg.com", "ft.com", "reuters.com", "walla.co.il", "ynet.co.il", "n12.co.il", "c14.co.il", "mako.co.il"];
  
  try {
    // Check if the URL is supported (BBC news article)
    if (!supportedWebsites.some(website => tab.url.includes(website))) {
      console.log("Unsupported website. This extension does not work on this website.");
      await showNotification("Unsupported website", "This extension does not work on this website.");
      return;
    }
    
    // Show loading indicator
    await updateBadge("...", "#4285f4");
    
    // Ask content script to extract article content
    const contentResponse = await sendMessageToTab(tab.id, { action: "analyze" });
    
    if (!contentResponse || !contentResponse.success) {
      console.error("Failed to extract article content:", contentResponse?.error || "Unknown error");
      await showNotification("Error", "Failed to extract article content.");
      await updateBadge("!", "#f44336");
      return;
    }
    
    // Send article to backend for analysis
    const article = contentResponse.article;
    console.log("Sending article to backend for analysis:", {
      title: article.title,
      url: article.url,
      contentLength: article.content.length
    });
    
    // Call the API with timeout and security measures
    let apiResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      apiResponse = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "omit", // Don't send cookies
        body: JSON.stringify(article),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
    } catch (fetchError) {
      console.error("API fetch error:", fetchError);
      await showNotification("API Error", "Failed to connect to the analysis server");
      await updateBadge("!", "#f44336");
      return;
    }
    
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("API error:", apiResponse.status, errorText);
      await showNotification("API Error", `Failed to analyze article: ${apiResponse.status}`);
      await updateBadge("!", "#f44336");
      return;
    }
    
    // Parse API response
    let analysis;
    try {
      analysis = await apiResponse.json();
    } catch (parseError) {
      console.error("Error parsing API response:", parseError);
      await showNotification("Error", "Failed to parse analysis results");
      await updateBadge("!", "#f44336");
      return;
    }
    console.log("Analysis results:", analysis);
    
    // Check if there are any issues
    if (!analysis.issues || analysis.issues.length === 0) {
      console.log("No issues found in the article");
      await showNotification("Analysis Complete", "No potential issues found in this article.");
      await updateBadge("0", "#4caf50");
      return;
    }
    
    // Ask content script to highlight issues
    const highlightResponse = await sendMessageToTab(tab.id, {
      action: "highlight",
      issues: analysis.issues
    });
    
    if (!highlightResponse || !highlightResponse.success) {
      console.error("Failed to highlight issues:", highlightResponse?.error || "Unknown error");
      await showNotification("Error", "Failed to highlight issues in the article.");
      await updateBadge("!", "#f44336");
      return;
    }
    
    // Update badge with the number of issues found
    await updateBadge(analysis.issues.length.toString(), "#f44336");
    
    // Show notification
    await showNotification(
      "Potential issues found",
      `Found ${analysis.issues.length} potential issues in this article.`
    );
    
  } catch (error) {
    console.error("Error analyzing article:", error);
    await showNotification("Error", "An error occurred while analyzing the article.");
    await updateBadge("!", "#f44336");
  }
});

// Helper function to send a message to a tab
function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message to tab:", chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// Helper function to show a notification
async function showNotification(title, message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "images/icon128.jpeg",
      title: title,
      message: message
    });
  } else {
    console.log("Notification:", title, "-", message);
  }
}

// Helper function to update the extension badge
async function updateBadge(text, color) {
  if (chrome.action) {
    await chrome.action.setBadgeText({ text: text });
    await chrome.action.setBadgeBackgroundColor({ color: color });
  }
} 