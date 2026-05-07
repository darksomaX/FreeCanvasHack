// popup.js — CanvasHack extension popup UI controller.
// Handles page navigation, feature toggles, AI settings, URL blocking.
// All local — no remote connections.

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER & MODEL REGISTRY
// Each provider has: endpoint URL, key format hints, and known models.
// The system auto-detects the provider from the API key prefix.
// ═══════════════════════════════════════════════════════════════════════════════

const PROVIDERS = {
    openai: {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        keyPrefixes: ['sk-'],
        keyHint: 'Starts with sk-',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
        ]
    },
    google: {
        name: 'Google Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        keyPrefixes: ['AIza'],
        keyHint: 'Starts with AIza',
        models: [
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
        ]
    },
    groq: {
        name: 'Groq',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        keyPrefixes: ['gsk_'],
        keyHint: 'Starts with gsk_',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B' }
        ]
    },
    openrouter: {
        name: 'OpenRouter',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        keyPrefixes: ['sk-or-'],
        keyHint: 'Starts with sk-or-',
        models: [
            { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B Instruct (Free)' },
            { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct (Free)' },
            { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B (Free)' },
            { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (Free)' }
        ]
    },
    huggingface: {
        name: 'Hugging Face',
        endpoint: 'https://api-inference.huggingface.co/v1/chat/completions',
        keyPrefixes: ['hf_'],
        keyHint: 'Starts with hf_',
        models: [
            { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct v0.3' }
        ]
    },
    together: {
        name: 'Together AI',
        endpoint: 'https://api.together.xyz/v1/chat/completions',
        keyPrefixes: ['together_'],
        keyHint: 'Starts with together_',
        models: [
            { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo', name: 'Llama 3.2 11B Vision' }
        ]
    },
    cohere: {
        name: 'Cohere',
        endpoint: 'https://api.cohere.com/v2/chat',
        keyPrefixes: ['co-'],
        keyHint: 'Starts with co-',
        models: [
            { id: 'command-r-plus', name: 'Command R+' },
            { id: 'embed-english-v3.0', name: 'Cohere Embed English' }
        ]
    },
    mistral: {
        name: 'Mistral AI',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        keyPrefixes: ['mistral-'],
        keyHint: 'Starts with mistral-',
        models: [
            { id: 'mistral-large-latest', name: 'Mistral Large' },
            { id: 'codestral-latest', name: 'Codestral' }
        ]
    },
    deepseek: {
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        keyPrefixes: ['dsk-'],
        keyHint: 'Starts with dsk-',
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek V3' },
            { id: 'deepseek-coder', name: 'DeepSeek Coder' }
        ]
    },
    cloudflare: {
        name: 'Cloudflare Workers AI',
        endpoint: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions',
        keyPrefixes: ['cf-'],
        keyHint: 'Replace {ACCOUNT_ID} in endpoint with your Cloudflare account ID',
        models: [
            { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct' },
            { id: '@cf/mistral/mistral-7b-instruct-v0.1', name: 'Mistral 7B Instruct' }
        ]
    },
    ollama: {
        name: 'Ollama (local)',
        endpoint: 'http://localhost:11434/v1/chat/completions',
        keyPrefixes: [],
        keyHint: 'No key needed for local Ollama.',
        models: [
            { id: 'llama3.2', name: 'Llama 3.2' },
            { id: 'mistral', name: 'Mistral' },
            { id: 'phi3', name: 'Phi-3 Mini' }
        ]
    }
};

/**
 * Auto-detect provider from an API key string.
 * Checks the key prefix against all registered providers.
 */
function detectProviderFromKey(key) {
    if (!key) return null;
    const k = key.trim();
    for (const [id, provider] of Object.entries(PROVIDERS)) {
        for (const prefix of provider.keyPrefixes) {
            if (k.startsWith(prefix)) return id;
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POPUP LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // ── Page references ────────────────────────────────────────────────────

    const pageOne   = document.getElementById('p1');
    const pageTwo   = document.getElementById('p2');
    const pageThree = document.getElementById('p3');
    const pageFour  = document.getElementById('p4');
    const allPages  = [pageOne, pageTwo, pageThree, pageFour];

    function showOnlyPage(page) {
        allPages.forEach(p => { if (p) p.style.display = 'none'; });
        if (page) page.style.display = 'flex';
    }

    // ── Navigation ─────────────────────────────────────────────────────────

    document.getElementById('settings_icon')?.addEventListener('click', () => showOnlyPage(pageTwo));
    document.getElementById('settings_back')?.addEventListener('click', () => showOnlyPage(pageOne));
    document.getElementById('updates_icon')?.addEventListener('click', () => showOnlyPage(pageFour));
    document.getElementById('updates_back')?.addEventListener('click', () => showOnlyPage(pageOne));
    document.getElementById('feat-ai')?.addEventListener('click', () => showOnlyPage(pageThree));
    document.getElementById('ai_back')?.addEventListener('click', () => showOnlyPage(pageOne));

    // ── Feature Toggle: Answer Saver ───────────────────────────────────────

    const toggleAS = document.getElementById('toggleAnswerSaver');
    const badgeAS  = document.getElementById('badge-as');

    chrome.storage.local.get({ saveCorrectAnswers: true }, ({ saveCorrectAnswers }) => {
        toggleAS.checked = saveCorrectAnswers;
        updateBadge(badgeAS, saveCorrectAnswers, 'Active', 'Disabled');
    });

    toggleAS?.addEventListener('change', () => {
        const on = toggleAS.checked;
        chrome.storage.local.set({ saveCorrectAnswers: on, injectQuizAnswers: on });
        updateBadge(badgeAS, on, 'Active', 'Disabled');
    });

    // ── Feature Toggle: Privacy Guard ──────────────────────────────────────

    const togglePG = document.getElementById('togglePrivacyGuard');
    const badgePG  = document.getElementById('badge-pg');

    chrome.storage.local.get({ privacyGuardEnabled: true, enabled: true }, (prefs) => {
        const on = prefs.privacyGuardEnabled && prefs.enabled;
        togglePG.checked = on;
        updateBadge(badgePG, on, 'Active', 'Disabled');
    });

    togglePG?.addEventListener('change', () => {
        const on = togglePG.checked;
        chrome.storage.local.set({ privacyGuardEnabled: on, enabled: on });
        updateBadge(badgePG, on, 'Active', 'Disabled');
    });

    // ── Feature Toggle: Kiosk Spoof ────────────────────────────────────────

    const toggleKS = document.getElementById('toggleKiosk');
    const badgeKS  = document.getElementById('badge-ks');

    toggleKS?.addEventListener('change', () => {
        updateBadge(badgeKS, toggleKS.checked, 'Standby', 'Disabled');
    });

    // ── Badge helper ───────────────────────────────────────────────────────

    function updateBadge(el, isOn, activeText, offText) {
        if (!el) return;
        el.textContent = isOn ? activeText : offText;
        el.className = 'fc-badge ' + (isOn ? 'active' : '');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AI SETTINGS — Provider/Model/Key system
    // ═══════════════════════════════════════════════════════════════════════

    const providerSelect       = document.getElementById('providerSelect');
    const detectedProviderEl   = document.getElementById('detectedProvider');
    const aiApiKeyInput        = document.getElementById('aiApiKeyInput');
    const keyHintEl            = document.getElementById('keyHint');
    const modelSelect          = document.getElementById('modelSelect');
    const customModelInput     = document.getElementById('customModelInput');
    const customEndpointSection = document.getElementById('customEndpointSection');
    const aiEndpointInput      = document.getElementById('aiEndpointInput');
    const modeDesc             = document.getElementById('modeDesc');
    const keybindSection       = document.getElementById('keybindSection');
    const speedSection         = document.getElementById('speedSection');
    const keybindInput         = document.getElementById('keybindInput');
    const currentKeybindEl     = document.getElementById('currentKeybind');
    const speedRange           = document.getElementById('typeSpeedRange');
    const speedValue           = document.getElementById('speedValue');
    const testApiBtn           = document.getElementById('testApiBtn');
    const apiTestResult        = document.getElementById('apiTestResult');
    const saveAiBtn            = document.getElementById('saveAiBtn');
    const badgeAI              = document.getElementById('badge-ai');

    // Current resolved provider (from dropdown or auto-detect)
    let currentProvider = null;

    const MODE_DESCRIPTIONS = {
        off:        'AI answer system is disabled.',
        hover:      'When you hover over a question, the AI highlights the correct answer with a green tint and shows the answer in a tooltip.',
        rightclick: 'Right-click on any question to get the AI answer in a draggable floating box. Copy the answer to clipboard from there.',
        keybind:    'Hover over a question, then press your configured key (default: Y) to auto-type the AI answer character by character.'
    };

    // ── Populate model dropdown for a given provider ───────────────────────

    function populateModels(providerId) {
        const provider = PROVIDERS[providerId];
        modelSelect.innerHTML = '';

        if (!provider || providerId === 'custom') {
            // Show custom model text input, hide dropdown
            modelSelect.style.display = 'none';
            customModelInput.style.display = 'block';
            return;
        }

        modelSelect.style.display = 'block';
        customModelInput.style.display = 'none';

        // Add provider models
        provider.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            modelSelect.appendChild(opt);
        });

        // Add "Custom..." option at the end
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Custom model...';
        modelSelect.appendChild(customOpt);
    }

    // ── When model dropdown changes ────────────────────────────────────────

    modelSelect?.addEventListener('change', () => {
        if (modelSelect.value === '__custom__') {
            customModelInput.style.display = 'block';
            customModelInput.focus();
        } else {
            customModelInput.style.display = 'none';
            customModelInput.value = '';
        }
    });

    // ── Apply a provider selection ─────────────────────────────────────────

    function applyProvider(providerId) {
        currentProvider = providerId;
        const provider = PROVIDERS[providerId];

        // Show/hide custom endpoint section
        if (providerId === 'custom') {
            customEndpointSection.style.display = 'flex';
        } else if (providerId === 'ollama') {
            customEndpointSection.style.display = 'none';
            aiEndpointInput.value = provider.endpoint;
        } else if (provider) {
            customEndpointSection.style.display = 'none';
            aiEndpointInput.value = provider.endpoint;
        } else {
            // Auto-detect mode — don't touch endpoint
            customEndpointSection.style.display = 'none';
        }

        // Update key hint
        if (provider) {
            keyHintEl.textContent = provider.keyHint || 'Paste your key — the provider will be auto-detected from its format.';
        } else {
            keyHintEl.textContent = 'Paste your key — the provider will be auto-detected from its format.';
        }

        // Populate models
        populateModels(providerId);
    }

    // ── Provider dropdown change ───────────────────────────────────────────

    providerSelect?.addEventListener('change', () => {
        const val = providerSelect.value;
        detectedProviderEl.classList.remove('show');
        applyProvider(val || null);
    });

    // ── API Key input — auto-detect provider ───────────────────────────────

    aiApiKeyInput?.addEventListener('input', () => {
        const key = aiApiKeyInput.value.trim();
        const detected = detectProviderFromKey(key);

        if (detected && PROVIDERS[detected]) {
            detectedProviderEl.textContent = 'Detected: ' + PROVIDERS[detected].name;
            detectedProviderEl.classList.add('show');
            // Auto-select the provider if dropdown is on auto-detect
            if (!providerSelect.value) {
                applyProvider(detected);
            }
        } else {
            detectedProviderEl.classList.remove('show');
            if (!providerSelect.value) {
                // Reset to custom if key doesn't match any provider
                populateModels(null);
            }
        }
    });

    // ── Toggle API key visibility ──────────────────────────────────────────

    document.getElementById('toggleApiKeyVisibility')?.addEventListener('click', () => {
        aiApiKeyInput.type = aiApiKeyInput.type === 'password' ? 'text' : 'password';
    });

    // ── Load saved AI settings ─────────────────────────────────────────────

    function loadAISettings() {
        chrome.storage.local.get({
            aiApiKey: '',
            aiApiEndpoint: '',
            aiModel: '',
            aiMode: 'off',
            aiTypeKeybind: 'y',
            aiAutoTypeSpeed: 50
        }, (s) => {
            aiApiKeyInput.value   = s.aiApiKey;
            aiEndpointInput.value = s.aiApiEndpoint;
            currentKeybindEl.textContent = s.aiTypeKeybind;
            speedRange.value   = s.aiAutoTypeSpeed;
            speedValue.textContent = s.aiAutoTypeSpeed;
            setModeUI(s.aiMode);

            // Try to detect provider from saved key or endpoint
            const detected = detectProviderFromKey(s.aiApiKey);
            if (detected) {
                providerSelect.value = detected;
                applyProvider(detected);
                // Select the saved model in the dropdown
                selectSavedModel(s.aiModel);
            } else if (s.aiApiEndpoint) {
                // Try to match endpoint to a provider
                const matchedProvider = findProviderByEndpoint(s.aiApiEndpoint);
                if (matchedProvider) {
                    providerSelect.value = matchedProvider;
                    applyProvider(matchedProvider);
                    selectSavedModel(s.aiModel);
                } else {
                    providerSelect.value = 'custom';
                    applyProvider('custom');
                    customModelInput.value = s.aiModel;
                }
            } else {
                // No key, no endpoint — fresh state
                populateModels(null);
            }
        });
    }

    function selectSavedModel(modelId) {
        if (!modelId) return;
        // Try to find in dropdown
        const options = modelSelect.querySelectorAll('option');
        let found = false;
        for (const opt of options) {
            if (opt.value === modelId) {
                opt.selected = true;
                found = true;
                break;
            }
        }
        if (!found) {
            // Not in dropdown — show custom input with the value
            customModelInput.style.display = 'block';
            customModelInput.value = modelId;
        }
    }

    function findProviderByEndpoint(endpoint) {
        if (!endpoint) return null;
        for (const [id, provider] of Object.entries(PROVIDERS)) {
            if (endpoint === provider.endpoint) return id;
        }
        return null;
    }

    loadAISettings();

    // ── Answer Mode ────────────────────────────────────────────────────────

    function setModeUI(mode) {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        modeDesc.textContent = MODE_DESCRIPTIONS[mode] || '';

        keybindSection.style.display = (mode === 'keybind') ? 'flex' : 'none';
        speedSection.style.display   = (mode === 'keybind') ? 'flex' : 'none';

        if (badgeAI) {
            if (mode === 'off') {
                badgeAI.textContent = 'Tap to configure';
                badgeAI.className = 'fc-badge';
            } else {
                const label = mode.charAt(0).toUpperCase() + mode.slice(1);
                badgeAI.textContent = label + ' mode';
                badgeAI.className = 'fc-badge active';
            }
        }
    }

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setModeUI(btn.dataset.mode));
    });

    // ── Keybind input ──────────────────────────────────────────────────────

    keybindInput?.addEventListener('keydown', (e) => {
        e.preventDefault();
        if (e.key.length === 1) {
            currentKeybindEl.textContent = e.key;
            keybindInput.value = e.key;
        }
    });

    speedRange?.addEventListener('input', () => {
        speedValue.textContent = speedRange.value;
    });

    // ── Test API connection (proxied through background.js) ────────────────
    // Sends a minimal chat request to the configured endpoint. Background.js
    // proxies it to avoid CORS restrictions in the popup.

    testApiBtn?.addEventListener('click', () => {
        const endpoint = aiEndpointInput.value.trim();
        const key      = aiApiKeyInput.value.trim();
        const model    = getSelectedModel();

        if (!endpoint) {
            apiTestResult.textContent = 'Select a provider or enter an endpoint first.';
            apiTestResult.style.color = '#ff4444';
            return;
        }

        apiTestResult.textContent = 'Testing...';
        apiTestResult.style.color = '#888';

        // Build headers — all OpenAI-compatible endpoints use this format.
        // Some providers (OpenRouter) need extra headers.
        const headers = { 'Content-Type': 'application/json' };
        if (key) {
            headers['Authorization'] = `Bearer ${key}`;
        }
        // OpenRouter recommends sending these headers for identification
        if (endpoint.includes('openrouter.ai')) {
            headers['HTTP-Referer'] = 'https://canvashack.dev';
            headers['X-Title'] = 'CanvasHack';
        }

        // Determine which model to use for testing.
        // If the user selected a model from the dropdown, use that.
        // Otherwise use the provider's first model (not a hardcoded OpenAI model
        // which would 404 on OpenRouter/Groq/etc).
        let testModel = getSelectedModel();
        if (!testModel && currentProvider && PROVIDERS[currentProvider]?.models?.[0]) {
            testModel = PROVIDERS[currentProvider].models[0].id;
        }
        if (!testModel) {
            testModel = 'gpt-4o-mini'; // last resort fallback
        }

        chrome.runtime.sendMessage({
            action: 'testApiKey',
            url: endpoint,
            headers: headers,
            body: {
                model: testModel,
                messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
                max_tokens: 5
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                apiTestResult.textContent = 'Error: ' + chrome.runtime.lastError.message;
                apiTestResult.style.color = '#ff4444';
                return;
            }
            if (response?.ok) {
                apiTestResult.textContent = 'Connection successful!';
                apiTestResult.style.color = '#00cf11';
            } else {
                const err = response?.error || 'Unknown error';
                const status = response?.status ? ` (HTTP ${response.status})` : '';
                apiTestResult.textContent = 'Failed: ' + err + status;
                apiTestResult.style.color = '#ff4444';
            }
        });
    });

    // ── Save AI settings ───────────────────────────────────────────────────

    saveAiBtn?.addEventListener('click', () => {
        const activeMode = document.querySelector('.mode-btn.active');
        const mode = activeMode?.dataset.mode || 'off';

        chrome.storage.local.set({
            aiApiKey:        aiApiKeyInput.value.trim(),
            aiApiEndpoint:   aiEndpointInput.value.trim(),
            aiModel:         getSelectedModel(),
            aiMode:          mode,
            aiTypeKeybind:   currentKeybindEl.textContent || 'y',
            aiAutoTypeSpeed: parseInt(speedRange.value) || 50
        }, () => {
            saveAiBtn.textContent = '✓ Saved!';
            setTimeout(() => { saveAiBtn.textContent = 'Save AI Settings'; }, 1500);
        });
    });

    // ── Get the currently selected model ───────────────────────────────────

    function getSelectedModel() {
        if (modelSelect.value === '__custom__' || modelSelect.style.display === 'none') {
            return customModelInput.value.trim();
        }
        return modelSelect.value;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETTINGS PAGE — URL Blocker, UI Toggle
    // ═══════════════════════════════════════════════════════════════════════

    function loadUrls() {
        chrome.storage.local.get({ blockedUrls: [] }, ({ blockedUrls }) => {
            const container = document.getElementById('urlContainer');
            if (!container) return;
            container.innerHTML = '';
            blockedUrls.forEach((url, i) => {
                const span = document.createElement('span');
                span.className = 'url-item';
                span.innerHTML = `${url} <span class="remove-url" data-index="${i}">&times;</span>`;
                container.appendChild(span);
            });
            container.querySelectorAll('.remove-url').forEach(btn => {
                btn.addEventListener('click', function () {
                    blockedUrls.splice(parseInt(this.dataset.index), 1);
                    chrome.storage.local.set({ blockedUrls });
                    loadUrls();
                    chrome.runtime.sendMessage({ action: 'updateBlockedUrls' });
                });
            });
        });
    }
    loadUrls();

    document.getElementById('saveUrls')?.addEventListener('click', () => {
        const input = document.getElementById('urlInput');
        const raw = input.value.trim();
        if (!raw) return;
        const newUrls = raw.split(',').map(u => u.trim()).filter(Boolean);
        chrome.storage.local.get({ blockedUrls: [] }, ({ blockedUrls }) => {
            const merged = [...new Set([...blockedUrls, ...newUrls])];
            chrome.storage.local.set({ blockedUrls: merged }, () => {
                input.value = '';
                loadUrls();
                chrome.runtime.sendMessage({ action: 'updateBlockedUrls' });
            });
        });
    });

    const showUICheckbox = document.getElementById('showInjectedUICheckbox');
    chrome.storage.local.get({ showInjectedUI: true }, ({ showInjectedUI }) => {
        showUICheckbox.checked = showInjectedUI;
    });
    showUICheckbox?.addEventListener('change', () => {
        chrome.storage.local.set({ showInjectedUI: showUICheckbox.checked });
    });

    // ── Test Extension button ────────────────────────────────────────────────
    // Opens the test page in a new tab so the user can verify all features work.

    document.getElementById('testExtensionBtn')?.addEventListener('click', () => {
        const testUrl = chrome.runtime.getURL('test-page.html');
        chrome.tabs.create({ url: testUrl });
    });

    // ── Init ───────────────────────────────────────────────────────────────

    showOnlyPage(pageOne);
});
