// inject.js — MAIN world. Runs at document_start before any page scripts.
// Overrides visibility/focus APIs, blocks tracking events, runs killswitch guard.

if (document.documentElement.dataset.chGuard === 'active') {
  // Already injected (e.g. static + dynamic both firing)
} else {

// ── Visibility & Focus Overrides ─────────────────────────────────────────────

const visProps = {
  visibilityState:   { value: 'visible',  writable: true },
  hidden:            { value: false,       writable: true },
  webkitVisibilityState: { value: 'visible', writable: true },
  webkitHidden:      { value: false,       writable: true }
};
for (const [prop, desc] of Object.entries(visProps)) {
  Object.defineProperty(document, prop, desc);
}
Document.prototype.hasFocus = () => true;

// ── Blocked Event Types ──────────────────────────────────────────────────────

const BLOCKED = new Set([
  'focus','focusin','focusout','blur',
  'visibilitychange','webkitvisibilitychange','mozvisibilitychange','msvisibilitychange',
  'pagehide','pageshow','mouseleave','mouseenter','mouseout',
  'paste','copy','cut','freeze','resume'
]);

// ── Patch addEventListener / removeEventListener ─────────────────────────────

function patchAdd(orig) {
  return function(type, fn, opts) {
    if (BLOCKED.has(type)) return;
    return orig.call(this, type, fn, opts);
  };
}
function patchRemove(orig) {
  return function(type, fn, opts) {
    if (BLOCKED.has(type)) return;
    return orig.call(this, type, fn, opts);
  };
}

// Patch prototypes
const _add = EventTarget.prototype.addEventListener;
const _rem = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener    = patchAdd(_add);
EventTarget.prototype.removeEventListener = patchRemove(_rem);

if (Document.prototype.addEventListener !== _add) {
  const da = Document.prototype.addEventListener, dr = Document.prototype.removeEventListener;
  Document.prototype.addEventListener    = patchAdd(da);
  Document.prototype.removeEventListener = patchRemove(dr);
}
if (Window.prototype.addEventListener !== _add) {
  const wa = Window.prototype.addEventListener, wr = Window.prototype.removeEventListener;
  Window.prototype.addEventListener    = patchAdd(wa);
  Window.prototype.removeEventListener = patchRemove(wr);
}
if (Element.prototype.addEventListener !== _add) {
  const ea = Element.prototype.addEventListener, er = Element.prototype.removeEventListener;
  Element.prototype.addEventListener    = patchAdd(ea);
  Element.prototype.removeEventListener = patchRemove(er);
}

// Patch instances directly (Chrome sometimes bypasses prototypes)
const da2 = document.addEventListener.bind(document);
const dr2 = document.removeEventListener.bind(document);
document.addEventListener    = function(t,f,o) { if(BLOCKED.has(t)) return; return da2(t,f,o); };
document.removeEventListener = function(t,f,o) { if(BLOCKED.has(t)) return; return dr2(t,f,o); };

const wa2 = window.addEventListener.bind(window);
const wr2 = window.removeEventListener.bind(window);
window.addEventListener    = function(t,f,o) { if(BLOCKED.has(t)) return; return wa2(t,f,o); };
window.removeEventListener = function(t,f,o) { if(BLOCKED.has(t)) return; return wr2(t,f,o); };

// Block dispatchEvent for tracked types
const _dispatch = EventTarget.prototype.dispatchEvent;
EventTarget.prototype.dispatchEvent = function(e) {
  if (e && BLOCKED.has(e.type)) return true;
  return _dispatch.call(this, e);
};

// ── Mark guard active ────────────────────────────────────────────────────────

document.documentElement.dataset.chGuard = 'active';
console.log('[CanvasHack] Privacy Guard active');

// ── KILLSWITCH ───────────────────────────────────────────────────────────────
// If the guard marker is ever removed or the page tries to unpatch our
// overrides, we immediately crash the page with a fake "out of memory" error
// to prevent Canvas from detecting the tampering.

function killswitchCheck() {
  const el = document.documentElement;
  if (el.dataset.chGuard !== 'active') {
    // Guard marker removed — crash immediately
    triggerKill();
    return;
  }
  // Verify property overrides still in place
  if (document.hidden !== false || document.visibilityState !== 'visible') {
    triggerKill();
    return;
  }
}

function triggerKill() {
  // Stop all timers
  clearInterval(ksInterval);

  // Option 1: Fake a browser out-of-memory crash
  // This makes it look like the browser ran out of memory — a plausible excuse
  try {
    // Overwrite the entire page with a "Aw, Snap!" style error
    document.open();
    document.write(`<!DOCTYPE html><html><head><style>
      body{font-family:Segoe UI,Arial,sans-serif;background:#fff;color:#333;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
      .icon{font-size:64px;margin-bottom:16px}
      h1{font-size:24px;font-weight:400;margin:0 0 8px}
      p{font-size:14px;color:#666;margin:0 0 20px}
      button{background:#1a73e8;color:#fff;border:none;padding:10px 24px;border-radius:4px;font-size:14px;cursor:pointer}
    </style></head><body>
    <div><div class="icon">&#x1F4A5;</div>
    <h1>Aw, Snap!</h1>
    <p>Something went wrong while displaying this webpage.</p>
    <p style="color:#999;font-size:12px">Error code: OUT_OF_MEMORY</p>
    <button onclick="location.reload()">Reload</button></div>
    </body></html>`);
    document.close();
  } catch(e) {
    // Fallback: infinite loop to freeze the tab
    while(true) {}
  }
}

// Check every 500ms — fast enough to catch removal attempts
const ksInterval = setInterval(killswitchCheck, 500);

// Also detect if our script tag is removed from the DOM
if (typeof MutationObserver !== 'undefined') {
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.removedNodes) {
        for (const node of m.removedNodes) {
          if (node.src && node.src.includes('inject.js')) {
            triggerKill();
          }
        }
      }
    }
    // Check if our dataset attribute was removed
    if (document.documentElement.dataset.chGuard !== 'active') {
      triggerKill();
    }
  });
  // Start observing once <head> or <body> exists
  const startObs = () => {
    const target = document.head || document.documentElement;
    if (target) {
      obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ch-guard'] });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObs);
  } else {
    startObs();
  }
}

} // end guard check
