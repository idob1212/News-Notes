// Background service worker for TruthPilot extension
"use strict";

console.log("TruthPilot background script loaded");

// Configuration will be loaded dynamically
let TruthPilotConfig = null;
let API_URL = null;

// Load configuration
async function loadConfig() {
  try {
    // Inline configuration for service worker
    TruthPilotConfig = {
      // Set this to 'development' or 'production'
      ENVIRONMENT: 'development', // Change this to 'production' for prod builds
      
      // Environment-specific configurations
      environments: {
        development: {
          API_BASE_URL: 'http://localhost:8000',
          API_ENDPOINT: 'http://localhost:8000/analyze'
        },
        production: {
          API_BASE_URL: 'https://news-notes.onrender.com', // Replace with your actual Render URL
          API_ENDPOINT: 'https://news-notes.onrender.com/analyze'
        }
      },
      
      // Get current environment config
      get current() {
        return this.environments[this.ENVIRONMENT];
      },
      
      // Helper methods
      getApiUrl() {
        return this.current.API_ENDPOINT;
      },
      
      getBaseUrl() {
        return this.current.API_BASE_URL;
      },
      
      isDevelopment() {
        return this.ENVIRONMENT === 'development';
      },
      
      isProduction() {
        return this.ENVIRONMENT === 'production';
      }
    };

    // Make config available globally for service worker context
    self.TruthPilotConfig = TruthPilotConfig;
    
    API_URL = TruthPilotConfig.getApiUrl();
    
    console.log(`TruthPilot running in ${TruthPilotConfig.ENVIRONMENT} mode`);
    console.log(`API URL: ${API_URL}`);
    
    return TruthPilotConfig;
  } catch (error) {
    console.error("Failed to load configuration:", error);
    throw error;
  }
}

// Initialize the extension
async function initialize() {
  await loadConfig();
  console.log("TruthPilot configuration loaded successfully");
}

// Load config on startup
initialize().catch(console.error);

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log("Extension icon clicked on tab:", tab.id);
  
  // Ensure config is loaded
  if (!TruthPilotConfig) {
    await loadConfig();
  }
  
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