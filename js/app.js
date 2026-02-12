import { db, auth, signInAnon } from './firebase-config.js';
import {
  createRoom, joinRoom, submitAnswer, markRevealed,
  advanceRound, startGame, finishGame, setupPresence,
  listenToRoom, listenToPlayers, listenToRound, listenToStatus,
  listenToGameConfig, setRoundPhase, submitGuessJudgment
} from './game-state.js';
import {
  generateRoundPlan, getQuestionById, getRoundTypeName,
  getRoundTypeIcon, calculateScoring, getClosingMessage
} from './game-engine.js';
import {
  showScreen, renderThisOrThat, renderWouldYouRather,
  renderDeepQuestion, renderGuessMyAnswer, renderReveal,
  renderJudgmentButtons, renderSummary, showToast,
  updateRoundIndicator, hideRoundIndicator
} from './ui.js';

// ========== App State ==========
let uid = null;
let roomCode = null;
let playerSlot = null; // "player1" or "player2"
let playerName = null;
let partnerName = null;
let roomData = null;
let currentRoundIndex = -1;
let roundUnsubscribe = null;
let gameConfigUnsubscribe = null;
let statusUnsubscribe = null;
let playersUnsubscribe = null;
let hasSubmittedAnswer = false;
let isShowingReveal = false;

// ========== Initialization ==========
async function init() {
  setupEventListeners();

  try {
    uid = await signInAnon();
  } catch (e) {
    showToast("Connection error. Please refresh.");
    return;
  }

  // Check for room code in URL
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room');

  if (urlRoom) {
    document.getElementById('join-code-input').value = urlRoom.toUpperCase();
    showScreen('screen-join');
  } else {
    // Check localStorage for rejoin
    const saved = localStorage.getItem('sangame_session');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.uid === uid && session.roomCode) {
          roomCode = session.roomCode;
          playerSlot = session.playerSlot;
          playerName = session.playerName;
          // Try to rejoin
          listenToRoom(roomCode, handleRoomUpdate);
          setupPresence(roomCode, playerSlot);
          return; // Will be routed by handleRoomUpdate
        }
      } catch (e) {
        localStorage.removeItem('sangame_session');
      }
    }
    showScreen('screen-landing');
  }
}

function saveSession() {
  localStorage.setItem('sangame_session', JSON.stringify({
    uid, roomCode, playerSlot, playerName
  }));
}

function cleanupListeners() {
  if (roundUnsubscribe) { roundUnsubscribe(); roundUnsubscribe = null; }
  if (gameConfigUnsubscribe) { gameConfigUnsubscribe(); gameConfigUnsubscribe = null; }
  if (statusUnsubscribe) { statusUnsubscribe(); statusUnsubscribe = null; }
  if (playersUnsubscribe) { playersUnsubscribe(); playersUnsubscribe = null; }
}

// ========== Event Listeners ==========
function setupEventListeners() {
  // Landing
  document.getElementById('btn-create').addEventListener('click', () => {
    showScreen('screen-create');
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    showScreen('screen-join');
  });

  // Create room
  document.getElementById('btn-create-submit').addEventListener('click', handleCreateRoom);
  document.getElementById('create-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateRoom();
  });

  // Join room
  document.getElementById('btn-join-submit').addEventListener('click', handleJoinRoom);
  document.getElementById('join-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoinRoom();
  });

  // Copy link
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast('Link copied!', 'success');
    }).catch(() => {
      // Fallback
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast('Link copied!', 'success');
    });
  });

  // Start game
  document.getElementById('btn-start-game').addEventListener('click', async () => {
    if (!roomCode) return;
    try {
      await startGame(roomCode);
    } catch (e) {
      showToast('Failed to start game. Please try again.');
    }
  });

  // Play again
  document.getElementById('btn-play-again').addEventListener('click', () => {
    cleanupListeners();
    localStorage.removeItem('sangame_session');
    window.location.href = window.location.pathname;
  });
}

