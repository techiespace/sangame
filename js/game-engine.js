import { QUESTIONS } from './questions.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateRoundPlan() {
  const tot = shuffle(QUESTIONS.thisOrThat).slice(0, 3);
  const wyr = shuffle(QUESTIONS.wouldYouRather).slice(0, 2);
  const deep1 = shuffle(QUESTIONS.deepQuestions.filter(q => q.set <= 2)).slice(0, 2);
  const deep2 = shuffle(QUESTIONS.deepQuestions.filter(q => q.set >= 2)).slice(0, 2);
  const guess = shuffle(QUESTIONS.guessMyAnswer).slice(0, 3);

  // Interleaved order for variety
  const rounds = [
    { type: "thisOrThat", questionId: tot[0].id },
    { type: "thisOrThat", questionId: tot[1].id },
    { type: "wouldYouRather", questionId: wyr[0].id },
    { type: "deepQuestion", questionId: deep1[0].id },
    { type: "guessMyAnswer", questionId: guess[0].id, subjectPlayer: "player1" },
    { type: "thisOrThat", questionId: tot[2].id },
    { type: "deepQuestion", questionId: deep1[1].id },
    { type: "wouldYouRather", questionId: wyr[1].id },
    { type: "guessMyAnswer", questionId: guess[1].id, subjectPlayer: "player2" },
    { type: "deepQuestion", questionId: deep2[0].id },
    { type: "guessMyAnswer", questionId: guess[2].id, subjectPlayer: "player1" },
    { type: "deepQuestion", questionId: deep2[1].id }
  ];

  return rounds;
}

export function getQuestionById(questionId) {
  const allQuestions = [
    ...QUESTIONS.thisOrThat,
    ...QUESTIONS.wouldYouRather,
    ...QUESTIONS.deepQuestions,
    ...QUESTIONS.guessMyAnswer
  ];
  return allQuestions.find(q => q.id === questionId);
}

export function getRoundTypeName(type) {
  const names = {
    thisOrThat: "This or That",
    wouldYouRather: "Would You Rather",
    deepQuestion: "Deep Question",
    guessMyAnswer: "Guess My Answer"
  };
  return names[type] || type;
}

export function getRoundTypeIcon(type) {
  const icons = {
    thisOrThat: "\u2696\ufe0f",
    wouldYouRather: "\ud83e\udd14",
    deepQuestion: "\ud83d\udc9c",
    guessMyAnswer: "\ud83d\udd2e"
  };
  return icons[type] || "\u2728";
}

export function calculateScoring(rounds) {
  let totalMatches = 0;
  let totalMatchQuestions = 0;
  let guessCorrect = 0;
  let guessTotal = 0;
  const highlights = [];

  rounds.forEach((round, i) => {
    if (!round.answers) return;
    const a1 = round.answers.player1;
    const a2 = round.answers.player2;
    if (a1 == null || a2 == null) return;

    if (round.type === "thisOrThat" || round.type === "wouldYouRather") {
      totalMatchQuestions++;
      if (a1 === a2) {
        totalMatches++;
        const q = getQuestionById(round.questionId);
        if (q) {
          highlights.push({ type: "match", question: q.question || q.id, answer: a1 });
        }
      }
    } else if (round.type === "guessMyAnswer") {
      guessTotal++;
      if (round.correct === true) {
        guessCorrect++;
      }
    }
  });

  const matchPercentage = totalMatchQuestions > 0
    ? (totalMatches / totalMatchQuestions) * 100
    : 50;
  const guessAccuracy = guessTotal > 0
    ? (guessCorrect / guessTotal) * 100
    : 50;
  const compatibilityScore = Math.round(
    (matchPercentage * 0.6) + (guessAccuracy * 0.4)
  );

  return {
    totalMatches,
    totalMatchQuestions,
    guessCorrect,
    guessTotal,
    compatibilityScore,
    highlight: highlights.length > 0 ? highlights[0] : null
  };
}

export function getClosingMessage(score) {
  if (score >= 80) return "Looks like you two are really in sync! \u2728";
  if (score >= 60) return "You complement each other beautifully \u2014 different perspectives, shared warmth.";
  if (score >= 40) return "Opposites attract, and you two are proof! \ud83d\udc95";
  return "Every great story starts with two unique people. Keep talking. \ud83d\udcac";
}
