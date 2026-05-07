// quizanswers.js — Auto-fills answers from previous quiz attempts via Canvas API.
// Calls only your school's Canvas instance (local). No remote servers.

loadQuiz();

function cleanRes(res) {
  return res.substring(9);
}

function getPointElements() {
  const holders = document.getElementsByClassName('question_points_holder');
  const clean = [];
  for (const holder of holders) {
    const classList = holder.parentElement.classList;
    for (let i = 0; i < classList.length; i++) {
      if (classList[i] === 'header') {
        clean.push(holder);
        break;
      }
    }
  }
  return clean;
}

function isIncorrectChoice(el) {
  return el.parentElement?.nextElementSibling?.className?.includes('incorrect-answer');
}

function getQuestionIDs() {
  const ids = [];
  const els = document.getElementsByClassName('original_question_text');
  for (const el of els) {
    ids.push(el.nextElementSibling.id.split('_')[1]);
  }
  return ids;
}

const QuestionTypes = {
  MULTIPLE_CHOICE: 'multiple_choice_question',
  TRUE_FALSE: 'true_false_question',
  FILL_IN_BLANK: 'short_answer_question',
  FILL_IN_M_BLANK: 'fill_in_multiple_blanks_question',
  MULTIPLE_ANSWER: 'multiple_answers_question',
  MULTIPLE_DROPDOWN: 'multiple_dropdowns_question',
  MATCHING: 'matching_question',
  NUMERICAL_ANSWER: 'numerical_question',
  FORMULA_QUESTION: 'calculated_question',
  ESSAY_QUESTION: 'essay_question'
};

async function getQuizSubmissions(courseID, quizID, baseURL) {
  const quizURL = `${baseURL}api/v1/courses/${courseID}/quizzes/${quizID}/`;
  const submissionsURL = quizURL + 'submissions';

  return Promise.all([fetch(quizURL), fetch(submissionsURL)])
    .then(([resQuiz, resSubmissions]) =>
      Promise.all([resQuiz.text(), resSubmissions.text()])
    )
    .then(([resQuiz, resSubmissions]) => [
      JSON.parse(resQuiz),
      JSON.parse(resSubmissions).quiz_submissions
    ])
    .then(([resQuiz, resSubmissions]) => {
      const assignmentID = resQuiz.assignment_id;
      const userID = resSubmissions[resSubmissions.length - 1].user_id;
      if (!assignmentID) throw new Error('Unable to retrieve assignmentID');
      if (!userID) throw new Error('Unable to retrieve userID');
      const historyURL = `${baseURL}api/v1/courses/${courseID}/assignments/${assignmentID}/submissions/${userID}?include[]=submission_history`;
      return fetch(historyURL);
    })
    .then(res => res.text().then(t => JSON.parse(t)))
    .then(res => res.submission_history);
}

function getCorrectAnswers(submissions) {
  let parsedSubmissions = {};
  let submission = restructureSubmission(submissions[0]);
  if (!submission) return null;

  for (let i = 0; i < submissions.length; i++) {
    submission = restructureSubmission(submissions[i]);
    for (const questionID in submission) {
      const question = submission[questionID];
      if (!(questionID in parsedSubmissions)) {
        parsedSubmissions[questionID] = {
          attemptedAnswers: [],
          bestAttempt: question,
          latestAttempt: question
        };
      }
      if (parsedSubmissions[questionID].bestAttempt.correct === true) continue;
      if (question.correct === true) {
        parsedSubmissions[questionID].bestAttempt = question;
      } else if (parsedSubmissions[questionID].bestAttempt.points < question.points) {
        parsedSubmissions[questionID].bestAttempt = question;
      } else {
        parsedSubmissions[questionID].attemptedAnswers.push(question);
      }
    }
  }
  return parsedSubmissions;
}

function restructureSubmission(submission) {
  if (!submission?.submission_data) return null;
  const out = {};
  for (const q of submission.submission_data) {
    out[q.question_id] = q;
  }
  return out;
}

function display(answers) {
  const questions = document.getElementsByClassName('question');
  const questionTypes = document.getElementsByClassName('question_type');
  const numQuestions = questions.length;
  const displayer = new Displayer();
  const pointHolders = getPointElements();
  const questionIDs = getQuestionIDs();
  const autoFilledQuestions = {};

  for (let i = 0; i < numQuestions; i++) {
    const questionType = questionTypes[i].innerText;
    const questionID = questionIDs[i];

    if (answers[questionID]) {
      const answer = answers[questionID].bestAttempt;
      answer.attemptedAnswers = [];
      for (const attempted of answers[questionID].attemptedAnswers) {
        if (attempted.text !== '') answer.attemptedAnswers.push(attempted.text);
      }

      const questionElement = questions[i];
      const pointHolder = pointHolders[i];
      const originalPointText = pointHolder.innerText;

      autoFilledQuestions[questionID] = false;

      questionElement.addEventListener('mouseenter', function () {
        if (!autoFilledQuestions[questionID]) {
          displayer.displayAnswer(questionType, answer, questionID);
          autoFilledQuestions[questionID] = true;
        }
        const earned = Math.round(answer.points * 100) / 100;
        if (earned === parseFloat(originalPointText)) {
          pointHolder.classList.add('correct-answer');
        } else {
          pointHolder.classList.add('incorrect-answer');
        }
        pointHolder.innerText = `${earned} out of ${originalPointText}`;
      });

      questionElement.addEventListener('mouseleave', function () {
        pointHolder.innerText = originalPointText;
        pointHolder.classList.remove('correct-answer', 'incorrect-answer');
      });
    } else {
      const pointHolder = pointHolders[i];
      const originalPointText = pointHolder.innerText;
      questions[i].addEventListener('mouseenter', function () {
        pointHolder.innerText = `(New Question) ${originalPointText}`;
      });
      questions[i].addEventListener('mouseleave', function () {
        pointHolder.innerText = originalPointText;
      });
    }
  }
}

