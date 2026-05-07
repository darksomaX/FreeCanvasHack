// ai-answers.js — AI-powered answer system for Canvas quiz questions.
// Supports: hover hint mode, right-click answer mode, keybind auto-type mode.
// All API calls go to the user's configured LLM endpoint. No remote servers from us.

(function () {
  'use strict';

  let config = {
    apiKey: '',
    apiEndpoint: '',
    model: '',
    mode: 'off',         // 'off' | 'hover' | 'rightclick' | 'keybind'
    typeKeybind: 'y',     // key to auto-type answer
    autoTypeSpeed: 50     // ms between characters for auto-type
  };

  let activeTooltip = null;

  // ── Load settings ─────────────────────────────────────────────────────────

  function loadConfig() {
    return new Promise(resolve => {
      chrome.storage.local.get({
        aiApiKey: '',
        aiApiEndpoint: '',
        aiModel: '',
        aiMode: 'off',
        aiTypeKeybind: 'y',
        aiAutoTypeSpeed: 50
      }, result => {
        config.apiKey = result.aiApiKey;
        config.apiEndpoint = result.aiApiEndpoint;
        config.model = result.aiModel;
        config.mode = result.aiMode;
        config.typeKeybind = result.aiTypeKeybind;
        config.autoTypeSpeed = result.aiAutoTypeSpeed;
        resolve();
      });
    });
  }

  loadConfig();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') loadConfig();
  });

  // ── Question extraction ───────────────────────────────────────────────────

  function getQuestionElement(target) {
    return target.closest('.question');
  }

  function extractQuestionText(questionEl) {
    const textEl = questionEl.querySelector('.question_text, .text');
    if (!textEl) return '';
    return textEl.innerText.trim();
  }

  function extractAnswerChoices(questionEl) {
    const choices = [];
    const answers = questionEl.querySelectorAll('.answer');
    answers.forEach(a => {
      const label = a.querySelector('.answer_text, .answer_label');
      const input = a.querySelector('input[type="radio"], input[type="checkbox"]');
      if (label) {
        choices.push({
          text: label.innerText.trim(),
          value: input?.value || ''
        });
      }
    });
    return choices;
  }

  function getTargetInput(questionEl) {
    // For typed answers: find the first empty text/number input or textarea
    const inputs = questionEl.querySelectorAll(
      'input[type="text"], input[type="number"], textarea, input:not([type])'
    );
    for (const input of inputs) {
      if (!input.dataset.userModified && !input.value.trim()) return input;
    }
    // Return first input even if it has a value
    return inputs[0] || null;
  }

  // ── LLM API call ─────────────────────────────────────────────────────────
  // Sends the question to whatever endpoint the user configured.
  // Works with any OpenAI-compatible API (OpenAI, OpenRouter, Groq, etc.)

  async function askAI(questionText, choices) {
    if (!config.apiEndpoint) return null;

    let prompt = `Answer this quiz question. Give ONLY the answer, nothing else.\n\nQuestion: ${questionText}`;
    if (choices.length > 0) {
      prompt += '\n\nOptions:\n' + choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c.text}`).join('\n');
      prompt += '\n\nGive ONLY the letter of the correct answer.';
    }

    try {
      // Build headers for the request
      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }
      // OpenRouter requires extra headers for routing/analytics
      if (config.apiEndpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://canvashack.dev';
        headers['X-Title'] = 'CanvasHack';
      }

      const res = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant. Answer quiz questions accurately. Give ONLY the answer, no explanation.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 150,
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[CH AI] API error:', errText);
        return { answer: `API Error: ${res.status}`, raw: errText };
      }

      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content?.trim()
        || data.output?.trim()
        || JSON.stringify(data);
      return { answer, raw: data };
    } catch (err) {
      console.error('[CH AI] Fetch error:', err);
      return { answer: `Error: ${err.message}`, raw: err };
    }
  }

  // ── Tooltip UI ────────────────────────────────────────────────────────────

  function showTooltip(questionEl, text, type = 'info') {
    removeTooltip();
    const tooltip = document.createElement('div');
    tooltip.id = 'ch-ai-tooltip';
    tooltip.className = `ch-ai-tooltip ch-ai-tooltip-${type}`;
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    const rect = questionEl.getBoundingClientRect();
    tooltip.style.top = `${rect.top + window.scrollY - 40}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    activeTooltip = tooltip;
  }

  function showTooltipHTML(questionEl, html, type = 'info') {
    removeTooltip();
    const tooltip = document.createElement('div');
    tooltip.id = 'ch-ai-tooltip';
    tooltip.className = `ch-ai-tooltip ch-ai-tooltip-${type}`;
    tooltip.innerHTML = html;
    document.body.appendChild(tooltip);

    const rect = questionEl.getBoundingClientRect();
    tooltip.style.top = `${rect.top + window.scrollY - 40}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    activeTooltip = tooltip;
  }

  function removeTooltip() {
    const el = document.getElementById('ch-ai-tooltip');
    if (el) el.remove();
    activeTooltip = null;
  }

  // ── Hover mode: show answer hint on hover ─────────────────────────────────

  let hoverCache = new Map();

  async function handleHover(e) {
    if (config.mode !== 'hover') return;
    const questionEl = getQuestionElement(e.target);
    if (!questionEl) return;

    const qid = questionEl.id || questionEl.querySelector('[id]')?.id;
    if (hoverCache.has(qid)) {
      showTooltip(questionEl, hoverCache.get(qid), 'answer');
      return;
    }

    const questionText = extractQuestionText(questionEl);
    if (!questionText) return;

    showTooltip(questionEl, '🤔 Thinking...', 'loading');

    const choices = extractAnswerChoices(questionEl);
    const result = await askAI(questionText, choices);
    if (!result) {
      showTooltip(questionEl, '⚠️ AI not configured', 'error');
      return;
    }
    hoverCache.set(qid, result.answer);
    showTooltip(questionEl, result.answer, 'answer');
  }

  function handleHoverOut(e) {
    if (config.mode !== 'hover') return;
    const questionEl = getQuestionElement(e.target);
    if (!questionEl) return;
    removeTooltip();
  }

  // ── Right-click mode: get answer on right-click over a question ───────────

  async function handleRightClick(e) {
    if (config.mode !== 'rightclick') return;
    const questionEl = getQuestionElement(e.target);
    if (!questionEl) return;

    e.preventDefault();
    e.stopPropagation();

    const questionText = extractQuestionText(questionEl);
    if (!questionText) return;

    showTooltip(questionEl, '🤔 Thinking...', 'loading');

    const choices = extractAnswerChoices(questionEl);
    const result = await askAI(questionText, choices);
    if (!result) {
      showTooltip(questionEl, '⚠️ AI not configured. Go to extension popup → AI Settings.', 'error');
      return;
    }

    // For typed questions, also show answer in a floating draggable box near cursor
    const answerBox = document.createElement('div');
    answerBox.className = 'ch-ai-answer-box';
    answerBox.innerHTML = `
      <div class="ch-ai-answer-box-header">
        <span>CanvasHack AI Answer</span>
        <button class="ch-ai-answer-close">&times;</button>
      </div>
      <div class="ch-ai-answer-box-body">${result.answer}</div>
      <button class="ch-ai-answer-copy">Copy to clipboard</button>
    `;
    answerBox.style.top = `${e.pageY + 10}px`;
    answerBox.style.left = `${e.pageX + 10}px`;
    document.body.appendChild(answerBox);

    // Make draggable
    let isDragging = false, startX, startY, origX, origY;
    const header = answerBox.querySelector('.ch-ai-answer-box-header');
    header.addEventListener('mousedown', (de) => {
      isDragging = true;
      startX = de.clientX;
      startY = de.clientY;
      origX = answerBox.offsetLeft;
      origY = answerBox.offsetTop;
      de.preventDefault();
    });
    document.addEventListener('mousemove', (me) => {
      if (!isDragging) return;
      answerBox.style.left = `${origX + me.clientX - startX}px`;
      answerBox.style.top = `${origY + me.clientY - startY}px`;
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    // Close
    answerBox.querySelector('.ch-ai-answer-close').addEventListener('click', () => answerBox.remove());

    // Copy
    answerBox.querySelector('.ch-ai-answer-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(result.answer).then(() => {
        answerBox.querySelector('.ch-ai-answer-copy').textContent = 'Copied!';
      });
    });
  }

  // ── Keybind mode: press key to auto-type AI answer ────────────────────────

  let lastHoveredQuestion = null;

  function trackHoveredQuestion(e) {
    const questionEl = getQuestionElement(e.target);
    if (questionEl) lastHoveredQuestion = questionEl;
  }

  async function handleKeybind(e) {
    if (config.mode !== 'keybind') return;
    if (e.key.toLowerCase() !== config.typeKeybind.toLowerCase()) return;
    if (!lastHoveredQuestion) return;
    // Don't trigger if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    e.preventDefault();
    e.stopPropagation();

    const questionEl = lastHoveredQuestion;
    const questionText = extractQuestionText(questionEl);
    if (!questionText) return;

    const targetInput = getTargetInput(questionEl);
    if (!targetInput) {
      showTooltip(questionEl, '⚠️ No input field found', 'error');
      return;
    }

    showTooltip(questionEl, '🤔 Thinking...', 'loading');

    const choices = extractAnswerChoices(questionEl);
    const result = await askAI(questionText, choices);
    if (!result) {
      showTooltip(questionEl, '⚠️ AI not configured', 'error');
      return;
    }

    // For multiple choice, try to select the right answer
    if (choices.length > 0) {
      const answerLetter = result.answer.trim().toUpperCase().charAt(0);
      const idx = answerLetter.charCodeAt(0) - 65;
      if (idx >= 0 && idx < choices.length) {
        const answerEls = questionEl.querySelectorAll('.answer');
        if (answerEls[idx]) {
          const input = answerEls[idx].querySelector('input[type="radio"], input[type="checkbox"]');
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            showTooltip(questionEl, `✅ Selected: ${answerLetter}`, 'answer');
            return;
          }
        }
      }
    }

    // For text inputs: auto-type the answer character by character
    targetInput.value = '';
    targetInput.focus();
    const answer = result.answer;
    let i = 0;

    function typeNext() {
      if (i < answer.length) {
        targetInput.value += answer[i];
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        i++;
        setTimeout(typeNext, config.autoTypeSpeed);
      } else {
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        showTooltip(questionEl, '✅ Answer typed', 'answer');
        setTimeout(removeTooltip, 1500);
      }
    }
    typeNext();
  }

  // ── Hover highlight mode: slightly grey the correct answer on hover ───────

  async function handleHoverHighlight(e) {
    if (config.mode !== 'hover') return;
    trackHoveredQuestion(e);

    const questionEl = getQuestionElement(e.target);
    if (!questionEl) return;

    const questionText = extractQuestionText(questionEl);
    if (!questionText) return;

    const choices = extractAnswerChoices(questionEl);
    if (choices.length === 0) {
      // Text question — just show tooltip
      handleHover(e);
      return;
    }

    const qid = questionEl.id || questionEl.querySelector('[id]')?.id;
    if (!hoverCache.has(qid)) {
      showTooltip(questionEl, '🤔 Thinking...', 'loading');
      const result = await askAI(questionText, choices);
      if (!result) {
        showTooltip(questionEl, '⚠️ AI not configured', 'error');
        return;
      }
      hoverCache.set(qid, result.answer);
      removeTooltip();
    }

    const answer = hoverCache.get(qid);
    const answerLetter = answer.trim().toUpperCase().charAt(0);
    const idx = answerLetter.charCodeAt(0) - 65;

    // Highlight the correct choice
    const answerEls = questionEl.querySelectorAll('.answer');
    if (idx >= 0 && idx < answerEls.length) {
      answerEls[idx].style.transition = 'background-color 0.3s ease';
      answerEls[idx].style.backgroundColor = 'rgba(0, 190, 16, 0.12)';
    }

    showTooltip(questionEl, answer, 'answer');
  }

  function handleHoverOutCleanup(e) {
    if (config.mode !== 'hover') return;
    const questionEl = getQuestionElement(e.target);
    if (!questionEl) return;

    // Remove highlights
    questionEl.querySelectorAll('.answer').forEach(a => {
      a.style.backgroundColor = '';
    });
    removeTooltip();
  }

  // ── Inject CSS ────────────────────────────────────────────────────────────

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .ch-ai-tooltip {
        position: absolute;
        z-index: 9999999999;
        padding: 8px 14px;
        border-radius: 8px;
        font-family: Inter, -apple-system, sans-serif;
        font-size: 13px;
        color: #fff;
        max-width: 500px;
        word-wrap: break-word;
        pointer-events: none;
        animation: chFadeIn 0.2s ease;
      }
      .ch-ai-tooltip-loading { background: #1a1a2e; border: 1px solid #333; }
      .ch-ai-tooltip-answer { background: #0d3320; border: 1px solid #00be10; }
      .ch-ai-tooltip-error { background: #3d0d0d; border: 1px solid #ff4444; }
      .ch-ai-tooltip-info { background: #1a1a2e; border: 1px solid #444; }

      .ch-ai-answer-box {
        position: absolute;
        z-index: 9999999999;
        background: #181818;
        border: 1px solid #00be10;
        border-radius: 10px;
        min-width: 200px;
        max-width: 400px;
        font-family: Inter, -apple-system, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: chFadeIn 0.2s ease;
      }
      .ch-ai-answer-box-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #202020;
        border-radius: 10px 10px 0 0;
        cursor: move;
        border-bottom: 1px solid #333;
        color: #aaa;
        font-size: 12px;
        user-select: none;
      }
      .ch-ai-answer-close {
        background: none;
        border: none;
        color: #888;
        font-size: 18px;
        cursor: pointer;
      }
      .ch-ai-answer-close:hover { color: #fff; }
      .ch-ai-answer-box-body {
        padding: 12px;
        color: #e0e0e0;
        font-size: 14px;
        line-height: 1.5;
      }
      .ch-ai-answer-copy {
        display: block;
        width: calc(100% - 24px);
        margin: 0 12px 12px;
        padding: 6px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 6px;
        color: #ccc;
        font-size: 12px;
        cursor: pointer;
        text-align: center;
      }
      .ch-ai-answer-copy:hover { background: #333; color: #fff; }

      @keyframes chFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Event registration ────────────────────────────────────────────────────

  function init() {
    injectStyles();

    // Hover mode
    document.addEventListener('mouseover', handleHoverHighlight);
    document.addEventListener('mouseout', handleHoverOutCleanup);

    // Right-click mode
    document.addEventListener('contextmenu', handleRightClick, true);

    // Keybind mode — track which question is hovered
    document.addEventListener('mouseover', trackHoveredQuestion);

    // Keybind press
    document.addEventListener('keydown', handleKeybind, true);

    console.log('[CanvasHack] AI Answer system loaded. Mode:', config.mode);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
