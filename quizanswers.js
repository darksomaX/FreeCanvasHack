// quizanswers.js — Fetches previous quiz submissions from Canvas API, auto-fills best answers.

loadQuiz();

function cleanRes(res) { return res.substring(9); }

function getPointElements() {
  return Array.from(document.getElementsByClassName('question_points_holder'))
    .filter(h => h.parentElement.classList.contains('header'));
}

function getQuestionIDs() {
  return Array.from(document.getElementsByClassName('original_question_text'))
    .map(el => el.nextElementSibling.id.split('_')[1]);
}

const QTypes = {
  MC: 'multiple_choice_question',
  TF: 'true_false_question',
  FIB: 'short_answer_question',
  FIBM: 'fill_in_multiple_blanks_question',
  MA: 'multiple_answers_question',
  MD: 'multiple_dropdowns_question',
  MATCH: 'matching_question',
  NUM: 'numerical_question',
  FORMULA: 'calculated_question',
  ESSAY: 'essay_question'
};

async function getQuizSubmissions(courseID, quizID, baseURL) {
  const quizURL = `${baseURL}api/v1/courses/${courseID}/quizzes/${quizID}/`;
  const [resQuiz, resSubs] = await Promise.all([
    fetch(quizURL).then(r => r.json()),
    fetch(quizURL + 'submissions').then(r => r.json())
  ]);

  const assignmentID = resQuiz.assignment_id;
  const userID = resSubs.quiz_submissions[resSubs.quiz_submissions.length - 1].user_id;
  if (!assignmentID || !userID) throw new Error('Missing assignment/user ID');

  const history = await fetch(`${baseURL}api/v1/courses/${courseID}/assignments/${assignmentID}/submissions/${userID}?include[]=submission_history`);
  return (await history.json()).submission_history;
}

function getCorrectAnswers(submissions) {
  const parsed = {};
  for (const raw of submissions) {
    const sub = restructure(raw);
    if (!sub) continue;
    for (const [id, q] of Object.entries(sub)) {
      if (!parsed[id]) parsed[id] = { attemptedAnswers: [], bestAttempt: q, latestAttempt: q };
      if (parsed[id].bestAttempt.correct) continue;
      if (q.correct) parsed[id].bestAttempt = q;
      else if (parsed[id].bestAttempt.points < q.points) parsed[id].bestAttempt = q;
      else parsed[id].attemptedAnswers.push(q);
    }
  }
  return parsed;
}

function restructure(sub) {
  if (!sub?.submission_data) return null;
  const out = {};
  for (const q of sub.submission_data) out[q.question_id] = q;
  return out;
}

function display(answers) {
  const questions = document.getElementsByClassName('question');
  const types = document.getElementsByClassName('question_type');
  const points = getPointElements();
  const ids = getQuestionIDs();
  const d = new Displayer();
  const filled = {};

  for (let i = 0; i < questions.length; i++) {
    const type = types[i].innerText;
    const id = ids[i];
    if (!answers[id]) continue;

    const answer = answers[id].bestAttempt;
    answer.attemptedAnswers = answers[id].attemptedAnswers.filter(a => a.text);
    const el = questions[i];
    const ph = points[i];
    const origText = ph.innerText;
    filled[id] = false;

    el.addEventListener('mouseenter', () => {
      if (!filled[id]) { d.display(type, answer, id); filled[id] = true; }
      const earned = Math.round(answer.points * 100) / 100;
      ph.classList.add(earned === parseFloat(origText) ? 'correct-answer' : 'incorrect-answer');
      ph.innerText = `${earned} out of ${origText}`;
    });
    el.addEventListener('mouseleave', () => {
      ph.innerText = origText;
      ph.classList.remove('correct-answer', 'incorrect-answer');
    });
  }
}

class Displayer {
  display(type, answer, id) {
    const map = {
      [QTypes.ESSAY]: () => this.essay(answer, id),
      [QTypes.MATCH]: () => this.matching(answer, id),
      [QTypes.MA]: () => this.multiAnswer(answer, id),
      [QTypes.MC]: () => this.multiChoice(answer, id),
      [QTypes.TF]: () => this.multiChoice(answer, id),
      [QTypes.FIB]: () => this.fillBlank(answer, id),
      [QTypes.NUM]: () => this.fillBlank(answer, id),
      [QTypes.FORMULA]: () => this.fillBlank(answer, id),
      [QTypes.FIBM]: () => this.fillMultiBlank(answer, id),
    };
    map[type]?.();
  }

