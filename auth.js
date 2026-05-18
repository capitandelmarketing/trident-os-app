// auth.js — Firebase Authentication wrapper for Trident OS v4
// Email/Password auth with 2 roles: "operator" (Damian/Oscar/team) and "client" (realtor)
// User profile stored in Firestore `users/{uid}` with role + linkedClientId

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let auth = null;
let db = null;
let app = null;
let currentUserProfile = null;
let authStateSettled = false;  // true after first onAuthStateChanged event
let profileUnsub = null;  // active onSnapshot unsubscribe for current user's profile
const stateListeners = new Set();

export function initAuth() {
  try {
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey || window.FIREBASE_CONFIG.apiKey.includes("PEGAR")) {
      throw new Error("FIREBASE_CONFIG not configured");
    }
    // Re-use existing app if db.js already initialized one
    app = getApps()[0] || initializeApp(window.FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app, window.FIREBASE_DATABASE_ID || "(default)");

    // Listen to auth state changes
    onAuthStateChanged(auth, async (firebaseUser) => {
      // Tear down previous profile subscription
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (firebaseUser) {
        // Load user profile from Firestore
        const profile = await loadUserProfile(firebaseUser.uid);
        if (profile) {
          currentUserProfile = { uid: firebaseUser.uid, email: firebaseUser.email, ...profile };
          console.log(`[auth] Signed in: ${firebaseUser.email} · role: ${currentUserProfile.role}`);
        } else {
          // No Firestore doc · do NOT silently fallback to "client"
          // Mark as pending so UI can show explicit "Account without role · contact admin"
          currentUserProfile = { uid: firebaseUser.uid, email: firebaseUser.email, role: "pending", linkedClientId: null };
          console.warn(`[auth] User ${firebaseUser.email} signed in WITHOUT Firestore profile · role: pending`);
        }

        // Subscribe to live updates so operator-side changes (role / linkedClientId) reflect instantly
        profileUnsub = onSnapshot(doc(db, "users", firebaseUser.uid), (snap) => {
          if (!snap.exists()) return;
          const newProfile = snap.data();
          const prev = currentUserProfile;
          currentUserProfile = { uid: firebaseUser.uid, email: firebaseUser.email, ...newProfile };
          // Only re-notify if something actually changed (avoid render storms)
          if (!prev || prev.role !== currentUserProfile.role || prev.linkedClientId !== currentUserProfile.linkedClientId) {
            console.log(`[auth] Live profile update · role=${currentUserProfile.role} · linkedClientId=${currentUserProfile.linkedClientId || "—"}`);
            stateListeners.forEach(cb => cb(currentUserProfile));
          }
        }, (err) => {
          console.warn(`[auth] Profile snapshot error: ${err.message}`);
        });
      } else {
        currentUserProfile = null;
        console.log("[auth] Signed out");
      }
      authStateSettled = true;
      // Notify all listeners
      stateListeners.forEach(cb => cb(currentUserProfile));
    });
    console.log("[auth] Initialized");
    return { ok: true };
  } catch (err) {
    console.warn(`[auth] Init failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export function onAuthChange(callback) {
  stateListeners.add(callback);
  // Only fire immediately if Firebase already settled · otherwise the first
  // onAuthStateChanged event will deliver the initial state (avoids double-render)
  if (authStateSettled) callback(currentUserProfile);
  return () => stateListeners.delete(callback);
}

export function getCurrentUser() {
  return currentUserProfile;
}

export async function signIn(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, uid: cred.user.uid };
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
}

export async function signUp(email, password, role = "client", linkedClientId = null, displayName = "") {
  let createdUser = null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    createdUser = cred.user;
    // Save profile to Firestore · if this fails, rollback the Auth user to avoid orphans
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      role,
      linkedClientId,
      displayName,
      createdAt: serverTimestamp()
    });
    return { ok: true, uid: cred.user.uid };
  } catch (err) {
    // Rollback: if Firebase Auth user was created but Firestore write failed, delete the user
    if (createdUser) {
      try {
        await deleteUser(createdUser);
        console.warn(`[auth] Rollback · deleted orphan Auth user ${createdUser.uid} after Firestore failure`);
      } catch (rollbackErr) {
        console.error(`[auth] CRITICAL · could not delete orphan user ${createdUser.uid}: ${rollbackErr.message}`);
      }
    }
    return { ok: false, error: humanError(err) };
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
}

export async function signOut() {
  if (profileUnsub) { profileUnsub(); profileUnsub = null; }
  await fbSignOut(auth);
  currentUserProfile = null;
}

async function loadUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) return snap.data();
    return null;
  } catch (err) {
    console.warn(`[auth] loadUserProfile failed: ${err.message}`);
    return null;
  }
}

export async function updateUserRole(uid, role, linkedClientId = null) {
  try {
    await setDoc(doc(db, "users", uid), { role, linkedClientId }, { merge: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
}

// List all user profiles (operator-only · UI gates this)
export async function listUsers() {
  try {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    return { ok: true, users };
  } catch (err) {
    // Fallback without orderBy in case createdAt missing on some docs
    try {
      const snap2 = await getDocs(collection(db, "users"));
      const users = snap2.docs.map(d => ({ uid: d.id, ...d.data() }));
      return { ok: true, users };
    } catch (err2) {
      return { ok: false, error: err2.message, users: [] };
    }
  }
}

// Update only the linkedClientId (preserves role)
export async function setLinkedClient(uid, linkedClientId) {
  try {
    await setDoc(doc(db, "users", uid), { linkedClientId }, { merge: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
}

// Delete the Firestore user profile · the Auth account remains (can't delete from client SDK)
// If user signs in again without a profile, they land in "pending" state.
export async function deleteUserProfile(uid) {
  try {
    await deleteDoc(doc(db, "users", uid));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
}

// ============ ROLE HELPERS ============

export function isOperator() {
  return currentUserProfile?.role === "operator";
}

export function isClient() {
  return currentUserProfile?.role === "client";
}

export function isAuthenticated() {
  return !!currentUserProfile;
}

export function canSeeClient(clientId) {
  if (!currentUserProfile) return false;
  if (isOperator()) return true;
  if (isClient() && currentUserProfile.linkedClientId === clientId) return true;
  return false;
}

// ============ HUMAN-FRIENDLY ERROR MESSAGES ============

function humanError(err) {
  const code = err.code || "";
  const messages = {
    "auth/invalid-email":             "El email no es válido.",
    "auth/user-disabled":             "Esta cuenta fue deshabilitada.",
    "auth/user-not-found":            "No existe una cuenta con ese email.",
    "auth/wrong-password":            "Contraseña incorrecta.",
    "auth/email-already-in-use":      "Ya existe una cuenta con ese email.",
    "auth/weak-password":             "La contraseña debe tener al menos 6 caracteres.",
    "auth/network-request-failed":    "Sin conexión a internet. Revisá tu wifi.",
    "auth/too-many-requests":         "Demasiados intentos. Esperá unos minutos.",
    "auth/operation-not-allowed":     "Email/Password no está habilitado en Firebase Console (Authentication → Sign-in method).",
    "auth/invalid-credential":        "Email o contraseña incorrectos."
  };
  return messages[code] || err.message || "Error desconocido.";
}
