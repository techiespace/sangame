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
let roomUnsubscribe = null;
let hasSubmittedAnswer = false;
let isShowingReveal = false;
let hasShownIntro = false;

// ========== Initialization ==========
async function init() {
  setupEventListeners();

  try {
    uid = await signInAnon();
    console.log('[Sangame] Signed in:', uid);
  } catch (e) {
    showToast("Connection error. Please refresh.");
    return;
  }

  // Check localStorage for existing session FIRST (handles refresh)
  const saved = localStorage.getItem('sangame_session');
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session.roomCode && session.playerSlot && session.playerName) {
        console.log('[Sangame] Resuming session:', session.roomCode, session.playerSlot);
        roomCode = session.roomCode;
        playerSlot = session.playerSlot;
        playerName = session.playerName;
        // Rejoin the room
        listenToRoom(roomCode, handleRoomUpdate);
        setupPresence(roomCode, playerSlot);
        return;
      }
    } catch (e) {
      localStorage.removeItem('sangame_session');
    }
  }

  // No saved session — check for room code in URL (new join)
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room');

  if (urlRoom) {
    document.getElementById('join-code-input').value = urlRoom.toUpperCase();
    showScreen('screen-join');
  } else {
    showScreen('screen-landing');
  }
}

function saveSession() {
  localStorage.setItem('sangame_session', JSON.stringify({
    roomCode, playerSlot, playerName
  }));
}

function cleanupListeners() {
  if (roundUnsubscribe) { roundUnsubscribe(); roundUnsubscribe = null; }
  if (gameConfigUnsubscribe) { gameConfigUnsubscribe(); gameConfigUnsubscribe = null; }
  if (statusUnsubscribe) { statusUnsubscribe(); statusUnsubscribe = null; }
  if (playersUnsubscribe) { playersUnsubscribe(); playersUnsubscribe = null; }
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
}

