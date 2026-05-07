// background.js — Service worker. Handles context menus, test API, badge.

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
      if (!msg.endpoint) {
        sendResponse({ ok: false, error: 'No endpoint URL. Select a provider or enter a custom endpoint.' });
        return;
      }
      if (!msg.model) {
        sendResponse({ ok: false, error: 'No model selected. Pick a model from the dropdown.' });
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + msg.key
      };
      if (msg.endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://canvashack.app';
        headers['X-Title'] = 'CanvasHack';
      }

      const body = JSON.stringify({
        model: msg.model,
        messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
        max_tokens: 10
      });

      let res;
      try {
        res = await fetch(msg.endpoint, { method: 'POST', headers, body });
      } catch(fetchErr) {
        sendResponse({ ok: false, error: 'Network error: ' + fetchErr.message + '. Check if the endpoint URL is correct and CORS is allowed. Extension service workers CAN fetch external APIs.' });
        return;
      }

      let data;
      let rawText = '';
      try {
        rawText = await res.text();
        data = JSON.parse(rawText);
      } catch(parseErr) {
        sendResponse({ ok: false, error: 'HTTP ' + res.status + ': Response is not JSON. Body: ' + rawText.slice(0, 300) });
        return;
      }

      if (!res.ok) {
        const errMsg = data.error?.message || data.message || data.detail || JSON.stringify(data);
        const suggestion = res.status === 401 ? ' Check your API key.' :
                          res.status === 404 ? ' Model "' + msg.model + '" not found. It may have been removed — try a different model.' :
                          res.status === 429 ? ' Rate limited. Wait a moment and try again.' :
                          res.status === 402 ? ' Payment required. This model needs credits.' : '';
        sendResponse({ ok: false, error: 'HTTP ' + res.status + ': ' + errMsg + suggestion });
        return;
      }

      if (data.choices?.[0]?.message?.content) {
        sendResponse({ ok: true, reply: data.choices[0].message.content.trim() });
      } else if (data.error) {
        sendResponse({ ok: false, error: 'API error: ' + (data.error.message || JSON.stringify(data.error)) });
      } else {
        sendResponse({ ok: false, error: 'Unexpected response format: ' + JSON.stringify(data).slice(0, 300) });
      }
    } catch(e) {
      sendResponse({ ok: false, error: 'Exception: ' + e.message });
    }
  })();
  return true;
});