// ========== Create Room ==========
async function handleCreateRoom() {
  const nameInput = document.getElementById('create-name-input');
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Please enter your name');
    return;
  }

  playerName = name;
  playerSlot = "player1";

  const btn = document.getElementById('btn-create-submit');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const rounds = generateRoundPlan();
    roomCode = await createRoom(playerName, uid, rounds);
    saveSession();

    // Show waiting screen
    document.getElementById('room-code-display').textContent = roomCode;
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    document.getElementById('room-link-display').textContent = link;
    showScreen('screen-waiting');

    // Listen for player2
    playersUnsubscribe = listenToPlayers(roomCode, (players) => {
      if (players?.player2) {
        partnerName = players.player2.name;
        // Clean up players listener once partner joins
        if (playersUnsubscribe) { playersUnsubscribe(); playersUnsubscribe = null; }
        showLobby();
      }
    });

    setupPresence(roomCode, playerSlot);
    statusUnsubscribe = listenToStatus(roomCode, handleStatusChange);
  } catch (e) {
    showToast('Failed to create room. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Create Room';
  }
}

// ========== Join Room ==========
async function handleJoinRoom() {
  const codeInput = document.getElementById('join-code-input');
  const nameInput = document.getElementById('join-name-input');
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  if (!code || code.length !== 6) {
    showToast('Please enter a valid 6-character room code');
    return;
  }
  if (!name) {
    showToast('Please enter your name');
    return;
  }

  playerName = name;
  playerSlot = "player2";

  const btn = document.getElementById('btn-join-submit');
  btn.disabled = true;
  btn.textContent = 'Joining...';

  try {
    const data = await joinRoom(code, playerName, uid);
    roomCode = code;
    partnerName = data.players.player1.name;
    saveSession();

    setupPresence(roomCode, playerSlot);
    statusUnsubscribe = listenToStatus(roomCode, handleStatusChange);
    showLobby();
  } catch (e) {
    showToast(e.message);
    btn.disabled = false;
    btn.textContent = 'Join Room';
  }
}

// ========== Lobby ==========
function showLobby() {
  const p1Name = playerSlot === "player1" ? playerName : partnerName;
  const p2Name = playerSlot === "player2" ? playerName : partnerName;

  document.getElementById('lobby-player1').textContent = p1Name;
  document.getElementById('lobby-player2').textContent = p2Name;
  document.getElementById('lobby-avatar-1').textContent = p1Name ? p1Name.charAt(0).toUpperCase() : "?";
  document.getElementById('lobby-avatar-2').textContent = p2Name ? p2Name.charAt(0).toUpperCase() : "?";
  document.getElementById('lobby-greeting').textContent = `Hi ${p1Name} & ${p2Name}!`;
  showScreen('screen-lobby');
}

// ========== Status Changes ==========
function handleStatusChange(status) {
  if (status === "playing") {
    startPlaying();
  } else if (status === "finished") {
    // Fetch room data once to get scoring
    listenToRoom(roomCode, (data) => {
      if (data) {
        roomData = data;
        if (data.scoring) {
          showSummaryScreen(data.scoring);
        }
      }
    });
  }
}

// ========== Room Update (for rejoin) ==========
function handleRoomUpdate(data) {
  if (!data) {
    localStorage.removeItem('sangame_session');
    showScreen('screen-landing');
    return;
  }

  roomData = data;
  const p1 = data.players?.player1;
  const p2 = data.players?.player2;

  if (playerSlot === "player1") {
    partnerName = p2?.name || null;
  } else {
    partnerName = p1?.name || null;
  }

  // Set up status listener once
  if (!statusUnsubscribe) {
    statusUnsubscribe = listenToStatus(roomCode, handleStatusChange);
  }

  if (data.status === "waiting") {
    if (playerSlot === "player1") {
      document.getElementById('room-code-display').textContent = roomCode;
      const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      document.getElementById('room-link-display').textContent = link;
      if (p2) {
        showLobby();
      } else {
        showScreen('screen-waiting');
      }
    } else if (p2) {
      showLobby();
    }
  } else if (data.status === "playing") {
    startPlaying();
  } else if (data.status === "finished" && data.scoring) {
    showSummaryScreen(data.scoring);
  }
}

// ========== Game Play ==========
let startPlayingCalled = false;

