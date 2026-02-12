import { db } from './firebase-config.js';
import {
  ref, set, get, update, onValue, onDisconnect, runTransaction, serverTimestamp, push
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createRoom(playerName, uid, rounds) {
  let roomCode = generateRoomCode();
  let attempts = 0;

  // Ensure unique room code
  while (attempts < 5) {
    const snap = await get(ref(db, `rooms/${roomCode}`));
    if (!snap.exists()) break;
    roomCode = generateRoomCode();
    attempts++;
  }

  const roomData = {
    createdAt: Date.now(),
    status: "waiting",
    players: {
      player1: {
        uid,
        name: playerName,
        joinedAt: Date.now(),
        online: true
      }
    },
    gameConfig: {
      totalRounds: rounds.length,
      currentRound: 0,
      roundPhase: "waiting"
    },
    rounds: {}
  };

  // Write round structure
  rounds.forEach((round, i) => {
    roomData.rounds[i] = {
      type: round.type,
      questionId: round.questionId,
      revealed: false,
      answers: {}
    };
    if (round.type === "guessMyAnswer") {
      roomData.rounds[i].subjectPlayer = round.subjectPlayer;
    }
  });

  await set(ref(db, `rooms/${roomCode}`), roomData);
  return roomCode;
}

export async function joinRoom(roomCode, playerName, uid) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    throw new Error("Room not found. Check the code and try again.");
  }

  const data = snap.val();

  if (data.players?.player2) {
    throw new Error("This room is full. Create a new one?");
  }

  await update(ref(db, `rooms/${roomCode}/players/player2`), {
    uid,
    name: playerName,
    joinedAt: Date.now(),
    online: true
  });

  return data;
}

export async function submitAnswer(roomCode, roundIndex, playerSlot, answer) {
  await set(
    ref(db, `rooms/${roomCode}/rounds/${roundIndex}/answers/${playerSlot}`),
    answer
  );
}

export async function markRevealed(roomCode, roundIndex) {
  const revealedRef = ref(db, `rooms/${roomCode}/rounds/${roundIndex}/revealed`);
  await runTransaction(revealedRef, (current) => {
    if (current === true) return; // already revealed
    return true;
  });
}

export async function advanceRound(roomCode, nextRound) {
  await update(ref(db, `rooms/${roomCode}/gameConfig`), {
    currentRound: nextRound,
    roundPhase: "answering"
  });
}

export async function setRoundPhase(roomCode, phase) {
  await update(ref(db, `rooms/${roomCode}/gameConfig`), {
    roundPhase: phase
  });
}

export async function startGame(roomCode) {
  await update(ref(db, `rooms/${roomCode}`), {
    status: "playing",
    "gameConfig/roundPhase": "answering"
  });
}

export async function finishGame(roomCode, scoring) {
  await update(ref(db, `rooms/${roomCode}`), {
    status: "finished",
    scoring
  });
}

export function listenToRoom(roomCode, callback) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  return onValue(roomRef, (snap) => {
    callback(snap.val());
  });
}

export function listenToPlayers(roomCode, callback) {
  const playersRef = ref(db, `rooms/${roomCode}/players`);
  return onValue(playersRef, (snap) => {
    callback(snap.val());
  });
}

export function listenToRound(roomCode, roundIndex, callback) {
  const roundRef = ref(db, `rooms/${roomCode}/rounds/${roundIndex}`);
  return onValue(roundRef, (snap) => {
    callback(snap.val());
  });
}

export function listenToGameConfig(roomCode, callback) {
  const configRef = ref(db, `rooms/${roomCode}/gameConfig`);
  return onValue(configRef, (snap) => {
    callback(snap.val());
  });
}

export function listenToStatus(roomCode, callback) {
  const statusRef = ref(db, `rooms/${roomCode}/status`);
  return onValue(statusRef, (snap) => {
    callback(snap.val());
  });
}

export function setupPresence(roomCode, playerSlot) {
  const presenceRef = ref(db, `rooms/${roomCode}/players/${playerSlot}/online`);
  const connectedRef = ref(db, '.info/connected');
  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      set(presenceRef, true);
      onDisconnect(presenceRef).set(false);
    }
  });
}

// Submit the "they got it" judgment for free-text guess rounds
export async function submitGuessJudgment(roomCode, roundIndex, correct) {
  await set(
    ref(db, `rooms/${roomCode}/rounds/${roundIndex}/correct`),
    correct
  );
}
