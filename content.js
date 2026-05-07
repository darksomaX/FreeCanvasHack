// content.js — CanvasHack content script. Runs on all pages at document_start.
// Injects the privacy guard into the MAIN world via an external script tag.
// Handles kiosk bar, UI toggles. No remote connections.

// ── Step 1: Inject privacy guard into MAIN world ──────────────────────────
// Load inject.js as an external script from the extension. This is CSP-safe
// since it's a web-accessible resource from our own extension.

(function injectPrivacyGuard() {
  if (document.documentElement.dataset.chGuard === 'active') return;

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  (document.documentElement || document.head).prepend(script);
})();

// ── Blocked URL check ───────────────────────────────────────────────────────

chrome.storage.local.get(['blockedUrls'], function (result) {
  const currentUrl = new URL(window.location.href).href;

  function normalizeUrl(url) {
    if (!url) return '';
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    return `${parsed.protocol}//${hostname}`;
  }

  const isBlocked = (result.blockedUrls || []).some(blockedUrl => {
    if (!blockedUrl.trim()) return false;
    return normalizeUrl(currentUrl).startsWith(normalizeUrl(blockedUrl.trim()));
  });

  if (isBlocked) {
    console.log(`[CanvasHack] Blocked on: ${currentUrl}`);
    return;
  }

  initFeatures();
});

// ── Main feature init ───────────────────────────────────────────────────────

function initFeatures() {
  chrome.storage.local.set({ injectQuizAnswers: true });

  let barInjected = !!document.getElementById('inputCanvasHack');

  // ── Message listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case 'toggleBar':
        if (barInjected) removeBar();
        else injectBar();
        sendResponse({ injected: barInjected });
        break;
      case 'removeBar':
        removeBar();
        sendResponse({ injected: barInjected });
        break;
      case 'isInjected':
        sendResponse({ injected: barInjected });
        break;
    }
    return true;
  });

  // ── Reload handling ───────────────────────────────────────────────────────
  chrome.storage.local.get(['shouldReload'], function (result) {
    const barExists = document.getElementById('inputCanvasHack') !== null;
    const iframeExists = document.getElementById('kioskIframe') !== null;
    if (barExists && iframeExists) {
      if (result.shouldReload) {
        chrome.storage.local.set({ shouldReload: false });
      } else {
        chrome.storage.local.set({ shouldReload: true }, function () {
          chrome.runtime.sendMessage({ action: 'reloadTab' });
        });
      }
    }
  });

  function removeBar() {
    const el = document.getElementById('inputCanvasHack');
    if (el) el.remove();
    barInjected = false;
  }

  function injectBar() {
    if (barInjected) return;
    const pageSrc = window.location.href;
    const wrapper = document.createElement('div');
    wrapper.id = 'inputCanvasHack';
    wrapper.innerHTML = `
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">
      <div class="bar">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="16" viewBox="0 0 24 24" style="fill: rgba(0, 0, 0, 1)"><path d="m4.431 12.822 13 9A1 1 0 0 0 19 21V3a1 1 0 0 0-1.569-.823l-13 9a1.003 1.003 0 0 0 0 1.645z"></path></svg>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="16" viewBox="0 0 24 24" style="fill: rgb(160, 160, 160)"><path d="M5.536 21.886a1.004 1.004 0 0 0 1.033-.064l13-9a1 1 0 0 0 0-1.644l-13-9A1 1 0 0 0 5 3v18a1 1 0 0 0 .536.886z"></path></svg>
        <p>Restart session</p>
      </div>
      <iframe src="${pageSrc}" id="kioskIframe" scrolling="auto" sandbox="allow-same-origin allow-scripts allow-forms allow-top-navigation allow-top-navigation-by-user-activation"></iframe>
      <style>
        body { height:100vh; width:100vw; margin:0; padding:0; overflow:hidden; }
        .bar { position:fixed; height:2.75vw; top:0; left:0; width:100vw; background-color:#e4e4e4; border-bottom:1px solid #b6b6b6; display:flex; margin:auto; align-items:center; padding-left:.8vw; gap:1.1vw; user-select:none; z-index:9999999999999; }
        iframe { position:fixed; border:none; top:2.75vw; width:100vw; height:100vh; left:0; z-index:99999; }
        .bar p { font-size:1vw; margin:0; font-family:'Roboto',sans-serif; color:#273540; font-weight:400; margin-left:.2vw; }
      </style>
      <script>
        function onIframeLoad() {
          const iframe = document.getElementById('kioskIframe');
          if (iframe && iframe.contentDocument) {
            const mainDomain = iframe.contentWindow.location.protocol + '//' + iframe.contentWindow.location.host;
            const links = iframe.contentDocument.getElementsByTagName('a');
            for (let i = 0; i < links.length; i++) {
              const href = links[i].getAttribute('href');
              if (href && href.startsWith('/')) links[i].setAttribute('href', mainDomain + href);
            }
          }
        }
        const iframeEl = document.getElementById('kioskIframe');
        if (iframeEl) iframeEl.addEventListener('load', onIframeLoad);
      <\/script>
    `;
    document.body.prepend(wrapper);
    barInjected = true;
  }

  console.log('[CanvasHack] All features active on this page.');
}

// ── Injected UI visibility toggle ───────────────────────────────────────────

(function initInjectedUIVisibilityToggle() {
  const STYLE_ID = 'ch-hide-injected-ui-style';

  function setHidden(hidden) {
    let styleEl = document.getElementById(STYLE_ID);
    if (hidden) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = `
          #canvasHackToolbar.toolbar-ch,
          #canvasHackToolbar.toolbar-ch * {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `;
        (document.head || document.documentElement).appendChild(styleEl);
      }
    } else {
      if (styleEl) styleEl.remove();
    }
  }

  chrome.storage.local.get({ showInjectedUI: true }, ({ showInjectedUI }) => {
    setHidden(!showInjectedUI);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'applyShowInjectedUI') setHidden(!msg.show);
  });
})();
