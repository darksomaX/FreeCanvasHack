// popup.js — Extension popup dashboard.

// ── Provider definitions ──────────────────────────────────────────────────────

const PROVIDERS = {
  openai: {
    name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions',
    keyPrefixes: ['sk-'], keyHint: 'Starts with sk-',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' }
    ]
  },
  google: {
    name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyPrefixes: ['AIza'], keyHint: 'Starts with AIza',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash' }
    ]
  },
  groq: {
    name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyPrefixes: ['gsk_'], keyHint: 'Starts with gsk_',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }
    ]
  },
  openrouter: {
    name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyPrefixes: ['sk-or-'], keyHint: 'Starts with sk-or-',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)' },
      { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (Free)' },
      { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B (Free)' },
      { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (Free)' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (Free)' }
    ]
  },
  huggingface: {
    name: 'Hugging Face', endpoint: 'https://api-inference.huggingface.co/v1/chat/completions',
    keyPrefixes: ['hf_'], keyHint: 'Starts with hf_',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
      { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B v0.3' }
    ]
  },
  together: {
    name: 'Together AI', endpoint: 'https://api.together.xyz/v1/chat/completions',
    keyPrefixes: ['together_'], keyHint: 'Starts with together_',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo' }
    ]
  },
  cohere: {
    name: 'Cohere', endpoint: 'https://api.cohere.ai/v1/chat/completions',
    keyPrefixes: ['co-'], keyHint: 'Starts with co-',
    models: [{ id: 'command-r', name: 'Command R' }]
  },
  mistral: {
    name: 'Mistral AI', endpoint: 'https://api.mistral.ai/v1/chat/completions',
    keyPrefixes: ['mistral-'], keyHint: 'Starts with mistral-',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'mistral-large-latest', name: 'Mistral Large' }
    ]
  },
  deepseek: {
    name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions',
    keyPrefixes: ['dsk-'], keyHint: 'Starts with dsk-',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1' }
    ]
  },
  cloudflare: {
    name: 'Cloudflare Workers AI', endpoint: '',
    keyPrefixes: ['cf-'], keyHint: 'Starts with cf-',
    models: []
  },
  ollama: {
    name: 'Ollama (local)', endpoint: 'http://localhost:11434/v1/chat/completions',
    keyPrefixes: [], keyHint: 'No key needed for local Ollama',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'mistral', name: 'Mistral 7B' },
      { id: 'gemma2', name: 'Gemma 2' }
    ]
  }
};

const MODE_DESCS = {
  off: 'AI answer system is disabled.',
  hover: 'Hover over any question to see the AI answer. Correct choice gets highlighted.',
  rightclick: 'Right-click on any question to auto-fill the AI answer. Selects correct choice or auto-types into text inputs.',
  keybind: 'Hover over a question, then press the keybind key to auto-type the AI answer character by character.'
};

const DEFAULTS = {
  answerSaver: true, privacyGuard: true, kioskSpoof: false, killswitch: true,
  aiMode: 'off', aiProvider: '', aiApiKey: '', aiModel: '', aiEndpoint: '',
  aiKeybind: 'y', aiAutoTypeSpeed: 50, blockedUrls: [], showInjectedUI: true
};

// ── State ─────────────────────────────────────────────────────────────────────

let settings = {};
let detectedProvider = '';

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(DEFAULTS, result => {
    settings = result;
    initUI();
    bindEvents();
  });
});

function initUI() {
  // Toggles
  el('toggleAnswerSaver').checked = settings.answerSaver;
  el('togglePrivacyGuard').checked = settings.privacyGuard;
  el('toggleKiosk').checked = settings.kioskSpoof;
  el('toggleKillswitch').checked = settings.killswitch;
  el('showInjectedUICheckbox').checked = settings.showInjectedUI;
  updateBadges();

  // AI settings
  el('aiApiKeyInput').value = settings.aiApiKey;
  el('customModelInput').value = settings.aiModel;
  el('keybindInput').value = settings.aiKeybind;
  el('currentKeybind').textContent = settings.aiKeybind.toUpperCase();
  el('typeSpeedRange').value = settings.aiAutoTypeSpeed;
  el('speedValue').textContent = settings.aiAutoTypeSpeed;

  if (settings.aiProvider) el('providerSelect').value = settings.aiProvider;
  detectProvider(settings.aiApiKey);
  updateModelDropdown();
  setMode(settings.aiMode);
  toggleAiSections();

  // Blocked URLs
  renderUrls();

  // Killswitch visibility
  updateKillswitchVisibility();
}

