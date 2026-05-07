// inject.js — MAIN world. Runs at document_start before any page scripts.
// Overrides visibility/focus APIs, blocks tracking events, runs killswitch guard.

if (document.documentElement.dataset.chGuard === 'active') {
  // Already injected — skip
} else {

// ── Visibility & Focus Overrides ─────────────────────────────────────────────

Object.defineProperty(document, 'visibilityState',   { value: 'visible', writable: true });
Object.defineProperty(document, 'hidden',            { value: false,      writable: true });
Object.defineProperty(document, 'webkitVisibilityState', { value: 'visible', writable: true });
Object.defineProperty(document, 'webkitHidden',      { value: false,      writable: true });
Document.prototype.hasFocus = function() { return true; };

// ── Blocked Event Types (prototypes — applies to ALL elements) ──────────────

const BLOCKED = new Set([
  'focus','focusin','focusout','blur',
  'visibilitychange','webkitvisibilitychange','mozvisibilitychange','msvisibilitychange',
  'pagehide','pageshow',
  'paste','copy','cut',
  'freeze','resume'
]);

// Events blocked ONLY on document/window instances (not on child elements)
const DOC_BLOCKED = new Set(['mouseleave','mouseenter','mouseout']);

// ── Save native functions BEFORE patching ─────────────────────────────────────

const _origAdd    = EventTarget.prototype.addEventListener;
const _origRemove = EventTarget.prototype.removeEventListener;
const _origDispatch = EventTarget.prototype.dispatchEvent;

// ── Patch addEventListener / removeEventListener ─────────────────────────────

function patchedAdd(type, fn, opts) {
  if (typeof type === 'string' && BLOCKED.has(type)) return this;
  return _origAdd.call(this, type, fn, opts);
}
function patchedRemove(type, fn, opts) {
  if (typeof type === 'string' && BLOCKED.has(type)) return this;
  return _origRemove.call(this, type, fn, opts);
}
function patchedDispatch(evt) {
  if (evt && typeof evt.type === 'string' && BLOCKED.has(evt.type)) return true;
  return _origDispatch.call(this, evt);
}

// Patch prototypes (BLOCKED only — mouseenter/mouseleave still work on elements)
EventTarget.prototype.addEventListener    = patchedAdd;
EventTarget.prototype.removeEventListener = patchedRemove;
EventTarget.prototype.dispatchEvent       = patchedDispatch;

// Also patch Document/Window/Element prototypes if they have own copies
[Document, Window, Element].forEach(function(ctor) {
  if (ctor.prototype.addEventListener !== patchedAdd) {
    var own = Object.getOwnPropertyDescriptor(ctor.prototype, 'addEventListener');
    if (own && own.value) ctor.prototype.addEventListener = patchedAdd;
  }
  if (ctor.prototype.removeEventListener !== patchedRemove) {
    var own = Object.getOwnPropertyDescriptor(ctor.prototype, 'removeEventListener');
    if (own && own.value) ctor.prototype.removeEventListener = patchedRemove;
  }
});

// Patch document and window instances — block BOTH sets
var _allBlocked = new Set([...BLOCKED, ...DOC_BLOCKED]);

var _docAdd = document.addEventListener.bind(document);
var _docRem = document.removeEventListener.bind(document);
document.addEventListener = function(t,f,o) { if(typeof t==='string' && _allBlocked.has(t)) return this; return _docAdd(t,f,o); };
document.removeEventListener = function(t,f,o) { if(typeof t==='string' && _allBlocked.has(t)) return this; return _docRem(t,f,o); };

var _winAdd = window.addEventListener.bind(window);
var _winRem = window.removeEventListener.bind(window);
window.addEventListener = function(t,f,o) { if(typeof t==='string' && _allBlocked.has(t)) return this; return _winAdd(t,f,o); };
window.removeEventListener = function(t,f,o) { if(typeof t==='string' && _allBlocked.has(t)) return this; return _winRem(t,f,o); };

// ── Mark guard active ────────────────────────────────────────────────────────

document.documentElement.dataset.chGuard = 'active';

// ── KILLSWITCH ───────────────────────────────────────────────────────────────

var _ksInterval = null;

function _ksCheck() {
  if (document.documentElement.dataset.chGuard !== 'active') { _ksKill(); return; }
  if (document.hidden !== false || document.visibilityState !== 'visible') { _ksKill(); return; }
}

function _ksKill() {
  if (_ksInterval) clearInterval(_ksInterval);
  _ksInterval = null;
  try {
    document.open();
    document.write('<!DOCTYPE html><html><head><style>body{font-family:Segoe UI,Arial,sans-serif;background:#fff;color:#333;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:400;margin:0 0 8px}p{font-size:14px;color:#666;margin:0 0 20px}button{background:#1a73e8;color:#fff;border:none;padding:10px 24px;border-radius:4px;font-size:14px;cursor:pointer}</style></head><body><div><div class="icon">\uD83D\uDCA5</div><h1>Aw, Snap!</h1><p>Something went wrong while displaying this webpage.</p><p style="color:#999;font-size:12px">Error code: OUT_OF_MEMORY</p><button onclick="location.reload()">Reload</button></div></body></html>');
    document.close();
  } catch(e) { while(true) {} }
}

// Arm killswitch after a short delay to let content.js signal if it should be off
setTimeout(function() {
  if (window.__chKillswitch === false) return;
  _ksInterval = setInterval(_ksCheck, 500);

  // MutationObserver to detect guard removal
  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(function() {
      if (document.documentElement.dataset.chGuard !== 'active') _ksKill();
    });
    var target = document.head || document.documentElement;
    if (target) obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ch-guard'] });
  }
}, 100);

console.log('[CanvasHack] Privacy Guard active');

} // end guard check
