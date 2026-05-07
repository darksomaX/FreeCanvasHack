// test-page.js — Monitoring system, quiz interaction, grading, auto-type test.

// ═══ MONITORING SYSTEM ════════════════════════════════════════════════════
// Simulates what Canvas would detect. Event listeners for blocked types
// will be silently swallowed by inject.js — proving the guard works.

var eventLog = document.getElementById('eventLog');
var statBlocked = document.getElementById('statBlocked');
var statLeaked = document.getElementById('statLeaked');
var statTabs = document.getElementById('statTabs');
var statBlurs = document.getElementById('statBlurs');
var monitorStatus = document.getElementById('monitorStatus');

var blocked = 0, leaked = 0, tabSwitches = 0, windowBlurs = 0;

function getTime() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addLog(type, icon, message) {
    var entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.innerHTML = '<span class="log-icon">' + icon + '</span><span class="log-time">' + getTime() + '</span><span class="log-msg">' + message + '</span>';
    eventLog.prepend(entry);
    while (eventLog.children.length > 100) eventLog.lastChild.remove();

    if (type === 'blocked') { blocked++; statBlocked.textContent = blocked; }
    if (type === 'leaked')  { leaked++;  statLeaked.textContent = leaked; }
    if (message.toLowerCase().indexOf('tab switch') !== -1 || message.toLowerCase().indexOf('tab hidden') !== -1) {
        tabSwitches++; statTabs.textContent = tabSwitches;
    }
    if (message.toLowerCase().indexOf('blur') !== -1 || message.toLowerCase().indexOf('lost focus') !== -1) {
        windowBlurs++; statBlurs.textContent = windowBlurs;
    }

    if (leaked > 0) {
        monitorStatus.textContent = 'EXPOSED';
        monitorStatus.className = 'monitor-status exposed';
    } else {
        monitorStatus.textContent = 'SECURE';
        monitorStatus.className = 'monitor-status secure';
    }
}

document.getElementById('clearLog').addEventListener('click', function() {
    eventLog.innerHTML = '';
    blocked = leaked = tabSwitches = windowBlurs = 0;
    statBlocked.textContent = statLeaked.textContent = statTabs.textContent = statBlurs.textContent = '0';
    monitorStatus.textContent = 'SECURE';
    monitorStatus.className = 'monitor-status secure';
});

// ═══ METHOD 1: EVENT LISTENERS ═══════════════════════════════════════════
// These SHOULD be blocked by inject.js. If they fire, guard is broken.

document.addEventListener('visibilitychange', function() {
    addLog('leaked', '\uD83D\uDD34', 'visibilitychange LEAKED! Guard NOT blocking events.');
});
window.addEventListener('blur', function() {
    addLog('leaked', '\uD83D\uDD34', 'blur LEAKED! Guard NOT blocking events.');
});
window.addEventListener('focus', function() {
    addLog('leaked', '\uD83D\uDFE1', 'focus LEAKED! Guard NOT blocking events.');
});
document.addEventListener('mouseleave', function() {
    addLog('leaked', '\uD83D\uDD34', 'mouseleave LEAKED — mouse left page.');
});
document.addEventListener('paste', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        addLog('leaked', '\uD83D\uDD34', 'PASTE detected on ' + e.target.tagName.toLowerCase() + '!');
    }
});

// ═══ METHOD 2: PROPERTY OVERRIDE CHECK ══════════════════════════════════

var lastGuardCheck = true;
setInterval(function() {
    var guardOn = document.documentElement.dataset.chGuard === 'active';
    var hiddenOk = document.hidden === false;
    var visOk = document.visibilityState === 'visible';
    var focusOk = true;
    try { focusOk = document.hasFocus(); } catch(e) {}

    var allOk = guardOn && hiddenOk && visOk && focusOk;
    if (allOk && !lastGuardCheck) {
        addLog('blocked', '\uD83D\uDEE1\uFE0F', 'Privacy Guard restored.');
    } else if (!allOk && lastGuardCheck) {
        if (!guardOn) addLog('leaked', '\uD83D\uDD34', 'Guard marker lost!');
        if (!hiddenOk) addLog('leaked', '\uD83D\uDD34', 'document.hidden override lost!');
        if (!visOk) addLog('leaked', '\uD83D\uDD34', 'visibilityState override lost! Sees: "' + document.visibilityState + '"');
        if (!focusOk) addLog('leaked', '\uD83D\uDD34', 'hasFocus() override lost!');
    }
    lastGuardCheck = allOk;
}, 2000);

