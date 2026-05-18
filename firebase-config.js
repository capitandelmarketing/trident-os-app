// firebase-config.js — PLACEHOLDERS · safe to commit
// Real credentials live in firebase-config.local.js (gitignored) which loads BEFORE this file.
// This file only acts as a fallback so developers without local credentials see a clear error.
//
// To set up locally:
//   1. Copy this file to firebase-config.local.js
//   2. Replace PLACEHOLDER values with real ones from Firebase Console + aistudio.google.com/apikey
//   3. firebase-config.local.js is gitignored · safe to keep secrets there

if (typeof window.FIREBASE_CONFIG === "undefined") {
  console.warn(
    "[firebase-config] firebase-config.local.js missing or did not load. " +
    "Using placeholders · the app will NOT work until you create firebase-config.local.js with real credentials."
  );
  window.FIREBASE_CONFIG = {
    apiKey:            "PEGAR_FIREBASE_API_KEY",
    authDomain:        "PEGAR_PROJECT.firebaseapp.com",
    projectId:         "PEGAR_PROJECT_ID",
    storageBucket:     "PEGAR_PROJECT.firebasestorage.app",
    messagingSenderId: "PEGAR_MESSAGING_SENDER_ID",
    appId:             "PEGAR_APP_ID"
  };
  window.FIREBASE_DATABASE_ID = "(default)";
  window.GEMINI_API_KEY = "PEGAR_GEMINI_API_KEY";
}
