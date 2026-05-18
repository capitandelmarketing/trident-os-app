// db.js — Firebase Firestore wrapper para Trident OS v3
// Strategy: Firestore as primary · localStorage as offline fallback
// Custom database ID (no es "(default)") por ser proyecto creado por AI Studio.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const LS_KEY = "trident_os_clients_v1";

let app = null;
let db = null;
let firebaseReady = false;
let lastError = null;

export function initDB() {
  try {
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey || window.FIREBASE_CONFIG.apiKey.includes("PEGAR")) {
      throw new Error("FIREBASE_CONFIG no configurado en firebase-config.js");
    }
    app = getApps()[0] || initializeApp(window.FIREBASE_CONFIG);
    const dbId = window.FIREBASE_DATABASE_ID || "(default)";
    db = getFirestore(app, dbId);
    firebaseReady = true;
    console.log(`[db] Firebase initialized · projectId=${window.FIREBASE_CONFIG.projectId} · databaseId=${dbId}`);
    return { ok: true, mode: "firestore", databaseId: dbId };
  } catch (err) {
    lastError = err;
    firebaseReady = false;
    console.warn(`[db] Firebase init failed · fallback localStorage · ${err.message}`);
    return { ok: false, mode: "localStorage", error: err.message };
  }
}

export function dbStatus() {
  return {
    ready: firebaseReady,
    mode: firebaseReady ? "firestore" : "localStorage",
    databaseId: window.FIREBASE_DATABASE_ID || "(default)",
    projectId: window.FIREBASE_CONFIG?.projectId || "—",
    lastError: lastError?.message || null
  };
}

// ============ CLIENT CRUD ============

export async function saveClient(client) {
  client.updated_at = new Date().toISOString();
  if (!client.created_at) client.created_at = client.updated_at;
  if (!client.id) client.id = generateClientId(client);

  // Always write to localStorage (cache + fallback)
  saveClientLocal(client);

  // Try Firestore
  if (firebaseReady) {
    try {
      const ref = doc(db, "clients", client.id);
      await setDoc(ref, { ...client, _server_updated: serverTimestamp() });
      return { ok: true, mode: "firestore", id: client.id };
    } catch (err) {
      console.warn(`[db] saveClient firestore failed · ${err.message}`);
      lastError = err;
      return { ok: true, mode: "localStorage", id: client.id, warn: err.message };
    }
  }
  return { ok: true, mode: "localStorage", id: client.id };
}

export async function listClients() {
  if (firebaseReady) {
    try {
      const q = query(collection(db, "clients"), orderBy("updated_at", "desc"));
      const snap = await getDocs(q);
      const remote = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      // Refresh local cache from remote
      localStorage.setItem(LS_KEY, JSON.stringify(remote));
      return { ok: true, mode: "firestore", clients: remote };
    } catch (err) {
      console.warn(`[db] listClients firestore failed · using localStorage · ${err.message}`);
      lastError = err;
    }
  }
  return { ok: true, mode: "localStorage", clients: listClientsLocal() };
}

export async function getClient(id) {
  if (firebaseReady) {
    try {
      const snap = await getDoc(doc(db, "clients", id));
      if (snap.exists()) return { ok: true, mode: "firestore", client: { ...snap.data(), id: snap.id } };
    } catch (err) {
      console.warn(`[db] getClient firestore failed · ${err.message}`);
      lastError = err;
    }
  }
  const local = listClientsLocal().find(c => c.id === id);
  return local
    ? { ok: true, mode: "localStorage", client: local }
    : { ok: false, error: `Client ${id} not found` };
}

export async function deleteClient(id) {
  // Delete local
  const all = listClientsLocal().filter(c => c.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(all));

  if (firebaseReady) {
    try {
      await deleteDoc(doc(db, "clients", id));
      return { ok: true, mode: "firestore" };
    } catch (err) {
      console.warn(`[db] deleteClient firestore failed · ${err.message}`);
      lastError = err;
      return { ok: true, mode: "localStorage", warn: err.message };
    }
  }
  return { ok: true, mode: "localStorage" };
}

// ============ OUTPUTS (subcollection per client) ============

export async function saveOutput(clientId, pillarKey, output) {
  output.updated_at = new Date().toISOString();
  saveOutputLocal(clientId, pillarKey, output);

  if (firebaseReady) {
    try {
      const ref = doc(db, "clients", clientId, "outputs", pillarKey);
      await setDoc(ref, { ...output, _server_updated: serverTimestamp() });
      return { ok: true, mode: "firestore" };
    } catch (err) {
      console.warn(`[db] saveOutput firestore failed · ${err.message}`);
      lastError = err;
      return { ok: true, mode: "localStorage", warn: err.message };
    }
  }
  return { ok: true, mode: "localStorage" };
}

export async function listOutputs(clientId) {
  if (firebaseReady) {
    try {
      const snap = await getDocs(collection(db, "clients", clientId, "outputs"));
      const remote = snap.docs.map(d => ({ ...d.data(), pillar_key: d.id }));
      saveOutputsLocalAll(clientId, remote);
      return { ok: true, mode: "firestore", outputs: remote };
    } catch (err) {
      console.warn(`[db] listOutputs firestore failed · ${err.message}`);
      lastError = err;
    }
  }
  return { ok: true, mode: "localStorage", outputs: listOutputsLocal(clientId) };
}

function lsOutputsKey(clientId) { return `trident_os_outputs_v1__${clientId}`; }

function listOutputsLocal(clientId) {
  try { return JSON.parse(localStorage.getItem(lsOutputsKey(clientId)) || "[]"); }
  catch { return []; }
}

function saveOutputLocal(clientId, pillarKey, output) {
  const all = listOutputsLocal(clientId).filter(o => o.pillar_key !== pillarKey);
  all.unshift({ ...output, pillar_key: pillarKey });
  localStorage.setItem(lsOutputsKey(clientId), JSON.stringify(all));
}

function saveOutputsLocalAll(clientId, outputs) {
  localStorage.setItem(lsOutputsKey(clientId), JSON.stringify(outputs));
}

// ============ LOCAL STORAGE HELPERS ============

function listClientsLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveClientLocal(client) {
  const all = listClientsLocal().filter(c => c.id !== client.id);
  all.unshift(client);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

function generateClientId(client) {
  const name = (client.brief?.realtor?.full_name || "client").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);
  const ts = Date.now().toString(36);
  return `${name || "client"}-${ts}`;
}