// Keyboard tracking (not blocked by guard)
document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key === 'Tab') addLog('leaked', '\uD83D\uDD34', 'Alt+Tab detected.');
    if (e.ctrlKey && e.key === 'c') addLog('info', '\uD83D\uDCCB', 'Ctrl+C detected.');
    if (e.ctrlKey && e.key === 'v') addLog('info', '\uD83D\uDCCB', 'Ctrl+V detected.');
});

// ═══ STARTUP CHECK ═══════════════════════════════════════════════════════

var guardActive = document.documentElement.dataset.chGuard === 'active';
if (guardActive) {
    addLog('blocked', '\uD83D\uDEE1\uFE0F', 'Privacy Guard DETECTED. Events will show BLOCKED vs LEAKED.');
    var hf; try { hf = document.hasFocus(); } catch(e) { hf = 'N/A'; }
    addLog('blocked', '\uD83D\uDEE1\uFE0F', 'hidden=' + document.hidden + ', vis="' + document.visibilityState + '", focus=' + hf);
} else {
    addLog('leaked', '\u26A0\uFE0F', 'Guard NOT detected. Events will leak. Open via file:// with extension loaded.');
}

// ═══ QUIZ INTERACTION ═══════════════════════════════════════════════════

var STORAGE_KEY = 'canvashack_test_attempts';

function getAttempts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch(e) { return []; }
}

