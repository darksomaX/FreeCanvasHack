// inject.js — runs in MAIN world. Overrides visibility/focus APIs and blocks
// event listeners that Canvas uses to detect tab-switching. 100% local.
// This file is loaded both statically (manifest.json world:MAIN) and dynamically
// (content.js script tag). The chGuard check prevents double-execution.

// Prevent double-execution
if (document.documentElement.dataset.chGuard === 'active') {
  // Already ran via static manifest injection
} else {

// ── 1. Override visibility properties ───────────────────────────────────────
const visibilityOverrides = {
  visibilityState: { value: 'visible', writable: true },
  hidden: { value: false, writable: true },
  webkitVisibilityState: { value: 'visible', writable: true },
  webkitHidden: { value: false, writable: true }
};

Object.entries(visibilityOverrides).forEach(([prop, desc]) => {
  Object.defineProperty(document, prop, desc);
});

// ── 2. Override Document.hasFocus to always return true ─────────────────────
Document.prototype.hasFocus = () => true;

// ── 3. Blocked event types ──────────────────────────────────────────────────
const BLOCKED_EVENTS = new Set([
  'focus', 'focusin', 'focusout', 'blur',
  'visibilitychange', 'webkitvisibilitychange',
  'mozvisibilitychange', 'msvisibilitychange',
  'pagehide', 'pageshow',
  'mouseleave', 'mouseenter',
  'mouseout',
  'freeze', 'resume'
]);

// ── 4. Override addEventListener / removeEventListener ──────────────────────

// Save original references BEFORE patching anything
const origAdd = EventTarget.prototype.addEventListener;
const origRemove = EventTarget.prototype.removeEventListener;

function makePatchedAddListener(originalFn) {
  return function (type, listener, options) {
    if (BLOCKED_EVENTS.has(type)) {
      // Silently swallow — don't register the listener at all
      return;
    }
    return originalFn.call(this, type, listener, options);
  };
}

function makePatchedRemoveListener(originalFn) {
  return function (type, listener, options) {
    if (BLOCKED_EVENTS.has(type)) return;
    return originalFn.call(this, type, listener, options);
  };
}

// Patch EventTarget.prototype (the root)
EventTarget.prototype.addEventListener = makePatchedAddListener(origAdd);
EventTarget.prototype.removeEventListener = makePatchedRemoveListener(origRemove);

// Patch Document.prototype directly (document.addEventListener goes here)
if (Document.prototype.addEventListener !== origAdd) {
  // Document has its own copy — patch it separately
  const docAdd = Document.prototype.addEventListener;
  const docRemove = Document.prototype.removeEventListener;
  Document.prototype.addEventListener = makePatchedAddListener(docAdd);
  Document.prototype.removeEventListener = makePatchedRemoveListener(docRemove);
}

// Patch Window.prototype directly (window.addEventListener goes here)
if (Window.prototype.addEventListener !== origAdd) {
  const winAdd = Window.prototype.addEventListener;
  const winRemove = Window.prototype.removeEventListener;
  Window.prototype.addEventListener = makePatchedAddListener(winAdd);
  Window.prototype.removeEventListener = makePatchedRemoveListener(winRemove);
}

// Patch Element.prototype if it has its own copy
if (Element.prototype.addEventListener !== origAdd) {
  const elAdd = Element.prototype.addEventListener;
  const elRemove = Element.prototype.removeEventListener;
  Element.prototype.addEventListener = makePatchedAddListener(elAdd);
  Element.prototype.removeEventListener = makePatchedRemoveListener(elRemove);
}

// ── 5. Override addEventListener directly on document and window instances ──
// Chrome's native bindings sometimes bypass the prototype chain, so we also
// patch the instances directly as a safety net.

const docAdd = document.addEventListener.bind(document);
const docRemove = document.removeEventListener.bind(document);
document.addEventListener = function (type, listener, options) {
  if (BLOCKED_EVENTS.has(type)) return;
  return docAdd(type, listener, options);
};
document.removeEventListener = function (type, listener, options) {
  if (BLOCKED_EVENTS.has(type)) return;
  return docRemove(type, listener, options);
};

const winAdd = window.addEventListener.bind(window);
const winRemove = window.removeEventListener.bind(window);
window.addEventListener = function (type, listener, options) {
  if (BLOCKED_EVENTS.has(type)) return;
  return winAdd(type, listener, options);
};
window.removeEventListener = function (type, listener, options) {
  if (BLOCKED_EVENTS.has(type)) return;
  return winRemove(type, listener, options);
};

// ── 6. Block dispatchEvent for tracked events ──────────────────────────────
const origDispatch = EventTarget.prototype.dispatchEvent;
EventTarget.prototype.dispatchEvent = function (event) {
  if (event && BLOCKED_EVENTS.has(event.type)) return true;
  return origDispatch.call(this, event);
};

// ── 6. Mark guard as active ────────────────────────────────────────────────
document.documentElement.dataset.chGuard = 'active';
console.log('[CanvasHack] Privacy Guard active — visibility/focus APIs overridden, tracking events blocked');

} // end if not already active
