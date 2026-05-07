// test-page.js — External script for test-page.html (avoids CSP inline-script blocks).
// Contains: monitoring system, quiz interaction, grading, attempt history.

// ═══════════════════════════════════════════════════════════════════════════
// MONITORING SYSTEM — simulates what Canvas would detect and report.
//
// inject.js patches addEventListener at document_start in the MAIN world.
// Since this script runs AFTER inject.js, our event listeners for blocked
// types (blur, focus, visibilitychange, mouseleave) will be silently
// swallowed by the patched addEventListener — which is exactly what we want.
//
// Detection strategy:
// 1. EVENT LISTENER TEST — register listeners for blocked event types.
//    If they fire, the guard is NOT working (LEAKED).
//    If they never fire, the guard IS working (BLOCKED — expected).
//
// 2. PROPERTY OVERRIDE CHECK — periodically verify that inject.js has
//    overridden document.hidden, document.visibilityState, and
//    Document.prototype.hasFocus. If the overrides are in place, the guard
//    is active. If they revert to native behavior, the guard is bypassed.
//
// 3. PASTE DETECTION — monitor paste events on text inputs. The guard
//    does NOT block paste events (they're not in the blocked list), so
//    pastes should still be detectable.
// ═══════════════════════════════════════════════════════════════════════════

const eventLog = document.getElementById('eventLog');
const statBlocked = document.getElementById('statBlocked');
const statLeaked = document.getElementById('statLeaked');
const statTabs = document.getElementById('statTabs');
const statBlurs = document.getElementById('statBlurs');
const monitorStatus = document.getElementById('monitorStatus');

let blocked = 0, leaked = 0, tabSwitches = 0, windowBlurs = 0;

