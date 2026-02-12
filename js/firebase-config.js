import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

// ============================================================
// FIREBASE SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (disable Google Analytics)
// 3. Go to Authentication > Sign-in method > Enable "Anonymous"
// 4. Go to Realtime Database > Create Database (choose nearest region)
// 5. Go to Realtime Database > Rules > Paste the rules from firebase-rules.json
// 6. Go to Project Settings > General > Your apps > Add web app
// 7. Copy the firebaseConfig object below and replace the placeholder
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBizP265MtIDNd4BuH2qd0VYzCfNVmOcGM",
  authDomain: "sangame-82cbc.firebaseapp.com",
  databaseURL: "https://sangame-82cbc-default-rtdb.firebaseio.com",
  projectId: "sangame-82cbc",
  storageBucket: "sangame-82cbc.firebasestorage.app",
  messagingSenderId: "901538145174",
  appId: "1:901538145174:web:476fd7c0f05a18f340b3b7"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export async function signInAnon() {
  try {
    const result = await signInAnonymously(auth);
    return result.user.uid;
  } catch (error) {
    console.error("Auth error:", error);
    throw error;
  }
}