function saveAttempt(attempt) {
    var attempts = getAttempts();
    attempts.push(attempt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
}

function autofillFromPreviousAttempts() {
    var attempts = getAttempts();
    if (attempts.length === 0) return;

    var bestAnswers = {};
    for (var i = 0; i < attempts.length; i++) {
        var a = attempts[i];
        for (var qId in a.answers) {
            if (!bestAnswers[qId] || a.answers[qId].correct) bestAnswers[qId] = a.answers[qId];
        }
    }

    document.querySelectorAll('.question').forEach(function(q) {
        var id = q.id.replace('question_', '');
        var best = bestAnswers[id];
        if (!best || !best.correct) return;
        var qType = q.querySelector('.question_type').textContent;

        if (qType === 'multiple_choice_question' || qType === 'true_false_question') {
            var radio = q.querySelector('input[value="' + best.value + '"]');
            if (radio) { radio.checked = true; radio.closest('.answer').classList.add('selected'); }
        } else if (qType === 'multiple_answers_question' && best.values) {
            best.values.forEach(function(v) {
                var cb = q.querySelector('input[value="' + v + '"]');
                if (cb) { cb.checked = true; cb.closest('.answer').classList.add('selected'); }
            });
        } else if (qType === 'short_answer_question' || qType === 'numerical_question') {
            var inp = q.querySelector('input[type="text"], input[type="number"]');
            if (inp && best.value) inp.value = best.value;
        }
    });
    addLog('info', '\uD83D\uDCDD', 'Loaded ' + attempts.length + ' previous attempt(s).');
}

// Answer clicking
document.querySelectorAll('.answer').forEach(function(answer) {
    answer.addEventListener('click', function() {
        var input = this.querySelector('input');
        if (!input) return;
        if (input.type === 'radio') {
            document.querySelectorAll('input[name="' + input.name + '"]').forEach(function(r) {
                r.closest('.answer').classList.remove('selected');
            });
            input.checked = true;
            this.classList.add('selected');
        } else if (input.type === 'checkbox') {
            input.checked = !input.checked;
            this.classList.toggle('selected', input.checked);
        }
    });
});

// Submit quiz
document.getElementById('submitBtn').addEventListener('click', function() {
    var questions = document.querySelectorAll('.question');
    var totalPoints = 0, earnedPoints = 0;
    var allAnswered = true;
    var submissionAnswers = {};

    questions.forEach(function(q) {
        var qId = q.id.replace('question_', '');
        var correctAnswer = q.dataset.answer;
        var qType = q.querySelector('.question_type').textContent;
        var points = parseInt(q.querySelector('.question_points_holder').textContent);
        totalPoints += points;
        var isCorrect = false;

        if (qType === 'multiple_choice_question' || qType === 'true_false_question') {
            var sel = q.querySelector('input:checked');
            if (!sel) { allAnswered = false; return; }
            isCorrect = sel.value === correctAnswer;
            submissionAnswers[qId] = { value: sel.value, correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'multiple_answers_question') {
            var checked = q.querySelectorAll('input[type="checkbox"]:checked');
            if (checked.length === 0) { allAnswered = false; return; }
            var selVals = Array.from(checked).map(function(c) { return c.value; }).sort().join(',');
            isCorrect = selVals === correctAnswer.split(',').sort().join(',');
            submissionAnswers[qId] = { values: Array.from(checked).map(function(c) { return c.value; }), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'short_answer_question') {
            var inp = q.querySelector('input[type="text"]');
            if (!inp || !inp.value.trim()) { allAnswered = false; return; }
            isCorrect = inp.value.toLowerCase().trim().indexOf(correctAnswer.toLowerCase().trim()) !== -1;
            submissionAnswers[qId] = { value: inp.value.trim(), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'numerical_question') {
            var inp2 = q.querySelector('input[type="number"]');
            if (!inp2 || !inp2.value.trim()) { allAnswered = false; return; }
            isCorrect = parseFloat(inp2.value) === parseFloat(correctAnswer);
            submissionAnswers[qId] = { value: inp2.value.trim(), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'essay_question') {
            var ta = q.querySelector('textarea');
            if (!ta || !ta.value.trim()) { allAnswered = false; return; }
            isCorrect = ta.value.trim().length > 10;
            submissionAnswers[qId] = { value: ta.value.trim(), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        }

        var gradeEl = document.getElementById('grade_' + qId);
        var ph = q.querySelector('.question_points_holder');
        if (isCorrect) {
            earnedPoints += points;
            q.classList.add('correct');
            gradeEl.textContent = 'Correct! +' + points + ' pts';
            gradeEl.className = 'grade-display show correct';
            ph.classList.add('correct-answer');
        } else {
            q.classList.add('incorrect');
            gradeEl.textContent = 'Incorrect. 0/' + points + ' pts';
            gradeEl.className = 'grade-display show incorrect';
            ph.classList.add('incorrect-answer');
            if (correctAnswer) {
                q.querySelectorAll('.answer').forEach(function(a) {
                    if (a.dataset.value === correctAnswer || correctAnswer.split(',').indexOf(a.dataset.value) !== -1) a.classList.add('correct-answer');
                    else if (a.classList.contains('selected')) a.classList.add('show-incorrect');
                });
            }
        }
    });

    if (!allAnswered) { alert('Answer all questions first.'); return; }

    var attempt = { timestamp: new Date().toISOString(), score: earnedPoints, total: totalPoints, answers: submissionAnswers };
    saveAttempt(attempt);

    var banner = document.getElementById('scoreBanner');
    var pct = Math.round((earnedPoints / totalPoints) * 100);
    var letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    var num = getAttempts().length;
    banner.innerHTML = 'Attempt ' + num + ' \u2014 Score: ' + earnedPoints + '/' + totalPoints + ' (' + pct + '%) \u2014 Grade: ' + letter +
        '<br><button id="retakeBtn" style="margin-top:8px;padding:8px 20px;background:#007fff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;">Retake Quiz</button>';
    banner.className = 'score-banner show ' + (pct >= 60 ? 'pass' : 'fail');
    banner.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('retakeBtn').addEventListener('click', retakeQuiz);
    this.disabled = true;
    this.textContent = 'Submitted';
    addLog('info', '\uD83D\uDCDD', 'Attempt ' + num + ': ' + earnedPoints + '/' + totalPoints + ' (' + pct + '%)');
    if (leaked > 0) addLog('leaked', '\u26A0\uFE0F', 'FLAG: ' + leaked + ' suspicious events reported.');
});

function retakeQuiz() {
    document.querySelectorAll('.question').forEach(function(q) {
        q.classList.remove('correct', 'incorrect');
        q.querySelectorAll('input').forEach(function(i) { i.checked = false; });
        q.querySelectorAll('.answer').forEach(function(a) { a.classList.remove('selected', 'correct-answer', 'show-incorrect'); });
        q.querySelectorAll('.grade-display').forEach(function(g) { g.className = 'grade-display'; g.textContent = ''; });
        q.querySelectorAll('.question_points_holder').forEach(function(p) { p.classList.remove('correct-answer', 'incorrect-answer'); });
        var ti = q.querySelector('input[type="text"], input[type="number"]');
        if (ti) ti.value = '';
        var ta = q.querySelector('textarea');
        if (ta) ta.value = '';
    });
    document.getElementById('scoreBanner').className = 'score-banner';
    document.getElementById('scoreBanner').innerHTML = '';
    var btn = document.getElementById('submitBtn');
    btn.disabled = false;
    btn.textContent = 'Submit Quiz';
    autofillFromPreviousAttempts();
}

// Export / Import
window.exportAnswers = function() {
    var attempts = getAttempts();
    if (!attempts.length) { alert('No attempts.'); return; }
    var blob = new Blob([JSON.stringify(attempts, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'canvashack-answers.json'; a.click();
    URL.revokeObjectURL(url);
};

window.importAnswers = function() {
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = function() {
        var file = input.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error('Bad format');
                var existing = getAttempts();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.concat(imported)));
                addLog('info', '\uD83D\uDCE5', 'Imported ' + imported.length + ' attempt(s).');
                autofillFromPreviousAttempts();
            } catch(err) { alert('Invalid: ' + err.message); }
        };
        reader.readAsText(file);
    };
    input.click();
};

autofillFromPreviousAttempts();

// ═══ AUTO-TYPE TEST ═════════════════════════════════════════════════════
// Call from console: testAutoType() or testAPI()

window.testAutoType = function() {
    var q = document.getElementById('question_1003');
    if (!q) { alert('Q3 not found'); return; }
    var input = q.querySelector('input[type="text"]');
    if (!input) { alert('No input'); return; }
    input.value = '';
    input.focus();
    input.style.borderColor = '#ff9800';
    var answer = 'debugging';
    var i = 0;
    (function typeNext() {
        if (i < answer.length) {
            input.value += answer[i];
            input.dispatchEvent(new Event('input', { bubbles: true }));
            i++;
            setTimeout(typeNext, 50);
        } else {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.style.borderColor = '#27ae60';
            addLog('info', '\u2705', 'Auto-type test done! Typed "' + answer + '" into Q3.');
        }
    })();
};

window.testAPI = function() {
    var key = ''; // Paste your OpenRouter key here for testing
    addLog('info', '\uD83D\uDD0D', 'Testing API call...');
    fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'HTTP-Referer': location.href, 'X-Title': 'CanvasHack' },
        body: JSON.stringify({
            model: 'google/gemma-4-26b-a4b-it:free',
            messages: [
                { role: 'system', content: 'Give ONLY the answer letter.' },
                { role: 'user', content: 'Which uses LIFO?\nA. Queue\nB. Stack\nC. Linked List\nD. Binary Tree\n\nGive ONLY the letter.' }
            ],
            max_tokens: 10, temperature: 0.1
        })
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.error) addLog('leaked', '\u26A0\uFE0F', 'API error: ' + (data.error.message || JSON.stringify(data.error)).slice(0, 200));
        else if (data.choices && data.choices[0]) addLog('info', '\u2705', 'API replied: "' + data.choices[0].message.content.trim() + '" (model: ' + data.model + ')');
        else addLog('leaked', '\u26A0\uFE0F', 'Unexpected: ' + JSON.stringify(data).slice(0, 200));
    }).catch(function(err) { addLog('leaked', '\u26A0\uFE0F', 'Fetch error: ' + err.message); });
};
