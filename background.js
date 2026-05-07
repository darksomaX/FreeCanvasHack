// background.js — CanvasHack service worker.
// Handles: extension lifecycle, message passing, API test proxy.
// No remote connections except proxying user's own LLM API test requests.

// ── Set defaults on install/startup ─────────────────────────────────────────

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    paid: true,
    lifetimePaid: true,
    saveCorrectAnswers: true,
    privacyGuardEnabled: true,
    injectQuizAnswers: true
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    paid: true,
    lifetimePaid: true,
    saveCorrectAnswers: true,
    privacyGuardEnabled: true,
    injectQuizAnswers: true
  });
});

// ── Message handler ────────────────────────────────────────────────────────
// Content scripts and popup send messages here. The only network request
// this makes is proxying the "test API key" request to the user's chosen endpoint.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {

        case 'reloadTab':
          // Reload the tab that sent the message (used by kiosk bar)
          if (sender.tab?.id) {
            chrome.tabs.reload(sender.tab.id);
            sendResponse({ ok: true });
          } else {
            sendResponse({ error: 'no tab' });
          }
          break;

        case 'testApiKey':
          // Proxy the API test through the service worker to avoid CORS
          // restrictions in the popup. This sends a minimal chat request
          // to whatever endpoint the user configured.
          try {
            const res = await fetch(message.url, {
              method: 'POST',
              headers: message.headers,
              body: JSON.stringify(message.body)
            });

            // Try to parse JSON, but handle non-JSON responses gracefully
            let data;
            const text = await res.text();
            try {
              data = JSON.parse(text);
            } catch {
              data = { raw: text.substring(0, 200) };
            }

            if (res.ok) {
              sendResponse({ ok: true, data });
            } else {
              // Surface the actual HTTP status and error details
              const errMsg = data?.error?.message || data?.message || data?.detail
                || `HTTP ${res.status}: ${text.substring(0, 100)}`;
              sendResponse({ ok: false, error: errMsg, status: res.status });
            }
          } catch (err) {
            sendResponse({ ok: false, error: err.message });
          }
          break;

        default:
          sendResponse({ error: 'unknown action' });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();
  return true; // keep message channel open for async response
});
