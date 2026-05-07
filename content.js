// content.js — Content script (ISOLATED world). Injects MAIN-world guard, manages UI.

(async function() {

// ── Feature toggles from storage ─────────────────────────────────────────────

const defaults = {
  answerSaver: true,
  privacyGuard: true,
  kioskSpoof: false,
  aiMode: 'off',
  aiProvider: '',
  aiApiKey: '',
  aiModel: '',
  aiEndpoint: '',
  aiKeybind: 'y',
  aiAutoTypeSpeed: 50,
  blockedUrls: [],
  showInjectedUI: true,
  killswitch: true
};

const settings = await new Promise(r =>
  chrome.storage.local.get(defaults, r)
);

// ── Skip blocked URLs ────────────────────────────────────────────────────────

const url = location.href;
if (settings.blockedUrls.some(u => url.includes(u))) return;

// ── Inject privacy guard into MAIN world ─────────────────────────────────────

if (settings.privacyGuard) {
  try {
    const guardCode = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', chrome.runtime.getURL('inject.js'));
      xhr.onload = () => resolve(xhr.responseText);
      xhr.onerror = reject;
      xhr.send();
    });

    const script = document.createElement('script');
    script.textContent = guardCode;
    (document.head || document.documentElement).prepend(script);
    script.remove(); // Remove the script tag — the guard code stays in memory
  } catch(e) {
    console.error('[CanvasHack] Failed to inject guard:', e);
  }
}

// ── Kiosk bar ────────────────────────────────────────────────────────────────

if (settings.kioskSpoof && settings.showInjectedUI) {
  const bar = document.createElement('div');
  bar.id = 'ch-kiosk-bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:32px;background:#c00;color:#fff;font:bold 14px/32px Arial;z-index:2147483647;text-align:center;user-select:none;';
  bar.textContent = '🔒 Canvas Kiosk App — Secure Browser v4.2.1';
  document.documentElement.appendChild(bar);
  document.body.style.paddingTop = '32px';
}

// ── Load feature scripts ─────────────────────────────────────────────────────

function injectScript(src) {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL(src);
  (document.head || document.documentElement).appendChild(s);
  s.onload = () => s.remove();
}

// Answer Saver — only on Canvas quiz pages
if (settings.answerSaver && location.hostname.includes('instructure.com')) {
  const path = location.pathname;
  if (path.includes('/quizzes/') && path.includes('/take')) {
    injectScript('quizanswers.js');
  }
}

// AI Answers — on Canvas quiz pages and test page
if (settings.aiMode !== 'off' && settings.aiApiKey) {
  const isCanvas = location.hostname.includes('instructure.com');
  const isTestPage = location.protocol === 'file:' || location.href.includes('test-page');
  if (isCanvas || isTestPage) {
    // Pass settings to the MAIN world via a data attribute
    const config = document.createElement('script');
    config.textContent = `window.__chAIConfig = ${JSON.stringify({
      mode: settings.aiMode,
      provider: settings.aiProvider,
      apiKey: settings.aiApiKey,
      model: settings.aiModel,
      endpoint: settings.aiEndpoint,
      keybind: settings.aiKeybind,
      autoTypeSpeed: settings.aiAutoTypeSpeed
    })};`;
    (document.head || document.documentElement).appendChild(config);
    config.remove();
    injectScript('ai-answers.js');
  }
}

console.log('[CanvasHack] All features active');

})();
