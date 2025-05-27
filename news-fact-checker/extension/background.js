// Background service worker for TruthPilot extension
console.log("TruthPilot background script loaded");

// Configuration
const API_URL = "https://news-notes.onrender.com/analyze";

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
    console.log("Attempting to toggle sidebar...");
    const response = await sendMessageToTab(tab.id, { action: "toggleSidebar" });
    
    if (!response || !response.success) {
      console.error("Failed to toggle sidebar:", response?.error || "Unknown error");
      console.log("Attempting to inject content script...");
      
      try {
        // If content script is not responsive, inject it
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["lib/readability.js", "content.js"]
        });
        
        console.log("Content script injected successfully");
        
        // Wait a short moment for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try again to toggle sidebar
        const retryResponse = await sendMessageToTab(tab.id, { action: "toggleSidebar" });
        
        if (!retryResponse || !retryResponse.success) {
          console.error("Failed to toggle sidebar after injection:", retryResponse?.error || "Unknown error");
          await showNotification("Error", "Failed to load the sidebar. Please try again.");
        } else {
          console.log("Sidebar toggled successfully after injection");
        }
      } catch (injectionError) {
        console.error("Failed to inject content script:", injectionError);
        await showNotification("Error", "Failed to load extension components. Please refresh the page and try again.");
      }
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
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.error("Error sending message to tab:", lastError.message || lastError);
        console.error("Message details:", message);
        console.error("Tab ID:", tabId);
        resolve({ success: false, error: lastError.message || "Runtime error" });
      } else if (!response) {
        console.error("No response received from content script");
        resolve({ success: false, error: "No response from content script" });
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