function startPlaying() {
  if (startPlayingCalled) return;
  startPlayingCalled = true;

  gameConfigUnsubscribe = listenToGameConfig(roomCode, (config) => {
    if (!config) return;
    const roundIdx = config.currentRound;
    if (roundIdx !== currentRoundIndex) {
      currentRoundIndex = roundIdx;
      hasSubmittedAnswer = false;
      isShowingReveal = false;
      loadRound(roundIdx);
    }
  });
}

function loadRound(roundIndex) {
  // Clean up previous listener
  if (roundUnsubscribe) {
    roundUnsubscribe();
    roundUnsubscribe = null;
  }

  roundUnsubscribe = listenToRoom(roomCode, (data) => {
    if (!data) return;
    roomData = data;
    const totalRounds = data.gameConfig?.totalRounds || 12;
    const round = data.rounds?.[roundIndex];

    if (!round) {
      // Game finished
      const scoring = calculateScoring(Object.values(data.rounds || {}));
      finishGame(roomCode, scoring);
      showSummaryScreen(scoring);
      return;
    }

    const question = getQuestionById(round.questionId);
    if (!question) return;

    // Update partner name in case of rejoin
    const p1Name = data.players?.player1?.name || "Player 1";
    const p2Name = data.players?.player2?.name || "Player 2";
    partnerName = playerSlot === "player1" ? p2Name : p1Name;

    const myAnswer = round.answers?.[playerSlot];
    const theirSlot = playerSlot === "player1" ? "player2" : "player1";
    const theirAnswer = round.answers?.[theirSlot];

    // Both answered -> show reveal
    if (myAnswer != null && theirAnswer != null && !isShowingReveal) {
      isShowingReveal = true;
      showRevealScreen(round, question, data, roundIndex);
      return;
    }

    // For guess rounds waiting for judgment, re-render reveal when judgment arrives
    if (myAnswer != null && theirAnswer != null && isShowingReveal && round.type === "guessMyAnswer") {
      if (round.correct != null) {
        // Judgment arrived, re-render
        showRevealScreen(round, question, data, roundIndex);
      }
      return;
    }

    // Already submitted -> show waiting
    if (myAnswer != null && !isShowingReveal) {
      return;
    }

    // Show the appropriate question screen
    if (!hasSubmittedAnswer) {
      updateRoundIndicator(roundIndex, totalRounds);
      showRoundIntro(round.type, roundIndex, totalRounds, () => {
        showQuestionScreen(round, question, roundIndex, p1Name, p2Name);
      });
    }
  });
}

function showRoundIntro(type, roundIndex, totalRounds, callback) {
  const container = document.getElementById('screen-round-intro');
  container.querySelector('.intro-round-number').textContent = `Round ${roundIndex + 1} of ${totalRounds}`;
  container.querySelector('.intro-type-icon').textContent = getRoundTypeIcon(type);
  container.querySelector('.intro-type-name').textContent = getRoundTypeName(type);
  showScreen('screen-round-intro');

  setTimeout(callback, 2000);
}

function showQuestionScreen(round, question, roundIndex, p1Name, p2Name) {
  const type = round.type;
  const onSubmit = async (answer) => {
    hasSubmittedAnswer = true;
    try {
      await submitAnswer(roomCode, roundIndex, playerSlot, answer);
    } catch (e) {
      showToast('Failed to submit answer. Please try again.');
      hasSubmittedAnswer = false;
    }
  };

  if (type === "thisOrThat") {
    renderThisOrThat(question, onSubmit);
    showScreen('screen-this-or-that');
  } else if (type === "wouldYouRather") {
    renderWouldYouRather(question, onSubmit);
    showScreen('screen-would-you-rather');
  } else if (type === "deepQuestion") {
    renderDeepQuestion(question, onSubmit);
    showScreen('screen-deep-question');
  } else if (type === "guessMyAnswer") {
    const isSubject = (round.subjectPlayer === playerSlot);
    renderGuessMyAnswer(question, isSubject, partnerName, onSubmit);
    showScreen('screen-guess-answer');
  }
}

