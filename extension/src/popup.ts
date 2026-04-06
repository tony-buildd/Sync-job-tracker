/**
 * Sync Job Tracker – Popup Entry Point (V1 Placeholder)
 *
 * This is a minimal placeholder for the popup UI.
 * The full popup implementation (API client, state machine, mark-applied flow)
 * will be built in the extension-popup-and-client feature.
 */

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const urlEl = document.getElementById("current-url");

  if (!statusEl || !urlEl) return;

  // Read the active tab URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.url) {
      urlEl.textContent = tab.url;
      statusEl.textContent = "Ready";
      statusEl.className = "status ready";
    } else {
      urlEl.textContent = "Unable to read tab URL";
      statusEl.textContent = "Unavailable";
      statusEl.className = "status unavailable";
    }
  });
});
