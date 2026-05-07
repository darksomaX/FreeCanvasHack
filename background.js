// background.js — Service worker. Handles context menus, test API, badge.

// Context menu — test extension
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.create?.({
    id: 'ch-test',
    title: 'Open CanvasHack Test Page',
    contexts: ['browser_action']
  });
});

chrome.contextMenus?.onClicked?.addListener?.((info) => {
  if (info.menuItemId === 'ch-test') {
    chrome.tabs.create({ url: chrome.runtime.getURL('test-page.html') });
  }
});

// Test API connection from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'testAPI') return false;

  (async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + msg.key
      };
      // OpenRouter needs extra headers
      if (msg.endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = chrome.runtime.getURL('popup.html');
        headers['X-Title'] = 'CanvasHack';
      }

      const res = await fetch(msg.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: msg.model,
          messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
          max_tokens: 10
        })
      });

      const data = await res.json();
      if (data.choices?.[0]) {
        sendResponse({ ok: true, reply: data.choices[0].message.content });
      } else if (data.error) {
        sendResponse({ ok: false, error: data.error.message || JSON.stringify(data.error) });
      } else {
        sendResponse({ ok: false, error: 'Unexpected response: ' + JSON.stringify(data).slice(0, 200) });
      }
    } catch(e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async response
});