  matching(answer, id) {
    if (!answer) return;
    for (const prop in answer) {
      if (!prop.includes('answer_')) continue;
      const el = document.getElementById(`question_${id}_${prop}`);
      if (el && !el.dataset.userModified) {
        el.value = answer[prop];
        el.dataset.autoFilled = true;
        el.addEventListener('input', () => { el.dataset.userModified = true; });
      }
    }
  }

  multiAnswer(answer, id) {
    if (!answer) return;
    for (const prop in answer) {
      if (!prop.includes('answer_')) continue;
      const el = document.getElementById(`question_${id}_${prop}`);
      if (el && !el.dataset.userModified) {
        el.checked = parseInt(answer[prop]);
        el.dataset.autoFilled = true;
        el.addEventListener('change', () => { el.dataset.userModified = true; });
      }
    }
  }

  multiChoice(answer, id) {
    if (!answer) return;
    if (answer.attemptedAnswers?.length) {
      for (const aid of answer.attemptedAnswers) {
        const el = document.getElementById(`question_${id}_answer_${aid}`);
        if (el?.parentElement?.nextElementSibling) {
          el.parentElement.nextElementSibling.className += ' incorrect-answer';
        }
      }
    }
    if (!('answer_id' in answer)) return;
    const el = document.getElementById(`question_${id}_answer_${answer.answer_id}`);
    if (!el || el.dataset.userModified) return;
    if (!el.parentElement?.nextElementSibling?.className?.includes('incorrect-answer')) {
      el.checked = true;
      el.dataset.autoFilled = true;
      el.addEventListener('change', () => { el.dataset.userModified = true; });
    }
  }

  fillBlank(answer, id) {
    if (!answer) return;
    for (const el of document.getElementsByName(`question_${id}`)) {
      if (el.tagName === 'INPUT' && !el.dataset.userModified) {
        el.value = answer.text;
        el.dataset.autoFilled = true;
        el.addEventListener('input', () => { el.dataset.userModified = true; });
        break;
      }
    }
  }

  essay(answer, id) {
    if (!answer) return;
    setTimeout(() => {
      try {
        const parent = document.getElementById(`question_${id}_question_text`)
          .nextElementSibling.firstElementChild.children[2]
          .firstElementChild.firstElementChild.children[1].firstElementChild;
        const editor = (parent.contentDocument || parent.contentWindow.document).getElementById('tinymce');
        if (editor && !editor.dataset.userModified) {
          editor.innerHTML = answer.text;
          editor.dataset.autoFilled = true;
          editor.addEventListener('input', () => { editor.dataset.userModified = true; });
        }
      } catch {
        document.getElementById(`question_${id}_question_text`).innerHTML += `<p>${answer.text}</p>`;
      }
    }, 500);
  }

  fillMultiBlank(answer, id) {
    if (!answer) return;
    const inputs = document.getElementById(`question_${id}_question_text`).querySelectorAll('input');
    const keys = Object.keys(answer).filter(k => k.includes('answer_for'));
    if (keys.length !== inputs.length) return;
    for (let i = 0; i < inputs.length; i++) {
      if (!inputs[i].dataset.userModified) {
        inputs[i].value = answer[keys[i]];
        inputs[i].dataset.autoFilled = true;
        inputs[i].addEventListener('input', () => { inputs[i].dataset.userModified = true; });
      }
    }
  }
}

async function loadQuiz() {
  const url = location.href;
  const courseID = url.split('courses/')[1]?.split('/')[0];
  const quizID = url.split('quizzes/')[1]?.split('/')[0];
  const base = url.split('/').slice(0, 3).join('/') + '/';

  if (!courseID || !parseInt(courseID)) { console.error('[CH] No course ID'); return; }
  if (!quizID || !parseInt(quizID)) { console.error('[CH] No quiz ID'); return; }

  const subs = await getQuizSubmissions(courseID, quizID, base);
  const answers = getCorrectAnswers(subs);
  if (answers) display(answers);
}
