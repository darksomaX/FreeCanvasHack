// content.js — Content script (ISOLATED world). Injects MAIN-world guard, manages UI.

// Phase 1: Inject the privacy guard SYNCHRONOUSLY, before any await.
// This guarantees addEventListener is patched before page scripts run.
(function() {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', chrome.runtime.getURL('inject.js'), false);
    xhr.send();
    var code = xhr.responseText;
    // Default: killswitch armed. Async phase will disable if user turned it off.
    var script = document.createElement('script');
    script.textContent = 'window.__chKillswitch=true;' + code;
    (document.head || document.documentElement).prepend(script);
    script.remove();
  } catch(e) {
    console.error('[CanvasHack] Guard injection failed:', e);
  }
})();

// Phase 2: Async — load settings, configure features.
(async function() {
  var DEFAULTS = {
    answerSaver: true, privacyGuard: true, kioskSpoof: false,
    killswitch: true, aiMode: 'off', aiProvider: '', aiApiKey: '',
    aiModel: '', aiEndpoint: '', aiKeybind: 'y', aiAutoTypeSpeed: 50,
    blockedUrls: [], showInjectedUI: true
  };

  var s = await new Promise(function(r) { chrome.storage.local.get(DEFAULTS, r); });

  // If user disabled killswitch, signal inject.js before its timeout fires
  if (!s.killswitch || !s.privacyGuard) {
    var signal = document.createElement('script');
    signal.textContent = 'window.__chKillswitch=false;';
    (document.head || document.documentElement).appendChild(signal);
    signal.remove();
  }

  // If user disabled privacy guard entirely, remove the guard marker
  // (patches stay in place — they're harmless and prevent re-injection issues)
  if (!s.privacyGuard) {
    var clear = document.createElement('script');
    clear.textContent = 'document.documentElement.dataset.chGuard="";';
    (document.head || document.documentElement).appendChild(clear);
    clear.remove();
  }

  // Skip blocked URLs
  if (s.blockedUrls.some(function(u) { return location.href.indexOf(u) !== -1; })) return;

  // Kiosk bar
  if (s.kioskSpoof && s.showInjectedUI) {
    var bar = document.createElement('div');
    bar.id = 'ch-kiosk-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:32px;background:#c00;color:#fff;font:bold 14px/32px Arial;z-index:2147483647;text-align:center;user-select:none;';
    bar.textContent = '\uD83D\uDD12 Canvas Kiosk App \u2014 Secure Browser v4.2.1';
    document.documentElement.appendChild(bar);
    if (document.body) document.body.style.paddingTop = '32px';
  }

  // Load MAIN world scripts
  function injectScript(src) {
    var el = document.createElement('script');
    el.src = chrome.runtime.getURL(src);
    (document.head || document.documentElement).appendChild(el);
    el.onload = function() { el.remove(); };
  }

  // Answer Saver — Canvas quiz pages only
  if (s.answerSaver && location.hostname.indexOf('instructure.com') !== -1) {
    if (location.pathname.indexOf('/quizzes/') !== -1 && location.pathname.indexOf('/take') !== -1) {
      injectScript('quizanswers.js');
    }
  }

  // AI Answers — Canvas quiz pages + test page
  if (s.aiMode !== 'off' && s.aiApiKey) {
    var isCanvas = location.hostname.indexOf('instructure.com') !== -1;
    var isTest = location.protocol === 'file:' || location.href.indexOf('test-page') !== -1;
    if (isCanvas || isTest) {
      var cfg = document.createElement('script');
      cfg.textContent = 'window.__chAIConfig=' + JSON.stringify({
        mode: s.aiMode, provider: s.aiProvider, apiKey: s.aiApiKey,
        model: s.aiModel, endpoint: s.aiEndpoint,
        keybind: s.aiKeybind, autoTypeSpeed: s.aiAutoTypeSpeed
      }) + ';';
      (document.head || document.documentElement).appendChild(cfg);
      cfg.remove();
      injectScript('ai-answers.js');
    }
  }

  console.log('[CanvasHack] Features active');
})();
