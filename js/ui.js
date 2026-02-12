let currentScreen = null;

export function showScreen(screenId) {
  if (currentScreen) {
    currentScreen.classList.remove('screen-active');
    currentScreen.classList.add('screen-exit');
  }
  const next = document.getElementById(screenId);
  if (!next) return;

  // Remove exit class from all, then activate next
  setTimeout(() => {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('screen-active', 'screen-exit');
    });
    next.classList.add('screen-active');
    currentScreen = next;
  }, currentScreen ? 200 : 0);
}

export function renderThisOrThat(question, onSelect) {
  const container = document.getElementById('screen-this-or-that');
  container.querySelector('.round-question').textContent = question.question;

  const btnA = container.querySelector('.option-a');
  const btnB = container.querySelector('.option-b');

  btnA.querySelector('.option-emoji').textContent = question.optionA.emoji;
  btnA.querySelector('.option-text').textContent = question.optionA.text;
  btnB.querySelector('.option-emoji').textContent = question.optionB.emoji;
  btnB.querySelector('.option-text').textContent = question.optionB.text;

  // Reset state
  btnA.classList.remove('selected', 'disabled');
  btnB.classList.remove('selected', 'disabled');
  container.querySelector('.waiting-indicator').classList.add('hidden');

  const handler = (choice, btn, otherBtn) => {
    btn.classList.add('selected');
    otherBtn.classList.add('disabled');
    btn.removeEventListener('click', btn._handler);
    otherBtn.removeEventListener('click', otherBtn._handler);
    container.querySelector('.waiting-indicator').classList.remove('hidden');
    onSelect(choice);
  };

  btnA._handler = () => handler("A", btnA, btnB);
  btnB._handler = () => handler("B", btnB, btnA);
  btnA.addEventListener('click', btnA._handler);
  btnB.addEventListener('click', btnB._handler);
}

export function renderWouldYouRather(question, onSelect) {
  const container = document.getElementById('screen-would-you-rather');
  container.querySelector('.round-question').textContent = question.question;

  const btnA = container.querySelector('.option-a');
  const btnB = container.querySelector('.option-b');

  btnA.querySelector('.wyr-text').textContent = question.optionA.text;
  btnA.querySelector('.wyr-desc').textContent = question.optionA.description;
  btnB.querySelector('.wyr-text').textContent = question.optionB.text;
  btnB.querySelector('.wyr-desc').textContent = question.optionB.description;

  btnA.classList.remove('selected', 'disabled');
  btnB.classList.remove('selected', 'disabled');
  container.querySelector('.waiting-indicator').classList.add('hidden');

  const handler = (choice, btn, otherBtn) => {
    btn.classList.add('selected');
    otherBtn.classList.add('disabled');
    btn.removeEventListener('click', btn._handler);
    otherBtn.removeEventListener('click', otherBtn._handler);
    container.querySelector('.waiting-indicator').classList.remove('hidden');
    onSelect(choice);
  };

  btnA._handler = () => handler("A", btnA, btnB);
  btnB._handler = () => handler("B", btnB, btnA);
  btnA.addEventListener('click', btnA._handler);
  btnB.addEventListener('click', btnB._handler);
}

export function renderDeepQuestion(question, onSubmit) {
  const container = document.getElementById('screen-deep-question');
  container.querySelector('.round-question').textContent = question.question;

  const textarea = container.querySelector('.deep-textarea');
  const btn = container.querySelector('.deep-submit');
  textarea.value = '';
  btn.disabled = false;
  container.querySelector('.waiting-indicator').classList.add('hidden');

  // Remove old listener
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    const val = textarea.value.trim();
    if (!val) return;
    newBtn.disabled = true;
    textarea.disabled = true;
    container.querySelector('.waiting-indicator').classList.remove('hidden');
    onSubmit(val);
  });
}