async function showRevealScreen(round, question, data, roundIndex) {
  const p1Name = data.players?.player1?.name || "Player 1";
  const p2Name = data.players?.player2?.name || "Player 2";
  const a1 = round.answers?.player1;
  const a2 = round.answers?.player2;
  const totalRounds = data.gameConfig?.totalRounds || 12;

  // For guess rounds, show subject's answer first, guesser's guess second
  if (round.type === "guessMyAnswer") {
    const subjectAnswer = round.answers?.[round.subjectPlayer];
    const guesserSlot = round.subjectPlayer === "player1" ? "player2" : "player1";
    const guesserAnswer = round.answers?.[guesserSlot];

    const isChoiceQuestion = question.inputType === "choice";
    const needsJudgment = !isChoiceQuestion && round.correct == null;
    const isSubject = (round.subjectPlayer === playerSlot);

    const nextBtn = renderReveal(
      round.type, question, subjectAnswer, guesserAnswer, p1Name, p2Name,
      { subjectPlayer: round.subjectPlayer, needsJudgment, correct: round.correct }
    );
    showScreen('screen-reveal');

    if (needsJudgment && isSubject) {
      renderJudgmentButtons(document.getElementById('screen-reveal'), async (correct) => {
        await submitGuessJudgment(roomCode, roundIndex, correct);
        // Re-render reveal with judgment
        const updatedNextBtn = renderReveal(
          round.type, question, subjectAnswer, guesserAnswer, p1Name, p2Name,
          { subjectPlayer: round.subjectPlayer, correct }
        );
        setupNextButton(updatedNextBtn, roundIndex, totalRounds);
      });
      return;
    } else if (needsJudgment && !isSubject) {
      // Guesser waits for subject's judgment - will re-render when judgment arrives
      if (nextBtn) nextBtn.classList.add('hidden');
      const revealContainer = document.getElementById('screen-reveal');
      revealContainer.querySelector('.reveal-message').textContent = `Waiting for ${partnerName} to judge...`;
      return;
    } else if (isChoiceQuestion) {
      const matched = subjectAnswer === guesserAnswer;
      if (round.correct == null) {
        await submitGuessJudgment(roomCode, roundIndex, matched);
      }
    }

    if (nextBtn) setupNextButton(nextBtn, roundIndex, totalRounds);
    return;
  }

  const nextBtn = renderReveal(round.type, question, a1, a2, p1Name, p2Name);
  showScreen('screen-reveal');
  if (nextBtn) setupNextButton(nextBtn, roundIndex, totalRounds);
}

function setupNextButton(nextBtn, roundIndex, totalRounds) {
  if (!nextBtn) return;
  nextBtn.classList.remove('hidden');
  // Clone to remove old listeners
  const newBtn = nextBtn.cloneNode(true);
  nextBtn.parentNode.replaceChild(newBtn, nextBtn);

  const isLastRound = roundIndex >= totalRounds - 1;
  newBtn.textContent = isLastRound ? 'See Results' : 'Next Round';

  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    try {
      if (isLastRound) {
        const scoring = calculateScoring(Object.values(roomData.rounds || {}));
        await finishGame(roomCode, scoring);
        showSummaryScreen(scoring);
      } else {
        await advanceRound(roomCode, roundIndex + 1);
      }
    } catch (e) {
      showToast('Something went wrong. Please try again.');
      newBtn.disabled = false;
    }
  });
}

function showSummaryScreen(scoring) {
  hideRoundIndicator();
  const p1Name = roomData?.players?.player1?.name || "Player 1";
  const p2Name = roomData?.players?.player2?.name || "Player 2";

  renderSummary(scoring, p1Name, p2Name);

  const closingMsg = document.querySelector('.summary-closing');
  closingMsg.textContent = getClosingMessage(scoring.compatibilityScore);

  showScreen('screen-summary');

  // Confetti burst for summary
  setTimeout(() => {
    if (typeof window.confetti === 'function') {
      window.confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#E8636F', '#FADADD', '#7C5CBF', '#F4A261', '#6BCB77']
      });
    }
  }, 800);
}

// ========== Start ==========
init();
