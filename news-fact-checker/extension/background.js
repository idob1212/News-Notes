// Background service worker for TruthPilot extension
console.log("TruthPilot background script loaded");

// Configuration
const API_URL = "http://localhost:8000/analyze";

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log("Extension icon clicked on tab:", tab.id);
  const supportedWebsites = ["bbc.com", "bbc.co.uk", "cnn.com", "nytimes.com", "washingtonpost.com", "wsj.com", "bloomberg.com", "ft.com", "reuters.com", "walla.co.il", "ynet.co.il", "n12.co.il", "c14.co.il", "mako.co.il"];
  
  try {
    // Check if the URL is supported
    if (!supportedWebsites.some(website => tab.url.includes(website))) {
      console.log("Unsupported website. This extension does not work on this website.");
      await showNotification("Unsupported website", "This extension does not work on this website.");
      return;
    }
    
    // Toggle sidebar via content script
    const response = await sendMessageToTab(tab.id, { action: "toggleSidebar" });
    
    if (!response || !response.success) {
      console.error("Failed to toggle sidebar:", response?.error || "Unknown error");
      // If content script is not responsive, inject it
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib/readability.js", "content.js"]
      });
      
      // Try again to toggle sidebar
      await sendMessageToTab(tab.id, { action: "toggleSidebar" });
    }
    
  } catch (error) {
    console.error("Error toggling sidebar:", error);
    await showNotification("Error", "An error occurred while trying to open the sidebar.");
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
      iconUrl: "images/icon128.png",
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