export function renderGuessMyAnswer(question, isSubject, partnerName, onSubmit) {
  const container = document.getElementById('screen-guess-answer');

  if (isSubject) {
    container.querySelector('.guess-role').textContent = "This one's about you!";
    container.querySelector('.round-question').textContent =
      question.question.replace("their", "your").replace("they", "you").replace("them", "you");
  } else {
    container.querySelector('.guess-role').textContent = `How well do you know ${partnerName}?`;
    container.querySelector('.round-question').textContent = question.question;
  }

  const optionsContainer = container.querySelector('.guess-options');
  const freeTextContainer = container.querySelector('.guess-free-text');
  container.querySelector('.waiting-indicator').classList.add('hidden');

  optionsContainer.innerHTML = '';
  freeTextContainer.innerHTML = '';

  if (question.inputType === "choice") {
    freeTextContainer.classList.add('hidden');
    optionsContainer.classList.remove('hidden');

    question.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'guess-option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        optionsContainer.querySelectorAll('.guess-option-btn').forEach(b => {
          b.classList.add('disabled');
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
        container.querySelector('.waiting-indicator').classList.remove('hidden');
        onSubmit(opt);
      });
      optionsContainer.appendChild(btn);
    });
  } else {
    optionsContainer.classList.add('hidden');
    freeTextContainer.classList.remove('hidden');

    const textarea = document.createElement('textarea');
    textarea.className = 'deep-textarea';
    textarea.placeholder = isSubject ? 'Type your answer...' : `What do you think ${partnerName} would say?`;
    textarea.maxLength = 300;

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Lock in my answer';

    btn.addEventListener('click', () => {
      const val = textarea.value.trim();
      if (!val) return;
      btn.disabled = true;
      textarea.disabled = true;
      container.querySelector('.waiting-indicator').classList.remove('hidden');
      onSubmit(val);
    });

    freeTextContainer.appendChild(textarea);
    freeTextContainer.appendChild(btn);
  }
}

export function renderReveal(roundType, question, answer1, answer2, player1Name, player2Name, extra) {
  const container = document.getElementById('screen-reveal');

  const card1 = container.querySelector('.reveal-card-1');
  const card2 = container.querySelector('.reveal-card-2');
  const message = container.querySelector('.reveal-message');
  const nextBtn = container.querySelector('.reveal-next');

  card1.querySelector('.reveal-name').textContent = player1Name;
  card2.querySelector('.reveal-name').textContent = player2Name;

  // Resolve display text for answers
  let display1 = answer1;
  let display2 = answer2;

  if (roundType === "thisOrThat") {
    display1 = answer1 === "A" ? question.optionA.text : question.optionB.text;
    display2 = answer2 === "A" ? question.optionA.text : question.optionB.text;
    const emoji1 = answer1 === "A" ? question.optionA.emoji : question.optionB.emoji;
    const emoji2 = answer2 === "A" ? question.optionA.emoji : question.optionB.emoji;
    display1 = `${emoji1} ${display1}`;
    display2 = `${emoji2} ${display2}`;
  } else if (roundType === "wouldYouRather") {
    display1 = answer1 === "A" ? question.optionA.text : question.optionB.text;
    display2 = answer2 === "A" ? question.optionA.text : question.optionB.text;
  }

  card1.querySelector('.reveal-answer').textContent = display1;
  card2.querySelector('.reveal-answer').textContent = display2;

  // Match or not?
  const matched = answer1 === answer2;

  if (roundType === "guessMyAnswer") {
    // For guess rounds, show subject's answer vs guesser's guess
    container.querySelector('.reveal-title').textContent = "The Reveal";
    const subjectName = extra?.subjectPlayer === "player1" ? player1Name : player2Name;
    const guesserName = extra?.subjectPlayer === "player1" ? player2Name : player1Name;
    card1.querySelector('.reveal-name').textContent = `${subjectName}'s answer`;
    card2.querySelector('.reveal-name').textContent = `${guesserName}'s guess`;
  } else if (roundType === "deepQuestion") {
    container.querySelector('.reveal-title').textContent = "Your Thoughts";
  } else {
    container.querySelector('.reveal-title').textContent = "The Reveal";
  }

  if (roundType === "deepQuestion") {
    message.textContent = "Beautiful. Now you know a little more about each other.";
    message.className = 'reveal-message reveal-deep';
    card1.classList.remove('match', 'no-match');
    card2.classList.remove('match', 'no-match');
  } else if (roundType === "guessMyAnswer") {
    // For free text guess rounds, we need the subject to judge
    if (extra?.needsJudgment) {
      message.textContent = "Did they guess right?";
      message.className = 'reveal-message';
    } else if (matched || extra?.correct) {
      message.textContent = "They know you well!";
      message.className = 'reveal-message reveal-match';
      card1.classList.add('match');
      card2.classList.add('match');
      card1.classList.remove('no-match');
      card2.classList.remove('no-match');
      triggerConfetti();
    } else {
      message.textContent = "Not quite \u2014 but now you know!";
      message.className = 'reveal-message reveal-miss';
      card1.classList.remove('match');
      card2.classList.remove('match');
      card1.classList.add('no-match');
      card2.classList.add('no-match');
    }
  } else if (matched) {
    message.textContent = "You matched! \ud83d\udc9d";
    message.className = 'reveal-message reveal-match';
    card1.classList.add('match');
    card2.classList.add('match');
    card1.classList.remove('no-match');
    card2.classList.remove('no-match');
    triggerConfetti();
  } else {
    message.textContent = "Interesting... you see things differently!";
    message.className = 'reveal-message reveal-miss';
    card1.classList.remove('match');
    card2.classList.remove('match');
    card1.classList.add('no-match');
    card2.classList.add('no-match');
  }

  return nextBtn;
}