// ========== Event Listeners ==========
function setupEventListeners() {
  document.getElementById('btn-create').addEventListener('click', () => {
    showScreen('screen-create');
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    showScreen('screen-join');
  });

  document.getElementById('btn-create-submit').addEventListener('click', handleCreateRoom);
  document.getElementById('create-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateRoom();
  });

  document.getElementById('btn-join-submit').addEventListener('click', handleJoinRoom);
  document.getElementById('join-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoinRoom();
  });

  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast('Link copied!', 'success');
    }).catch(() => {
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast('Link copied!', 'success');
    });
  });

  document.getElementById('btn-start-game').addEventListener('click', async () => {
    if (!roomCode) return;
    try {
      await startGame(roomCode);
    } catch (e) {
      showToast('Failed to start game. Please try again.');
    }
  });

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

    document.getElementById('room-code-display').textContent = roomCode;
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    document.getElementById('room-link-display').textContent = link;
    showScreen('screen-waiting');

    playersUnsubscribe = listenToPlayers(roomCode, (players) => {
      if (players?.player2) {
        partnerName = players.player2.name;
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
  console.log('[Sangame] Status changed:', status);
  if (status === "playing") {
    startPlaying();
  } else if (status === "finished") {
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

// ========== Room Update (for rejoin - fires once then we route) ==========
let rejoinHandled = false;

function handleRoomUpdate(data) {
  // Only handle the first callback to route to the right screen
  if (rejoinHandled) return;
  rejoinHandled = true;

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

  console.log('[Sangame] Rejoin: status =', data.status, '| partner =', partnerName);

  if (data.status === "playing") {
    // Resume the game directly — startPlaying sets up its own room listener
    statusUnsubscribe = listenToStatus(roomCode, handleStatusChange);
    startPlaying();
  } else if (data.status === "finished" && data.scoring) {
    showSummaryScreen(data.scoring);
  } else if (data.status === "waiting") {
    statusUnsubscribe = listenToStatus(roomCode, handleStatusChange);
    if (playerSlot === "player1") {
      document.getElementById('room-code-display').textContent = roomCode;
      const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      document.getElementById('room-link-display').textContent = link;
      if (p2) {
        showLobby();
      } else {
        showScreen('screen-waiting');
        // Listen for player2
        playersUnsubscribe = listenToPlayers(roomCode, (players) => {
          if (players?.player2) {
            partnerName = players.player2.name;
            if (playersUnsubscribe) { playersUnsubscribe(); playersUnsubscribe = null; }
            showLobby();
          }
        });
      }
    } else if (p2) {
      showLobby();
    }
  } else {
    // Unknown state — go to landing
    localStorage.removeItem('sangame_session');
    showScreen('screen-landing');
  }
}

// ========== Game Play ==========
let startPlayingCalled = false;

function startPlaying() {
  if (startPlayingCalled) return;
  startPlayingCalled = true;
  console.log('[Sangame] Starting game, listening to room...');

  // Use a single room listener for the entire game
  roomUnsubscribe = listenToRoom(roomCode, (data) => {
    if (!data) return;
    roomData = data;

    const config = data.gameConfig;
    if (!config) return;

    const roundIdx = config.currentRound;

    // New round detected
    if (roundIdx !== currentRoundIndex) {
      console.log('[Sangame] New round:', roundIdx);
      currentRoundIndex = roundIdx;
      hasSubmittedAnswer = false;
      isShowingReveal = false;
      hasShownIntro = false;
    }

    processRound(data, roundIdx);
  });
}

function processRound(data, roundIndex) {
  const totalRounds = data.gameConfig?.totalRounds || 12;
  const round = data.rounds?.[roundIndex];

  if (!round) {
    // All rounds complete
    const scoring = calculateScoring(Object.values(data.rounds || {}));
    finishGame(roomCode, scoring);
    showSummaryScreen(scoring);
    return;
  }

  const question = getQuestionById(round.questionId);
  if (!question) {
    console.warn('[Sangame] Question not found:', round.questionId);
    return;
  }

  // Update names
  const p1Name = data.players?.player1?.name || "Player 1";
  const p2Name = data.players?.player2?.name || "Player 2";
  partnerName = playerSlot === "player1" ? p2Name : p1Name;

  const myAnswer = round.answers?.[playerSlot] ?? null;
  const theirSlot = playerSlot === "player1" ? "player2" : "player1";
  const theirAnswer = round.answers?.[theirSlot] ?? null;

  console.log('[Sangame] Round', roundIndex, '| myAnswer:', myAnswer, '| theirAnswer:', theirAnswer, '| isShowingReveal:', isShowingReveal, '| hasSubmitted:', hasSubmittedAnswer);

  // CASE 1: Both answered -> show reveal
  if (myAnswer !== null && theirAnswer !== null) {
    if (!isShowingReveal) {
      isShowingReveal = true;
      console.log('[Sangame] Both answered, showing reveal');
      showRevealScreen(round, question, data, roundIndex);
    }
    return;
  }

  // CASE 2: I answered, waiting for them
  if (myAnswer !== null) {
    // Already showing waiting state from the submit handler
    return;
  }

  // CASE 3: Haven't answered yet -> show question
  if (!hasSubmittedAnswer && !hasShownIntro) {
    hasShownIntro = true;
    updateRoundIndicator(roundIndex, totalRounds);
    showRoundIntro(round.type, roundIndex, totalRounds, () => {
      showQuestionScreen(round, question, roundIndex, p1Name, p2Name);
    });
  }
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
      console.log('[Sangame] Answer submitted successfully');
    } catch (e) {
      console.error('[Sangame] Submit failed:', e);
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
        const updatedNextBtn = renderReveal(
          round.type, question, subjectAnswer, guesserAnswer, p1Name, p2Name,
          { subjectPlayer: round.subjectPlayer, correct }
        );
        setupNextButton(updatedNextBtn, roundIndex, totalRounds);
      });
      return;
    } else if (needsJudgment && !isSubject) {
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

function setupNextButton(ignoredRef, roundIndex, totalRounds) {
  // Always grab the button fresh from the DOM to avoid stale references
  const btn = document.querySelector('#screen-reveal .reveal-next');
  if (!btn) {
    console.warn('[Sangame] Next button not found in DOM');
    return;
  }

  btn.classList.remove('hidden');
  btn.disabled = false;

  const isLastRound = roundIndex >= totalRounds - 1;
  btn.textContent = isLastRound ? 'See Results' : 'Next Round';

  // Remove old listener by replacing onclick
  btn.onclick = async () => {
    btn.disabled = true;
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
      btn.disabled = false;
    }
  };
}

function showSummaryScreen(scoring) {
  hideRoundIndicator();
  const p1Name = roomData?.players?.player1?.name || "Player 1";
  const p2Name = roomData?.players?.player2?.name || "Player 2";

  renderSummary(scoring, p1Name, p2Name);

  const closingMsg = document.querySelector('.summary-closing');
  closingMsg.textContent = getClosingMessage(scoring.compatibilityScore);

  showScreen('screen-summary');

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