function getTime() {
    return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addLog(type, icon, message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    entry.innerHTML = `<span class="log-icon">${icon}</span><span class="log-time">${getTime()}</span><span class="log-msg">${message}</span>`;
    eventLog.prepend(entry);
    while (eventLog.children.length > 100) eventLog.lastChild.remove();

    if (type === 'blocked') { blocked++; statBlocked.textContent = blocked; }
    if (type === 'leaked')  { leaked++;  statLeaked.textContent = leaked; }
    if (message.toLowerCase().includes('tab switch') || message.toLowerCase().includes('tab hidden')) {
        tabSwitches++; statTabs.textContent = tabSwitches;
    }
    if (message.toLowerCase().includes('blur') || message.toLowerCase().includes('blurred') || message.toLowerCase().includes('lost focus')) {
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

document.getElementById('clearLog')?.addEventListener('click', () => {
    eventLog.innerHTML = '';
    blocked = leaked = tabSwitches = windowBlurs = 0;
    statBlocked.textContent = statLeaked.textContent = statTabs.textContent = statBlurs.textContent = '0';
    monitorStatus.textContent = 'SECURE';
    monitorStatus.className = 'monitor-status secure';
});

// ═══════════════════════════════════════════════════════════════════════════
// METHOD 1: DIRECT EVENT LISTENERS — these SHOULD be blocked by inject.js.
// If they fire, the guard is NOT working.
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('visibilitychange', function () {
    addLog('leaked', '\uD83D\uDD34', 'visibilitychange event LEAKED through! inject.js is NOT blocking events!');
});

window.addEventListener('blur', function () {
    addLog('leaked', '\uD83D\uDD34', 'blur event LEAKED through! inject.js is NOT blocking events!');
});

window.addEventListener('focus', function () {
    addLog('leaked', '\uD83D\uDFE1', 'focus event LEAKED through! inject.js is NOT blocking events!');
});

document.addEventListener('mouseleave', function () {
    addLog('leaked', '\uD83D\uDD34', 'mouseleave LEAKED \u2014 student moved mouse away from page.');
});

// ═══════════════════════════════════════════════════════════════════════════
// METHOD 2: PROPERTY OVERRIDE VERIFICATION — polls every 2 seconds to
// verify inject.js's overrides are still in place.
// ═══════════════════════════════════════════════════════════════════════════

let lastGuardCheck = true;

setInterval(function () {
    const guardActive = document.documentElement.dataset.chGuard === 'active';
    const hiddenOk = document.hidden === false;
    const visOk = document.visibilityState === 'visible';
    const focusOk = Document.prototype.hasFocus() === true;

    const allOk = guardActive && hiddenOk && visOk && focusOk;

    if (allOk && !lastGuardCheck) {
        addLog('blocked', '\uD83D\uDEE1\uFE0F', 'Privacy Guard restored. All overrides active.');
    } else if (!allOk && lastGuardCheck) {
        if (!guardActive) {
            addLog('leaked', '\uD83D\uDD34', 'Guard marker lost! document.documentElement.dataset.chGuard is not "active".');
        }
        if (!hiddenOk) {
            addLog('leaked', '\uD83D\uDD34', 'document.hidden override lost! Canvas can detect tab visibility.');
        }
        if (!visOk) {
            addLog('leaked', '\uD83D\uDD34', 'document.visibilityState override lost! Canvas sees "' + document.visibilityState + '".');
        }
        if (!focusOk) {
            addLog('leaked', '\uD83D\uDD34', 'Document.hasFocus() override lost! Canvas can detect focus loss.');
        }
    }
    lastGuardCheck = allOk;
}, 2000);

// ═══════════════════════════════════════════════════════════════════════════
// METHOD 3: PASTE DETECTION — paste events ARE now blocked by inject.js.
// If this fires, it means the guard is not intercepting paste events.
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('paste', function (e) {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        addLog('leaked', '\uD83D\uDD34', 'PASTE detected on ' + target.tagName.toLowerCase() + ' field! Canvas can see pasted content.');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Key tracking (keyboard events are NOT in the blocked list)
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', function (e) {
    if (e.altKey && e.key === 'Tab') {
        addLog('leaked', '\uD83D\uDD34', 'Alt+Tab detected \u2014 student switched windows.');
    }
    if (e.ctrlKey && e.key === 'c') {
        addLog('info', '\uD83D\uDCCB', 'Copy (Ctrl+C) detected.');
    }
    if (e.ctrlKey && e.key === 'v') {
        addLog('info', '\uD83D\uDCCB', 'Paste (Ctrl+V) detected.');
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Start message
// ═══════════════════════════════════════════════════════════════════════════

const guardActive = document.documentElement.dataset.chGuard === 'active';
if (guardActive) {
    addLog('blocked', '\uD83D\uDEE1\uFE0F', 'CanvasHack Privacy Guard DETECTED on this page. Monitoring will show blocked vs leaked events.');
    addLog('blocked', '\uD83D\uDEE1\uFE0F', 'document.hidden = ' + document.hidden + ', visibilityState = "' + document.visibilityState + '", hasFocus = ' + Document.prototype.hasFocus());
} else {
    addLog('leaked', '\u26A0\uFE0F', 'CanvasHack Privacy Guard NOT detected! All events will leak to Canvas. Fix: 1) Go to chrome://extensions \u2192 CanvasHack \u2192 Details \u2192 Enable "Allow access to file URLs" 2) Reload extension 3) Reload this page');
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ INTERACTION \u2014 Click answers, submit, get graded, save/load attempts
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'canvashack_test_attempts';

function getAttempts() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}

function saveAttempt(attempt) {
    const attempts = getAttempts();
    attempts.push(attempt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
}

function autofillFromPreviousAttempts() {
    const attempts = getAttempts();
    if (attempts.length === 0) return;

    const bestAnswers = {};
    for (const attempt of attempts) {
        for (const [qId, answer] of Object.entries(attempt.answers)) {
            if (!bestAnswers[qId] || answer.correct) {
                bestAnswers[qId] = answer;
            }
        }
    }

    document.querySelectorAll('.question').forEach(q => {
        const qId = q.id.replace('question_', '');
        const best = bestAnswers[qId];
        if (!best) return;

        const qType = q.querySelector('.question_type').textContent;

        if (qType === 'multiple_choice_question' || qType === 'true_false_question') {
            const radio = q.querySelector('input[value="' + best.value + '"]');
            if (radio && best.correct) {
                radio.checked = true;
                radio.closest('.answer').classList.add('selected');
            }
        } else if (qType === 'multiple_answers_question') {
            if (best.values && best.correct) {
                best.values.forEach(v => {
                    const cb = q.querySelector('input[value="' + v + '"]');
                    if (cb) { cb.checked = true; cb.closest('.answer').classList.add('selected'); }
                });
            }
        } else if (qType === 'short_answer_question' || qType === 'numerical_question') {
            if (best.value && best.correct) {
                const input = q.querySelector('input[type="text"], input[type="number"]');
                if (input) input.value = best.value;
            }
        }
    });

    addLog('info', '\uD83D\uDCDD', 'Loaded ' + attempts.length + ' previous attempt(s). Best answers pre-filled.');
}

// Answer clicking
document.querySelectorAll('.answer').forEach(answer => {
    answer.addEventListener('click', function () {
        const input = this.querySelector('input');
        if (!input) return;

        if (input.type === 'radio') {
            const name = input.name;
            document.querySelectorAll('input[name="' + name + '"]').forEach(r => {
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
document.getElementById('submitBtn')?.addEventListener('click', function () {
    const questions = document.querySelectorAll('.question');
    let totalPoints = 0, earnedPoints = 0;
    let allAnswered = true;
    const submissionAnswers = {};

    questions.forEach(q => {
        const qId = q.id.replace('question_', '');
        const correctAnswer = q.dataset.answer;
        const qType = q.querySelector('.question_type').textContent;
        const pointsText = q.querySelector('.question_points_holder').textContent;
        const points = parseInt(pointsText);
        totalPoints += points;

        let isCorrect = false;

        if (qType === 'multiple_choice_question' || qType === 'true_false_question') {
            const selected = q.querySelector('input:checked');
            if (!selected) { allAnswered = false; return; }
            isCorrect = selected.value === correctAnswer;
            submissionAnswers[qId] = { value: selected.value, correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'multiple_answers_question') {
            const checked = q.querySelectorAll('input[type="checkbox"]:checked');
            if (checked.length === 0) { allAnswered = false; return; }
            const selected = Array.from(checked).map(c => c.value).sort().join(',');
            isCorrect = selected === correctAnswer.split(',').sort().join(',');
            submissionAnswers[qId] = { values: Array.from(checked).map(c => c.value), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'short_answer_question') {
            const input = q.querySelector('input[type="text"]');
            if (!input || !input.value.trim()) { allAnswered = false; return; }
            const correct = correctAnswer.toLowerCase().trim();
            const user = input.value.toLowerCase().trim();
            isCorrect = user === correct || user.includes(correct);
            submissionAnswers[qId] = { value: input.value.trim(), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'numerical_question') {
            const input = q.querySelector('input[type="number"]');
            if (!input || !input.value.trim()) { allAnswered = false; return; }
            isCorrect = parseFloat(input.value) === parseFloat(correctAnswer);
            submissionAnswers[qId] = { value: input.value.trim(), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        } else if (qType === 'essay_question') {
            const textarea = q.querySelector('textarea');
            if (!textarea || !textarea.value.trim()) { allAnswered = false; return; }
            isCorrect = textarea.value.trim().length > 10;
            submissionAnswers[qId] = { value: textarea.value.trim(), correct: isCorrect, points: isCorrect ? points : 0, type: qType };
        }

        const gradeEl = document.getElementById('grade_' + qId);
        const pointHolder = q.querySelector('.question_points_holder');

        if (isCorrect) {
            earnedPoints += points;
            q.classList.add('correct');
            gradeEl.textContent = 'Correct! +' + points + ' pts';
            gradeEl.className = 'grade-display show correct';
            pointHolder.classList.add('correct-answer');
        } else {
            q.classList.add('incorrect');
            gradeEl.textContent = 'Incorrect. 0/' + points + ' pts';
            gradeEl.className = 'grade-display show incorrect';
            pointHolder.classList.add('incorrect-answer');

            if (correctAnswer) {
                q.querySelectorAll('.answer').forEach(a => {
                    if (a.dataset.value === correctAnswer || correctAnswer.split(',').includes(a.dataset.value)) {
                        a.classList.add('correct-answer');
                    } else if (a.classList.contains('selected')) {
                        a.classList.add('show-incorrect');
                    }
                });
            }
        }
    });

    if (!allAnswered) {
        alert('Please answer all questions before submitting.');
        return;
    }

    const attempt = {
        timestamp: new Date().toISOString(),
        score: earnedPoints,
        total: totalPoints,
        answers: submissionAnswers
    };
    saveAttempt(attempt);

    const banner = document.getElementById('scoreBanner');
    const pct = Math.round((earnedPoints / totalPoints) * 100);
    const letterGrade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    const attemptNum = getAttempts().length;

    banner.innerHTML = 'Attempt ' + attemptNum + ' \u2014 Score: ' + earnedPoints + '/' + totalPoints + ' (' + pct + '%) \u2014 Grade: ' + letterGrade +
        '<br><button id="retakeBtn" style="margin-top:8px;padding:8px 20px;background:#007fff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;">Retake Quiz</button>' +
        '<span style="font-size:12px;color:#888;margin-left:12px;">Previous answers will be pre-filled from your best attempt</span>';
    banner.className = 'score-banner show ' + (pct >= 60 ? 'pass' : 'fail');
    banner.scrollIntoView({ behavior: 'smooth' });

    // Attach retake handler (no inline onclick needed)
    document.getElementById('retakeBtn')?.addEventListener('click', retakeQuiz);

    this.disabled = true;
    this.textContent = 'Submitted';

    addLog('info', '\uD83D\uDCDD', 'Attempt ' + attemptNum + ' submitted. Score: ' + earnedPoints + '/' + totalPoints + ' (' + pct + '%)');

    if (leaked > 0) {
        addLog('leaked', '\u26A0\uFE0F', 'FLAG: Student had ' + leaked + ' suspicious events. Reported to instructor.');
    }
});

// Retake
function retakeQuiz() {
    document.querySelectorAll('.question').forEach(q => {
        q.classList.remove('correct', 'incorrect');
        q.querySelectorAll('input').forEach(i => { i.checked = false; });
        q.querySelectorAll('.answer').forEach(a => {
            a.classList.remove('selected', 'correct-answer', 'show-incorrect');
        });
        q.querySelectorAll('.grade-display').forEach(g => {
            g.className = 'grade-display';
            g.textContent = '';
        });
        q.querySelectorAll('.question_points_holder').forEach(p => {
            p.classList.remove('correct-answer', 'incorrect-answer');
        });
        const textInput = q.querySelector('input[type="text"], input[type="number"]');
        if (textInput) textInput.value = '';
        const textarea = q.querySelector('textarea');
        if (textarea) textarea.value = '';
    });

    const banner = document.getElementById('scoreBanner');
    banner.className = 'score-banner';
    banner.innerHTML = '';

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Quiz';

    autofillFromPreviousAttempts();
}

window.retakeQuiz = retakeQuiz;

// Export / Import
window.exportAnswers = function () {
    const attempts = getAttempts();
    if (attempts.length === 0) { alert('No attempts to export.'); return; }
    const blob = new Blob([JSON.stringify(attempts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canvashack-answers.json';
    a.click();
    URL.revokeObjectURL(url);
    addLog('info', '\uD83D\uDCE4', 'Exported ' + attempts.length + ' attempt(s) to canvashack-answers.json');
};

window.importAnswers = function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function () {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) throw new Error('Invalid format');
                const existing = getAttempts();
                const merged = [...existing, ...imported];
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                addLog('info', '\uD83D\uDCE5', 'Imported ' + imported.length + ' attempt(s). Total: ' + merged.length);
                autofillFromPreviousAttempts();
            } catch (err) {
                alert('Invalid file: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

autofillFromPreviousAttempts();