export function renderJudgmentButtons(container, onJudge) {
  const existing = container.querySelector('.judgment-buttons');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'judgment-buttons';

  const yesBtn = document.createElement('button');
  yesBtn.className = 'btn btn-match';
  yesBtn.textContent = 'They got it! \u2705';
  yesBtn.addEventListener('click', () => {
    div.remove();
    onJudge(true);
  });

  const noBtn = document.createElement('button');
  noBtn.className = 'btn btn-miss';
  noBtn.textContent = 'Not quite \u274c';
  noBtn.addEventListener('click', () => {
    div.remove();
    onJudge(false);
  });

  div.appendChild(yesBtn);
  div.appendChild(noBtn);
  container.querySelector('.reveal-message').after(div);
}

export function renderSummary(scoring, player1Name, player2Name) {
  const container = document.getElementById('screen-summary');
  const scoreEl = container.querySelector('.summary-score');
  const matchStat = container.querySelector('.stat-matches');
  const guessStat = container.querySelector('.stat-guesses');
  const closingMsg = container.querySelector('.summary-closing');
  const highlightEl = container.querySelector('.summary-highlight');

  // Animate score count-up
  let current = 0;
  const target = scoring.compatibilityScore;
  scoreEl.textContent = '0%';

  const interval = setInterval(() => {
    current += 1;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    scoreEl.textContent = `${current}%`;
  }, 20);

  matchStat.textContent = `You agreed on ${scoring.totalMatches} out of ${scoring.totalMatchQuestions} choices`;
  guessStat.textContent = `You predicted each other's answers ${scoring.guessCorrect} out of ${scoring.guessTotal} times`;

  if (scoring.highlight) {
    highlightEl.textContent = `You both picked the same on "${scoring.highlight.question}" \u2014 nice!`;
    highlightEl.classList.remove('hidden');
  } else {
    highlightEl.classList.add('hidden');
  }

  return container;
}

export function showWaiting(partnerName, container) {
  const el = container.querySelector('.waiting-indicator');
  if (el) {
    el.querySelector('.waiting-name').textContent = partnerName;
    el.classList.remove('hidden');
  }
}

export function showToast(msg, type = 'error') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast toast-${type} toast-show`;
  setTimeout(() => {
    toast.classList.remove('toast-show');
  }, 3000);
}

function triggerConfetti() {
  if (typeof window.confetti === 'function') {
    window.confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#E8636F', '#FADADD', '#7C5CBF', '#F4A261', '#6BCB77']
    });
  }
}

export function updateRoundIndicator(current, total) {
  const el = document.getElementById('round-indicator');
  if (el) {
    el.textContent = `Round ${current + 1} of ${total}`;
    el.classList.remove('hidden');
  }
}

export function hideRoundIndicator() {
  const el = document.getElementById('round-indicator');
  if (el) el.classList.add('hidden');
}
