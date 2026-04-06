/**
 * Sync Job Tracker – Background Service Worker (MV3)
 *
 * Minimal for V1:
 * - Registers successfully as a service worker
 * - _execute_action command opens the popup automatically (Chrome default)
 *
 * Future extensions can add:
 * - Badge updates when a job URL is detected
 * - Context menu integration
 */

// Service worker install & activate lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Sync Job Tracker extension installed");
  } else if (details.reason === "update") {
    console.log("Sync Job Tracker extension updated");
  }
});

// Keep the service worker alive by responding to messages (future use)
chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  // Placeholder for future message handling
  sendResponse({ ok: true });
  return true; // keep channel open for async responses
});