function el(id) { return document.getElementById(id); }

function updateBadges() {
  setBadge('badge-as', settings.answerSaver);
  setBadge('badge-pg', settings.privacyGuard);
  el('badge-ks').textContent = settings.kioskSpoof ? 'Active' : 'Standby';
  el('badge-ks').className = 'fc-badge ' + (settings.kioskSpoof ? 'active' : 'standby');
  el('badge-ksw').textContent = settings.killswitch ? 'Armed' : 'Off';
  el('badge-ksw').className = 'fc-badge ' + (settings.killswitch ? 'active' : '');
}

function setBadge(id, on) {
  const b = el(id);
  b.textContent = on ? 'Active' : 'Off';
  b.className = 'fc-badge ' + (on ? 'active' : '');
}

function updateKillswitchVisibility() {
  el('feat-killswitch').style.display = settings.privacyGuard ? '' : 'none';
}

// ── Event bindings ────────────────────────────────────────────────────────────

function bindEvents() {
  // Navigation
  el('settings_icon').onclick = () => showPage('p2');
  el('updates_icon').onclick = () => showPage('p4');
  el('feat-ai').onclick = () => showPage('p3');
  el('settings_back').onclick = () => showPage('p1');
  el('ai_back').onclick = () => showPage('p1');
  el('updates_back').onclick = () => showPage('p1');

  // Feature toggles
  el('toggleAnswerSaver').onchange = function() { save('answerSaver', this.checked); updateBadges(); };
  el('togglePrivacyGuard').onchange = function() {
    save('privacyGuard', this.checked);
    updateBadges();
    updateKillswitchVisibility();
  };
  el('toggleKiosk').onchange = function() { save('kioskSpoof', this.checked); updateBadges(); };
  el('toggleKillswitch').onchange = function() { save('killswitch', this.checked); updateBadges(); };

  // AI provider / key / model
  el('providerSelect').onchange = onProviderChange;
  el('aiApiKeyInput').oninput = onKeyInput;
  el('modelSelect').onchange = onModelChange;
  el('toggleApiKeyVisibility').onclick = () => {
    const inp = el('aiApiKeyInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  // Mode
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = () => setMode(btn.dataset.mode);
  });

  // Keybind
  el('keybindInput').onkeydown = (e) => {
    e.preventDefault();
    const k = e.key.length === 1 ? e.key : e.code.replace('Key','');
    el('keybindInput').value = k;
    el('currentKeybind').textContent = k.toUpperCase();
    save('aiKeybind', k);
  };

  // Speed
  el('typeSpeedRange').oninput = function() {
    el('speedValue').textContent = this.value;
    save('aiAutoTypeSpeed', parseInt(this.value));
  };

  // Test API
  el('testApiBtn').onclick = testAPI;

  // Save AI
  el('saveAiBtn').onclick = saveAISettings;

  // Test extension
  el('testExtensionBtn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('test-page.html') });
  };

  // URL blocker
  el('saveUrls').onclick = saveUrls;
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function showPage(id) {
  ['p1','p2','p3','p4'].forEach(p => el(p).style.display = p === id ? 'flex' : 'none');
}

// ── Provider / Model logic ────────────────────────────────────────────────────

function detectProvider(key) {
  if (!key) { detectedProvider = ''; el('detectedProvider').className = 'detected-provider'; return; }
  for (const [id, prov] of Object.entries(PROVIDERS)) {
    if (prov.keyPrefixes.some(p => key.startsWith(p))) {
      detectedProvider = id;
      el('detectedProvider').textContent = 'Detected: ' + prov.name;
      el('detectedProvider').className = 'detected-provider show';
      return;
    }
  }
  detectedProvider = '';
  el('detectedProvider').textContent = 'Unknown provider';
  el('detectedProvider').className = 'detected-provider show';
}

function getProviderId() {
  const sel = el('providerSelect').value;
  if (sel) return sel;
  return detectedProvider;
}

function onProviderChange() {
  const pid = el('providerSelect').value || detectedProvider;
  if (pid && PROVIDERS[pid]) el('keyHint').textContent = PROVIDERS[pid].keyHint;
  toggleAiSections();
  updateModelDropdown();
}

function onKeyInput() {
  const key = el('aiApiKeyInput').value.trim();
  detectProvider(key);
  if (!el('providerSelect').value && detectedProvider) updateModelDropdown();
}

function updateModelDropdown() {
  const pid = getProviderId();
  const select = el('modelSelect');
  select.innerHTML = '<option value="">— Select a model —</option>';

  if (pid && PROVIDERS[pid]) {
    PROVIDERS[pid].models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (m.id === settings.aiModel) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // Always allow custom
  const custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Custom model...';
  select.appendChild(custom);

  toggleAiSections();
}

function onModelChange() {
  const v = el('modelSelect').value;
  if (v === '__custom__') {
    el('modelSelectRow').style.display = 'none';
    el('customModelInput').style.display = '';
    el('customModelInput').focus();
  } else {
    el('modelSelectRow').style.display = '';
    el('customModelInput').style.display = 'none';
  }
}

function getSelectedModel() {
  const v = el('modelSelect').value;
  return v === '__custom__' ? el('customModelInput').value.trim() : v;
}

function toggleAiSections() {
  const pid = getProviderId();
  el('customEndpointSection').style.display = (pid === 'custom') ? '' : 'none';

  const mode = el('modelSelect').value;
  if (mode === '__custom__') {
    el('modelSelectRow').style.display = 'none';
    el('customModelInput').style.display = '';
  } else {
    el('modelSelectRow').style.display = '';
    el('customModelInput').style.display = 'none';
  }
}

// ── Mode ──────────────────────────────────────────────────────────────────────

function setMode(mode) {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  el('modeDesc').textContent = MODE_DESCS[mode] || '';
  el('keybindSection').style.display = mode === 'keybind' ? '' : 'none';
  el('speedSection').style.display = (mode === 'keybind' || mode === 'rightclick') ? '' : 'none';
}

// ── Test API ──────────────────────────────────────────────────────────────────

function testAPI() {
  const key = el('aiApiKeyInput').value.trim();
  const pid = getProviderId();
  const model = getSelectedModel();
  const result = el('apiTestResult');

  if (!key && pid !== 'ollama') { result.textContent = 'Enter an API key first.'; result.style.color = '#f44'; return; }
  if (!model) { result.textContent = 'Select a model first.'; result.style.color = '#f44'; return; }

  let endpoint = pid && PROVIDERS[pid]?.endpoint ? PROVIDERS[pid].endpoint : settings.aiEndpoint;
  if (pid === 'custom') endpoint = el('aiEndpointInput').value.trim();
  if (!endpoint) { result.textContent = 'No endpoint configured.'; result.style.color = '#f44'; return; }

  result.textContent = 'Testing...';
  result.style.color = '#888';

  chrome.runtime.sendMessage({ action: 'testAPI', key, model, endpoint }, res => {
    if (res?.ok) {
      result.textContent = 'Connected! Reply: ' + res.reply;
      result.style.color = '#00cf11';
    } else {
      result.textContent = 'Failed: ' + (res?.error || 'Unknown error');
      result.style.color = '#f44';
    }
  });
}

// ── Save ──────────────────────────────────────────────────────────────────────

function saveAISettings() {
  const pid = getProviderId();
  const key = el('aiApiKeyInput').value.trim();
  const model = getSelectedModel();
  let endpoint = pid && PROVIDERS[pid]?.endpoint ? PROVIDERS[pid].endpoint : settings.aiEndpoint;
  if (pid === 'custom') endpoint = el('aiEndpointInput').value.trim();

  const activeMode = document.querySelector('.mode-btn.active')?.dataset.mode || 'off';

  chrome.storage.local.set({
    aiProvider: pid, aiApiKey: key, aiModel: model, aiEndpoint: endpoint, aiMode: activeMode
  }, () => {
    const result = el('apiTestResult');
    result.textContent = 'AI settings saved!';
    result.style.color = '#00cf11';
    setTimeout(() => { result.textContent = ''; }, 2000);
  });
}

function save(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// ── URL blocker ───────────────────────────────────────────────────────────────

function renderUrls() {
  const c = el('urlContainer');
  c.innerHTML = '';
  settings.blockedUrls.forEach((url, i) => {
    const span = document.createElement('span');
    span.className = 'url-item';
    span.innerHTML = url + ' <span class="remove-url" data-i="' + i + '">&times;</span>';
    c.appendChild(span);
  });
  c.querySelectorAll('.remove-url').forEach(r => {
    r.onclick = function() {
      settings.blockedUrls.splice(parseInt(this.dataset.i), 1);
      save('blockedUrls', settings.blockedUrls);
      renderUrls();
    };
  });
}

function saveUrls() {
  const raw = el('urlInput').value;
  const urls = raw.split(',').map(u => u.trim()).filter(Boolean);
  settings.blockedUrls = [...new Set([...settings.blockedUrls, ...urls])];
  save('blockedUrls', settings.blockedUrls);
  el('urlInput').value = '';
  renderUrls();
}
