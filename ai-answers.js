// ai-answers.js — MAIN world. Reads config from window.__chAIConfig (set by content.js).

(function() {
  'use strict';

  const cfg = window.__chAIConfig || {};
  const config = {
    apiKey: cfg.apiKey || '',
    endpoint: cfg.endpoint || '',
    model: cfg.model || '',
    mode: cfg.mode || 'off',
    keybind: cfg.keybind || 'y',
    autoTypeSpeed: cfg.autoTypeSpeed || 50
  };

  if (config.mode === 'off' || !config.apiKey) return;

  let activeTooltip = null;
  const hoverCache = new Map();
  let lastQuestion = null;

  // ── Question helpers ────────────────────────────────────────────────────────

  function getQuestion(el) { return el.closest('.question'); }

  function getQuestionText(el) {
    const t = el.querySelector('.question_text, .text');
    return t ? t.innerText.trim() : '';
  }

  function getChoices(el) {
    const out = [];
    el.querySelectorAll('.answer').forEach(a => {
      const label = a.querySelector('.answer_text, .answer_label');
      const input = a.querySelector('input[type="radio"], input[type="checkbox"]');
      if (label) out.push({ text: label.innerText.trim(), value: input?.value || '' });
    });
    return out;
  }

  function getInput(el) {
    const inputs = el.querySelectorAll('input[type="text"], input[type="number"], textarea, input:not([type])');
    for (const i of inputs) { if (!i.dataset.userModified && !i.value.trim()) return i; }
    return inputs[0] || null;
  }

  // ── LLM call ────────────────────────────────────────────────────────────────

  async function askAI(question, choices) {
    if (!config.endpoint) return null;

    let prompt = `Answer this quiz question. Give ONLY the answer.\n\nQuestion: ${question}`;
    if (choices.length) {
      prompt += '\n\nOptions:\n' + choices.map((c, i) => `${String.fromCharCode(65+i)}. ${c.text}`).join('\n');
      prompt += '\n\nGive ONLY the letter.';
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = 'Bearer ' + config.apiKey;
      if (config.endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = location.href;
        headers['X-Title'] = 'CanvasHack';
      }

      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: 'Answer quiz questions accurately. Give ONLY the answer, no explanation.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 150,
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const t = await res.text();
        console.error('[CH AI] API error:', t);
        return { answer: 'API Error: ' + res.status, raw: t };
      }

      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content?.trim()
        || data.output?.trim()
        || JSON.stringify(data);
      return { answer, raw: data };
    } catch(e) {
      console.error('[CH AI] Fetch error:', e);
      return { answer: 'Error: ' + e.message, raw: e };
    }
  }

  // ── Auto-fill answer into question ──────────────────────────────────────────

  function autoFill(questionEl, result, choices) {
    // Multiple choice / checkbox: select the correct one
    if (choices.length > 0) {
      const letter = result.answer.trim().toUpperCase().charAt(0);
      const idx = letter.charCodeAt(0) - 65;
      if (idx >= 0 && idx < choices.length) {
        const els = questionEl.querySelectorAll('.answer');
        if (els[idx]) {
          const input = els[idx].querySelector('input[type="radio"], input[type="checkbox"]');
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            els[idx].classList.add('selected');
            showTip(questionEl, '\u2705 Selected: ' + choices[idx].text, 'answer');
            setTimeout(removeTip, 2000);
            return;
          }
        }
      }
    }

    // Text/number input: auto-type
    const input = getInput(questionEl);
    if (input) {
      input.value = '';
      input.focus();
      let i = 0;
      const answer = result.answer;
      (function type() {
        if (i < answer.length) {
          input.value += answer[i++];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(type, config.autoTypeSpeed);
        } else {
          input.dispatchEvent(new Event('change', { bubbles: true }));
          showTip(questionEl, '\u2705 Answer typed', 'answer');
          setTimeout(removeTip, 1500);
        }
      })();
      return;
    }

    // Fallback: floating answer box
    showAnswerBox(result.answer);
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────────

  function showTip(questionEl, text, type) {
    removeTip();
    const t = document.createElement('div');
    t.id = 'ch-tip';
    t.className = 'ch-tip ch-tip-' + type;
    t.textContent = text;
    document.body.appendChild(t);
    const r = questionEl.getBoundingClientRect();
    t.style.top = (r.top + scrollY - 40) + 'px';
    t.style.left = (r.left + scrollX) + 'px';
    activeTooltip = t;
  }

  function removeTip() {
    document.getElementById('ch-tip')?.remove();
    activeTooltip = null;
  }

  function showAnswerBox(answer) {
    const box = document.createElement('div');
    box.className = 'ch-answer-box';
    box.innerHTML = '<div class="ch-ab-header"><span>AI Answer</span><button class="ch-ab-close">&times;</button></div><div class="ch-ab-body">' + answer + '</div><button class="ch-ab-copy">Copy</button>';
    document.body.appendChild(box);

    let drag = false, sx, sy, ox, oy;
    const h = box.querySelector('.ch-ab-header');
    h.addEventListener('mousedown', e => { drag=true; sx=e.clientX; sy=e.clientY; ox=box.offsetLeft; oy=box.offsetTop; e.preventDefault(); });
    document.addEventListener('mousemove', e => { if(!drag) return; box.style.left=(ox+e.clientX-sx)+'px'; box.style.top=(oy+e.clientY-sy)+'px'; });
    document.addEventListener('mouseup', () => { drag=false; });
    box.querySelector('.ch-ab-close').onclick = () => box.remove();
    box.querySelector('.ch-ab-copy').onclick = function() {
      navigator.clipboard.writeText(answer).then(() => { this.textContent = 'Copied!'; });
    };
  }

  // ── Event handlers ──────────────────────────────────────────────────────────

  function onHover(e) {
    const q = getQuestion(e.target);
    if (q) lastQuestion = q;
    if (config.mode !== 'hover') return;
    if (!q) return;

    const qid = q.id || q.querySelector('[id]')?.id;
    if (hoverCache.has(qid)) {
      highlightAnswer(q, hoverCache.get(qid));
      showTip(q, hoverCache.get(qid), 'answer');
      return;
    }

    const text = getQuestionText(q);
    if (!text) return;
    showTip(q, '\uD83E\uDD14 Thinking...', 'loading');

    const choices = getChoices(q);
    askAI(text, choices).then(result => {
      if (!result) { showTip(q, '\u26A0\uFE0F AI not configured', 'error'); return; }
      hoverCache.set(qid, result.answer);
      highlightAnswer(q, result.answer);
      showTip(q, result.answer, 'answer');
    });
  }

  function onHoverOut(e) {
    if (config.mode !== 'hover') return;
    const q = getQuestion(e.target);
    if (!q) return;
    q.querySelectorAll('.answer').forEach(a => { a.style.backgroundColor = ''; });
    removeTip();
  }

  function highlightAnswer(q, answer) {
    const letter = answer.trim().toUpperCase().charAt(0);
    const idx = letter.charCodeAt(0) - 65;
    const els = q.querySelectorAll('.answer');
    if (idx >= 0 && idx < els.length) {
      els[idx].style.transition = 'background-color 0.3s';
      els[idx].style.backgroundColor = 'rgba(0,190,16,0.12)';
    }
  }

  function onRightClick(e) {
    if (config.mode !== 'rightclick') return;
    const q = getQuestion(e.target);
    if (!q) return;
    e.preventDefault();
    e.stopPropagation();

    const text = getQuestionText(q);
    if (!text) return;
    showTip(q, '\uD83E\uDD14 Thinking...', 'loading');

    const choices = getChoices(q);
    askAI(text, choices).then(result => {
      if (!result) { showTip(q, '\u26A0\uFE0F AI not configured. Go to popup \u2192 AI Settings.', 'error'); return; }
      autoFill(q, result, choices);
    });
  }

  function onKey(e) {
    if (config.mode !== 'keybind') return;
    if (e.key.toLowerCase() !== config.keybind.toLowerCase()) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!lastQuestion) return;
    e.preventDefault();
    e.stopPropagation();

    const q = lastQuestion;
    const text = getQuestionText(q);
    if (!text) return;
    showTip(q, '\uD83E\uDD14 Thinking...', 'loading');

    const choices = getChoices(q);
    askAI(text, choices).then(result => {
      if (!result) { showTip(q, '\u26A0\uFE0F AI not configured', 'error'); return; }
      autoFill(q, result, choices);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    // Inject CSS
    const s = document.createElement('style');
    s.textContent = `
      .ch-tip{position:absolute;z-index:9999999999;padding:8px 14px;border-radius:8px;font:13px Inter,-apple-system,sans-serif;color:#fff;max-width:500px;word-wrap:break-word;pointer-events:none;animation:chFi .2s ease}
      .ch-tip-loading{background:#1a1a2e;border:1px solid #333}
      .ch-tip-answer{background:#0d3320;border:1px solid #00be10}
      .ch-tip-error{background:#3d0d0d;border:1px solid #f44}
      .ch-tip-info{background:#1a1a2e;border:1px solid #444}
      .ch-answer-box{position:absolute;z-index:9999999999;background:#181818;border:1px solid #00be10;border-radius:10px;min-width:200px;max-width:400px;font:13px Inter,-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);animation:chFi .2s ease}
      .ch-ab-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#202020;border-radius:10px 10px 0 0;cursor:move;border-bottom:1px solid #333;color:#aaa;font-size:12px;user-select:none}
      .ch-ab-close{background:none;border:none;color:#888;font-size:18px;cursor:pointer}
      .ch-ab-close:hover{color:#fff}
      .ch-ab-body{padding:12px;color:#e0e0e0;font-size:14px;line-height:1.5}
      .ch-ab-copy{display:block;width:calc(100% - 24px);margin:0 12px 12px;padding:6px;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#ccc;font-size:12px;cursor:pointer;text-align:center}
      .ch-ab-copy:hover{background:#333;color:#fff}
      @keyframes chFi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    `;
    document.head.appendChild(s);

    document.addEventListener('mouseover', onHover);
    document.addEventListener('mouseout', onHoverOut);
    document.addEventListener('contextmenu', onRightClick, true);
    document.addEventListener('keydown', onKey, true);

    console.log('[CanvasHack] AI mode:', config.mode);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