class Displayer {
  displayAnswer(questionType, answer, questionID) {
    switch (questionType) {
      case QuestionTypes.ESSAY_QUESTION: this.displayEssay(answer, questionID); break;
      case QuestionTypes.MATCHING: this.displayMatching(answer, questionID); break;
      case QuestionTypes.MULTIPLE_ANSWER: this.displayMultipleAnswer(answer, questionID); break;
      case QuestionTypes.MULTIPLE_CHOICE:
      case QuestionTypes.TRUE_FALSE: this.displayMultipleChoice(answer, questionID); break;
      case QuestionTypes.FILL_IN_BLANK:
      case QuestionTypes.FORMULA_QUESTION:
      case QuestionTypes.NUMERICAL_ANSWER: this.displayFillInBlank(answer, questionID); break;
      case QuestionTypes.FILL_IN_M_BLANK: this.displayFillInMultipleBlank(answer, questionID); break;
    }
  }

  displayMatching(answer, questionID) {
    if (!answer) return;
    for (const prop in answer) {
      if (prop.includes('answer_')) {
        const el = document.getElementById(`question_${questionID}_${prop}`);
        if (el && !el.dataset.userModified) {
          el.value = answer[prop];
          el.dataset.autoFilled = true;
          el.addEventListener('input', () => { el.dataset.userModified = true; });
        }
      }
    }
  }

  displayMultipleAnswer(answer, questionID) {
    if (!answer) return;
    for (const prop in answer) {
      if (prop.includes('answer_')) {
        const el = document.getElementById(`question_${questionID}_${prop}`);
        if (el && !el.dataset.userModified) {
          el.checked = parseInt(answer[prop]);
          el.dataset.autoFilled = true;
          el.addEventListener('change', () => { el.dataset.userModified = true; });
        }
      }
    }
  }

  displayMultipleChoice(answer, questionID) {
    if (!answer) return;
    if (answer.attemptedAnswers?.length) {
      for (const id of answer.attemptedAnswers) {
        const el = document.getElementById(`question_${questionID}_answer_${id}`);
        if (el?.parentElement?.nextElementSibling) {
          el.parentElement.nextElementSibling.className += ' incorrect-answer';
        }
      }
    }
    if (!('answer_id' in answer)) return;
    const el = document.getElementById(`question_${questionID}_answer_${answer.answer_id}`);
    if (!el || el.dataset.userModified) return;
    if (!isIncorrectChoice(el)) {
      el.checked = true;
      el.dataset.autoFilled = true;
      el.addEventListener('change', () => { el.dataset.userModified = true; });
    }
  }

  displayFillInBlank(answer, questionID) {
    if (!answer) return;
    const elements = document.getElementsByName(`question_${questionID}`);
    for (const el of elements) {
      if (el.tagName === 'INPUT' && !el.dataset.userModified) {
        el.value = answer.text;
        el.dataset.autoFilled = true;
        el.addEventListener('input', () => { el.dataset.userModified = true; });
        break;
      }
    }
  }

  displayEssay(answer, questionID) {
    if (!answer) return;
    setTimeout(() => {
      try {
        const topParent = document.getElementById(`question_${questionID}_question_text`);
        const parent = topParent.nextElementSibling.firstElementChild.children[2]
          .firstElementChild.firstElementChild.children[1].firstElementChild;
        const iframe = parent.contentDocument || parent.contentWindow.document;
        const editor = iframe.getElementById('tinymce');
        if (editor && !editor.dataset.userModified) {
          editor.innerHTML = answer.text;
          editor.dataset.autoFilled = true;
          editor.addEventListener('input', () => { editor.dataset.userModified = true; });
        }
      } catch {
        document.getElementById(`question_${questionID}_question_text`).innerHTML += `<p>${answer.text}</p>`;
      }
    }, 500);
  }

  displayFillInMultipleBlank(answer, questionID) {
    if (!answer) return;
    const topParent = document.getElementById(`question_${questionID}_question_text`);
    const inputs = topParent.querySelectorAll('input');
    const answerKeys = Object.keys(answer).filter(k => k.includes('answer_for'));
    if (answerKeys.length !== inputs.length) return;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (!input.dataset.userModified) {
        input.value = answer[answerKeys[i]];
        input.dataset.autoFilled = true;
        input.addEventListener('input', () => { input.dataset.userModified = true; });
      }
    }
  }
}

async function loadQuiz() {
  const currentURL = window.location.href;
  const courseID = currentURL.split('courses/')[1]?.split('/')[0];
  const quizID = currentURL.split('quizzes/')[1]?.split('/')[0];
  const parts = currentURL.split('/');
  const baseURL = `${parts[0]}//${parts[2]}/`;

  if (!courseID || !parseInt(courseID)) {
    console.error('[CH] Unable to retrieve course id');
    return;
  }
  if (!quizID || !parseInt(quizID)) {
    console.error('[CH] Unable to retrieve quiz id');
    return;
  }

  const submissions = await getQuizSubmissions(courseID, quizID, baseURL);
  const correctAnswers = getCorrectAnswers(submissions);
  if (!correctAnswers) return;
  display(correctAnswers);
}
